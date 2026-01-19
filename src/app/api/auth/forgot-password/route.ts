import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Resend } from 'resend';

export async function POST(req: Request) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json({ error: 'Email requis' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email } });

    // Sécurité : Ne pas révéler si l'email existe ou non pour éviter le brute-force d'emails
    if (!user) {
      return NextResponse.json({ success: true, message: 'Si cet email existe, un code a été envoyé.' });
    }

    // Générer un code à 6 chiffres
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await prisma.user.update({
      where: { email },
      data: { resetCode, resetCodeExpires: expires }
    });

    if (process.env.RESEND_API_KEY) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: 'StudentHub <onboarding@resend.dev>',
        to: email,
        subject: `Réinitialisation de votre mot de passe - ${resetCode}`,
        html: `
          <div style="font-family: sans-serif; padding: 20px; color: #333; text-align: center;">
            <h1 style="color: #2563eb;">Récupération de compte</h1>
            <p>Vous avez demandé la réinitialisation de votre mot de passe. Voici votre code de sécurité :</p>
            <div style="font-size: 32px; font-weight: bold; letter-spacing: 5px; padding: 20px; background: #fef2f2; border: 2px solid #fee2e2; border-radius: 15px; display: inline-block; margin: 20px 0; color: #dc2626;">
              ${resetCode}
            </div>
            <p style="font-size: 14px; color: #666;">Ce code expirera dans <strong>15 minutes</strong>.</p>
            <p style="font-size: 12px; color: #999; margin-top: 20px;">Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>
          </div>
        `
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erreur forgot-password:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
