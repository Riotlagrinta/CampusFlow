import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";
import { checkRateLimit, getRateLimitKey } from '@/lib/rateLimit';

// CRITICAL FIX: plus de fallback faible — AUTH_SECRET est obligatoire.
const getSecretKey = () => {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET manquant dans les variables d\'environnement.');
  return new TextEncoder().encode(secret);
};

export async function POST(req: Request) {
  try {
    const key = getRateLimitKey(req);
    const { allowed, retryAfterMs } = checkRateLimit(key, 5, 10 * 60 * 1000);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Trop de tentatives. Réessayez dans 10 min.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } }
      );
    }

    const { identifier, password } = await req.json();

    if (!identifier || !password) {
      return NextResponse.json({ error: 'Email/Téléphone et mot de passe requis' }, { status: 400 });
    }

    const user = await prisma.user.findFirst({
      where: { OR: [{ email: identifier }, { phone: identifier }] },
      include: { field: true, academicLevel: true }
    });

    if (!user) {
      return NextResponse.json({ error: 'Identifiants invalides' }, { status: 401 });
    }

    if (!user.isActive) {
      return NextResponse.json({ error: 'Compte non activé. Vérifiez vos messages (WhatsApp/Email).' }, { status: 403 });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return NextResponse.json({ error: 'Identifiants invalides' }, { status: 401 });
    }

    const token = await new SignJWT({
      id: user.id,
      email: user.email,
      role: user.role
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('30d')
      .sign(getSecretKey());

    return NextResponse.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        field: user.field?.name,
        level: user.academicLevel?.name
      }
    });
  } catch (error) {
    console.error('Erreur API Login:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
