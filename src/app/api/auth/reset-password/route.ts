import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { safeCompare } from '@/lib/rateLimit';
import {
  BCRYPT_COST,
  MAX_OTP_ATTEMPTS,
  checkLimits,
  clientIp,
  firstIssue,
  identifierKey,
  identifierSchema,
  identifierWhere,
  otpCodeSchema,
  passwordSchema,
  rateKey,
  tooManyRequests,
} from '@/lib/authHelpers';

const resetSchema = z.object({
  identifier: identifierSchema,
  code: otpCodeSchema,
  newPassword: passwordSchema,
});

// Message unique pour tous les échecs (compte inconnu, code faux, expiré, épuisé).
const INVALID_CODE = { error: 'Code incorrect ou expiré. Veuillez refaire une demande.' };

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = resetSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: firstIssue(parsed.error, 'Tous les champs sont requis') }, { status: 400 });
    }
    const { identifier, code, newPassword } = parsed.data;

    const limit = await checkLimits([
      { key: rateKey('reset:ip', clientIp(req)), limit: 20, windowMs: 15 * 60 * 1000 },
      { key: rateKey('reset:id', identifierKey(identifier)), limit: 10, windowMs: 15 * 60 * 1000 },
    ]);
    if (!limit.allowed) return tooManyRequests(limit.retryAfterMs);

    const user = await prisma.user.findFirst({
      where: { ...identifierWhere(identifier), isActive: true },
      select: { id: true, resetCode: true, resetCodeExpires: true },
    });

    const storedCode = user?.resetCode;
    if (!user || !storedCode) {
      return NextResponse.json(INVALID_CODE, { status: 400 });
    }

    // Code expiré : on l'invalide.
    if (!user.resetCodeExpires || user.resetCodeExpires <= new Date()) {
      await prisma.user.updateMany({
        where: { id: user.id, resetCode: storedCode },
        data: { resetCode: null, resetCodeExpires: null, resetAttempts: 0 },
      });
      return NextResponse.json(INVALID_CODE, { status: 400 });
    }

    // L'essai est compté AVANT la comparaison (incrément conditionnel atomique) : des requêtes
    // parallèles ne peuvent pas dépasser le plafond de tentatives.
    const counted = await prisma.user.updateMany({
      where: { id: user.id, resetCode: storedCode, resetAttempts: { lt: MAX_OTP_ATTEMPTS } },
      data: { resetAttempts: { increment: 1 } },
    });
    if (counted.count !== 1) {
      await prisma.user.updateMany({
        where: { id: user.id, resetAttempts: { gte: MAX_OTP_ATTEMPTS } },
        data: { resetCode: null, resetCodeExpires: null },
      });
      return NextResponse.json(INVALID_CODE, { status: 400 });
    }

    if (!safeCompare(storedCode, code)) {
      // Cinquième échec : le code est détruit.
      await prisma.user.updateMany({
        where: { id: user.id, resetAttempts: { gte: MAX_OTP_ATTEMPTS } },
        data: { resetCode: null, resetCodeExpires: null },
      });
      return NextResponse.json(INVALID_CODE, { status: 400 });
    }

    // Le hachage (coûteux) n'a lieu qu'après validation du code.
    const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_COST);

    // Usage unique : la consommation du code est conditionnelle. `passwordChangedAt` révoque toutes
    // les sessions ouvertes avant ce changement (voir getAuthUser).
    const consumed = await prisma.user.updateMany({
      where: { id: user.id, resetCode: storedCode, resetCodeExpires: { gt: new Date() } },
      data: {
        password: hashedPassword,
        passwordChangedAt: new Date(),
        resetCode: null,
        resetCodeExpires: null,
        resetAttempts: 0,
      },
    });
    if (consumed.count !== 1) {
      return NextResponse.json(INVALID_CODE, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erreur reset-password:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
