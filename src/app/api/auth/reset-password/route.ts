import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from "bcryptjs";
import { checkRateLimit, getRateLimitKey, safeCompare } from '@/lib/rateLimit';

export async function POST(req: Request) {
  try {
    const key = getRateLimitKey(req);
    const { allowed, retryAfterMs } = checkRateLimit(key, 5, 10 * 60 * 1000);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Trop de tentatives. Veuillez réessayer plus tard.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } }
      );
    }

    const { identifier, code, newPassword } = await req.json();

    if (!identifier || !code || !newPassword) {
      return NextResponse.json({ error: 'Tous les champs sont requis' }, { status: 400 });
    }

    if (newPassword.length < 8) {
      return NextResponse.json({ error: 'Mot de passe trop court (minimum 8 caractères)' }, { status: 400 });
    }

    const user = await prisma.user.findFirst({
      where: { OR: [{ email: identifier }, { phone: identifier }] }
    });

    // HIGH FIX: comparaison en temps constant pour éviter les timing attacks
    const codeValid = user?.resetCode ? safeCompare(user.resetCode, code) : false;
    if (!user || !codeValid) {
      return NextResponse.json({ error: 'Code de validation incorrect' }, { status: 400 });
    }

    if (!user.resetCodeExpires || new Date() > user.resetCodeExpires) {
      return NextResponse.json({ error: 'Code expiré. Veuillez refaire une demande.' }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword, resetCode: null, resetCodeExpires: null }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erreur reset-password:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
