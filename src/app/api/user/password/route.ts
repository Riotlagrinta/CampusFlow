import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from "@/../auth";
import bcrypt from "bcryptjs";
import { sendEmail } from '@/lib/mail';

export async function PATCH(req: Request) {
  try {
    const session = await auth();
    if (!session || !session.user?.email) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const { oldPassword, newPassword } = await req.json();

    if (!oldPassword || !newPassword || newPassword.length < 8) {
      return NextResponse.json({ error: 'Le nouveau mot de passe doit contenir au moins 8 caractères' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (!user) {
      return NextResponse.json({ error: 'Utilisateur non trouvé' }, { status: 404 });
    }

    const passwordMatch = await bcrypt.compare(oldPassword, user.password);
    if (!passwordMatch) {
      return NextResponse.json({ error: 'L\'ancien mot de passe est incorrect' }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { email: session.user.email },
      data: { password: hashedPassword }
    });

    // Envoyer un email de confirmation de sécurité
    try {
      await sendEmail({
        to: user.email,
        subject: '🔐 Votre mot de passe a été modifié - DefiTech Hub',
        html: `
          <div style="font-family: sans-serif; padding: 24px; max-width: 480px; margin: auto; color: #333;">
            <h2 style="color: #2563eb;">Changement de mot de passe</h2>
            <p>Bonjour <strong>${user.firstName || ''}</strong>,</p>
            <p>Votre mot de passe a été modifié avec succès le <strong>${new Date().toLocaleString('fr-FR')}</strong>.</p>
            <div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 12px 16px; border-radius: 6px; margin: 20px 0;">
              <p style="margin: 0; font-size: 14px; color: #b91c1c;">⚠️ Si vous n'êtes pas à l'origine de cette modification, contactez immédiatement un administrateur.</p>
            </div>
            <p style="font-size: 12px; color: #9ca3af; margin-top: 24px;">DefiTech Student Hub</p>
          </div>
        `
      });
    } catch (mailError) {
      console.error('Erreur email confirmation password:', mailError);
      // On ne bloque pas le succès si l'email échoue
    }

    return NextResponse.json({ success: true, message: 'Mot de passe mis à jour' });
  } catch (error) {
    console.error('Erreur password:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
