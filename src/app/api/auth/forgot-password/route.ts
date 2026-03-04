import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/mail';
import { sendWhatsAppMessage } from '@/lib/whatsapp';

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

    const { email } = await req.json();

    if (!email) {
      return NextResponse.json({ error: 'Email requis' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email } });

    // Sécurité : Ne pas révéler si l'email existe ou non
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

    // --- ENVOI DU CODE (WhatsApp + Email) ---
    
    // 1. WhatsApp (si dispo)
    if (user.phone) {
        const whatsappMsg = `*Récupération Student Hub* 🔐\n\nBonjour ${user.firstName || ''} ! Voici votre code de sécurité pour réinitialiser votre mot de passe : *${resetCode}*\n\nCe code expire dans 15 minutes.`;
        await sendWhatsAppMessage(user.phone, whatsappMsg);
    }

    // 2. Email (Roue de secours)
    try {
      await sendEmail({
        to: email,
        subject: `Réinitialisation de votre mot de passe - ${resetCode}`,
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
    } catch (mailError: any) {
      console.error('❌ ÉCHEC envoi mail réinitialisation:', mailError.message);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erreur forgot-password:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
