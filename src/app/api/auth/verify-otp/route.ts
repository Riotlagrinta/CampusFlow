import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { safeCompare } from '@/lib/rateLimit';
import {
  MAX_OTP_ATTEMPTS,
  MAX_REFERRAL_BONUSES,
  REFERRAL_BONUS,
  checkLimits,
  clientIp,
  identifierKey,
  identifierSchema,
  identifierWhere,
  otpCodeSchema,
  rateKey,
  tooManyRequests,
} from '@/lib/authHelpers';

const verifySchema = z.object({
  identifier: identifierSchema,
  code: otpCodeSchema,
});

// Message unique pour tous les échecs : on ne distingue ni compte inconnu, ni compte déjà
// actif, ni code faux, ni code expiré.
const INVALID_CODE = {
  error: 'Code de validation incorrect ou expiré. S\'il a expiré, recommencez l\'inscription avec les mêmes informations pour en recevoir un nouveau.',
};

class ActivationRaceError extends Error {}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = verifySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Email ou téléphone et code à 6 chiffres requis' }, { status: 400 });
    }
    const { identifier, code } = parsed.data;

    const limit = await checkLimits([
      { key: rateKey('otp:ip', clientIp(req)), limit: 20, windowMs: 15 * 60 * 1000 },
      { key: rateKey('otp:id', identifierKey(identifier)), limit: 10, windowMs: 15 * 60 * 1000 },
    ]);
    if (!limit.allowed) return tooManyRequests(limit.retryAfterMs);

    const user = await prisma.user.findFirst({
      where: { ...identifierWhere(identifier), isActive: false },
      select: { id: true, otpCode: true, otpCodeExpires: true, referredById: true },
    });

    const storedCode = user?.otpCode;
    if (!user || !storedCode) {
      return NextResponse.json(INVALID_CODE, { status: 400 });
    }

    // Code expiré : on l'invalide.
    if (!user.otpCodeExpires || user.otpCodeExpires <= new Date()) {
      await prisma.user.updateMany({
        where: { id: user.id, otpCode: storedCode },
        data: { otpCode: null, otpCodeExpires: null, otpAttempts: 0 },
      });
      return NextResponse.json(INVALID_CODE, { status: 400 });
    }

    // L'essai est compté AVANT la comparaison (incrément conditionnel atomique) : des requêtes
    // parallèles ne peuvent pas dépasser le plafond de tentatives.
    const counted = await prisma.user.updateMany({
      where: { id: user.id, otpCode: storedCode, otpAttempts: { lt: MAX_OTP_ATTEMPTS } },
      data: { otpAttempts: { increment: 1 } },
    });
    if (counted.count !== 1) {
      await prisma.user.updateMany({
        where: { id: user.id, otpAttempts: { gte: MAX_OTP_ATTEMPTS } },
        data: { otpCode: null, otpCodeExpires: null },
      });
      return NextResponse.json(INVALID_CODE, { status: 400 });
    }

    if (!safeCompare(storedCode, code)) {
      // Cinquième échec : le code est détruit.
      await prisma.user.updateMany({
        where: { id: user.id, otpAttempts: { gte: MAX_OTP_ATTEMPTS } },
        data: { otpCode: null, otpCodeExpires: null },
      });
      return NextResponse.json(INVALID_CODE, { status: 400 });
    }

    const firstStepBadge = await prisma.badge.findUnique({ where: { slug: 'first-step' }, select: { id: true } });

    // Activation à usage unique + bonus de parrainage, tout ou rien. Le bonus n'est versé
    // qu'ici, jamais à l'inscription, et une seule fois (l'activation est conditionnelle).
    try {
      await prisma.$transaction(async (tx) => {
        const activated = await tx.user.updateMany({
          where: { id: user.id, isActive: false, otpCode: storedCode, otpCodeExpires: { gt: new Date() } },
          data: { isActive: true, otpCode: null, otpCodeExpires: null, otpAttempts: 0 },
        });
        if (activated.count !== 1) throw new ActivationRaceError();

        if (user.referredById) {
          // Écriture sans effet sur la ligne du parrain : elle la verrouille jusqu'à la fin de la
          // transaction. Si plusieurs de ses filleuls sont activés en même temps, leurs transactions
          // passent donc l'une après l'autre et le comptage ci-dessous voit les activations déjà
          // validées (sans verrou, chacune ne verrait qu'elle-même et le plafond serait contournable).
          const referrer = await tx.user.updateMany({
            where: { id: user.referredById, isActive: true },
            data: { aiBonusRequests: { increment: 0 } },
          });
          if (referrer.count === 1) {
            // Le filleul vient d'être activé plus haut : il fait partie du décompte. Le parrain est
            // payé pour ses MAX_REFERRAL_BONUSES premiers filleuls activés seulement ; le filleul,
            // lui, garde toujours son propre bonus.
            const activatedReferrals = await tx.user.count({
              where: { referredById: user.referredById, isActive: true },
            });
            if (activatedReferrals <= MAX_REFERRAL_BONUSES) {
              await tx.user.update({
                where: { id: user.referredById },
                data: { aiBonusRequests: { increment: REFERRAL_BONUS } },
              });
            }
            await tx.user.update({
              where: { id: user.id },
              data: { aiBonusRequests: { increment: REFERRAL_BONUS } },
            });
          }
        }

        if (firstStepBadge) {
          await tx.userBadge.createMany({
            data: [{ userId: user.id, badgeId: firstStepBadge.id }],
            skipDuplicates: true,
          });
        }
      });
    } catch (error) {
      if (error instanceof ActivationRaceError) {
        return NextResponse.json(INVALID_CODE, { status: 400 });
      }
      throw error;
    }

    return NextResponse.json({ success: true, message: 'Compte activé avec succès !' });
  } catch (error) {
    console.error('Erreur verify-otp:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
