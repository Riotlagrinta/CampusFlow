import { NextResponse } from 'next/server';
import { z } from 'zod';
import { SignJWT } from 'jose';
import { prisma } from '@/lib/prisma';
import { deliveryChannelsPhrase } from '@/lib/whatsapp';
import {
  checkLimits,
  clientIp,
  identifierKey,
  identifierSchema,
  identifierWhere,
  rateKey,
  tooManyRequests,
  verifyPassword,
} from '@/lib/authHelpers';

const loginSchema = z.object({
  identifier: identifierSchema,
  password: z.string().min(1).max(200),
});

// AUTH_SECRET est obligatoire : aucune valeur de repli.
function getSecretKey(): Uint8Array | null {
  const secret = process.env.AUTH_SECRET;
  return secret ? new TextEncoder().encode(secret) : null;
}

export async function POST(req: Request) {
  try {
    const secretKey = getSecretKey();
    if (!secretKey) {
      console.error('Erreur API Login : AUTH_SECRET manquant dans les variables d\'environnement.');
      return NextResponse.json(
        { error: 'Service d\'authentification indisponible : configuration serveur incomplète.' },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => null);
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Email ou téléphone et mot de passe requis' }, { status: 400 });
    }
    const { identifier, password } = parsed.data;

    // Même clés que NextAuth (auth.ts) : web et mobile partagent le même budget d'essais.
    const limit = await checkLimits([
      { key: rateKey('login:ip', clientIp(req)), limit: 30, windowMs: 10 * 60 * 1000 },
      { key: rateKey('login:id', identifierKey(identifier)), limit: 8, windowMs: 10 * 60 * 1000 },
    ]);
    if (!limit.allowed) {
      return tooManyRequests(limit.retryAfterMs, 'Trop de tentatives. Réessayez dans quelques minutes.');
    }

    const user = await prisma.user.findFirst({
      where: identifierWhere(identifier),
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        password: true,
        isActive: true,
        field: { select: { name: true } },
        academicLevel: { select: { name: true } },
      },
    });

    // Réponse 401 identique que le compte existe ou non (la comparaison de hash est toujours faite).
    const passwordMatch = await verifyPassword(password, user?.password);
    if (!user || !passwordMatch) {
      return NextResponse.json({ error: 'Identifiants invalides' }, { status: 401 });
    }

    // Cette information n'est donnée qu'à celui qui connaît le mot de passe.
    if (!user.isActive) {
      return NextResponse.json(
        { error: `Compte non activé. Entrez le code de validation envoyé ${deliveryChannelsPhrase()}.` },
        { status: 403 }
      );
    }

    const token = await new SignJWT({ id: user.id, email: user.email, role: user.role })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.id)
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(secretKey);

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
        level: user.academicLevel?.name,
      },
    });
  } catch (error) {
    console.error('Erreur API Login:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
