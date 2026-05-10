import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/mail';
import { sendWhatsAppMessage } from '@/lib/whatsapp';
import { checkRateLimit, getRateLimitKey } from '@/lib/rateLimit';

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

    const { identifier } = await req.json();
    if (!identifier) {
      return NextResponse.json({ error: 'Email ou numéro de téléphone requis' }, { status: 400 });
    }

    const user = await prisma.user.findFirst({
      where: { OR: [{ email: identifier }, { phone: identifier }] }
    });

    // Ne pas révéler si le compte existe ou non
    if (!user) {
      return NextResponse.json({ success: true, message: 'Si ce compte existe, un code a été envoyé.' });
    }

    // HIGH FIX: Math.random() est prédictible — on utilise crypto.randomInt()
    const { randomInt } = await import('crypto');
    const resetCode = randomInt(100000, 999999).toString();
    const expires = new Date(Date.now() + 15 * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: { resetCode, resetCodeExpires: expires }
    });

    if (user.phone) {
      const whatsappMsg = `*Récupération Student Hub* 🔐\n\nBonjour ${user.firstName || ''} ! Voici votre code de sécurité : *${resetCode}*\n\nCe code expire dans 15 minutes.`;
      await sendWhatsAppMessage(user.phone, whatsappMsg);
    }

    if (user.email) {
      try {
        await sendEmail({
          to: user.email,
          subject: `Réinitialisation de votre mot de passe`,
          html: `
            <div style="font-family: sans-serif; padding: 20px; color: #333; text-align: center;">
              <h1 style="color: #2563eb;">Récupération de compte</h1>
              <p>Voici votre code de sécurité :</p>
              <div style="font-size: 32px; font-weight: bold; letter-spacing: 5px; padding: 20px; background: #fef2f2; border: 2px solid #fee2e2; border-radius: 15px; display: inline-block; margin: 20px 0; color: #dc2626;">
                ${resetCode}
              </div>
              <p style="font-size: 14px; color: #666;">Ce code expirera dans <strong>15 minutes</strong>.</p>
            </div>
          `
        });
      } catch (mailError) {
        console.error('Échec envoi mail réinitialisation:', mailError);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erreur forgot-password:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
