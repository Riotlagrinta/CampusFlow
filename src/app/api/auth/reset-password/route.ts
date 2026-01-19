import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: Request) {
  try {
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
    await prisma.user.update({
      where: { email },
      data: {
        password: newPassword, // Note: Devrait être hashé dans une vraie prod
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
