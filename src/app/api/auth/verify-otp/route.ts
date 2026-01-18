import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: Request) {
  try {
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

    // Activer le compte et vider le code OTP
    await prisma.user.update({
      where: { email },
      data: {
        isActive: true,
        otpCode: null
      }
    });

    return NextResponse.json({ success: true, message: 'Compte activé avec succès !' });
  } catch (error) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
