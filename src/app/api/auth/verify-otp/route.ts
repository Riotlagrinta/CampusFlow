import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
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

    const { identifier, code } = await req.json();
    if (!identifier || !code) {
      return NextResponse.json({ error: 'Données manquantes' }, { status: 400 });
    }

    const user = await prisma.user.findFirst({
      where: { OR: [{ email: identifier }, { phone: identifier }] }
    });

    if (!user) {
      return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 });
    }

    // HIGH FIX: comparaison en temps constant pour éviter les timing attacks
    const codeValid = user.otpCode ? safeCompare(user.otpCode, code) : false;
    if (!codeValid) {
      return NextResponse.json({ error: 'Code de validation incorrect' }, { status: 400 });
    }

    if (user.otpCodeExpires && user.otpCodeExpires < new Date()) {
      return NextResponse.json({ error: 'Le code a expiré. Veuillez en demander un nouveau.' }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { isActive: true, otpCode: null, otpCodeExpires: null }
    });

    return NextResponse.json({ success: true, message: 'Compte activé avec succès !' });
  } catch (error) {
    console.error('Erreur verify-otp:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
