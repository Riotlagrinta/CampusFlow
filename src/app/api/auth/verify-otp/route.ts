import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const rateLimit = new Map();
const LIMIT = 5; // 5 requêtes
const WINDOW_SIZE = 10 * 60 * 1000; // 10 minutes

export async function POST(req: Request) {
  try {
    const ip = req.headers.get('x-forwarded-for') || 'anonymous'; // Obtenir l'adresse IP
    const now = Date.now();
    const requests = rateLimit.get(ip) || [];

    // Filtrer les requêtes anciennes
    const recentRequests = requests.filter((timestamp: number) => now - timestamp < WINDOW_SIZE);

    if (recentRequests.length >= LIMIT) {
      return NextResponse.json({ error: 'Trop de tentatives. Veuillez réessayer plus tard.' }, { status: 429 });
    }

    recentRequests.push(now);
    rateLimit.set(ip, recentRequests);

    const { email, code } = await req.json();

    if (!email || !code) {
      return NextResponse.json({ error: 'Données manquantes' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 });
    }

    if (user.otpCode !== code) {
      return NextResponse.json({ error: 'Code de validation incorrect' }, { status: 400 });
    }

    // Vérifier l'expiration du code
    if (user.otpCodeExpires && user.otpCodeExpires < new Date()) {
      return NextResponse.json({ error: 'Le code a expiré. Veuillez en demander un nouveau.' }, { status: 400 });
    }

    // Activer le compte et vider le code OTP
    await prisma.user.update({
      where: { email },
      data: {
        isActive: true,
        otpCode: null,
        otpCodeExpires: null
      }
    });

    return NextResponse.json({ success: true, message: 'Compte activé avec succès !' });
  } catch (error) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
