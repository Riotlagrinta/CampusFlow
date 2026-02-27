import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from "bcryptjs"; // Importez bcryptjs

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

    const { email, code, newPassword } = await req.json();

    if (!email || !code || !newPassword) {
      return NextResponse.json({ error: 'Tous les champs sont requis' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || user.resetCode !== code) {
      return NextResponse.json({ error: 'Code de validation incorrect' }, { status: 400 });
    }

    // Vérifier l'expiration
    if (!user.resetCodeExpires || new Date() > user.resetCodeExpires) {
      return NextResponse.json({ error: 'Code expiré. Veuillez refaire une demande.' }, { status: 400 });
    }

    // Mise à jour du mot de passe et nettoyage du code de reset
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { email },
      data: {
        password: hashedPassword,
        resetCode: null,
        resetCodeExpires: null
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erreur reset-password:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
