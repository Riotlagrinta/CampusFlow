import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";

const rateLimit = new Map();
const LIMIT = 5; 
const WINDOW_SIZE = 10 * 60 * 1000; 

// Utiliser AUTH_SECRET pour signer le token (doit être dans .env)
const getSecretKey = () => {
    const secret = process.env.AUTH_SECRET || "fallback_secret_for_dev_only";
    return new TextEncoder().encode(secret);
};

export async function POST(req: Request) {
  try {
    const ip = req.headers.get('x-forwarded-for') || 'anonymous';
    const now = Date.now();
    const requests = rateLimit.get(ip) || [];

    const recentRequests = requests.filter((timestamp: number) => now - timestamp < WINDOW_SIZE);
    if (recentRequests.length >= LIMIT) {
      return NextResponse.json({ error: 'Trop de tentatives. Réessayez dans 10 min.' }, { status: 429 });
    }
    recentRequests.push(now);
    rateLimit.set(ip, recentRequests);

    const { identifier, password } = await req.json(); // Changé 'email' par 'identifier'

    if (!identifier || !password) {
      return NextResponse.json({ error: 'Email/Téléphone et mot de passe requis' }, { status: 400 });
    }

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: identifier },
          { phone: identifier }
        ]
      },
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

    // --- GENERATION DU JWT POUR MOBILE ---
    // On expire dans 30 jours pour le confort mobile
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
      token, // Envoyer le token au mobile
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
