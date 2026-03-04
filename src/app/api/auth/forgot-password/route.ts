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

    const { identifier } = await req.json(); // Changé 'email' par 'identifier'

    if (!identifier) {
      return NextResponse.json({ error: 'Email ou numéro de téléphone requis' }, { status: 400 });
    }

    // Rechercher par email OU téléphone
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: identifier },
          { phone: identifier }
        ]
      }
    });

    // Sécurité : Ne pas révéler si l'utilisateur existe ou non
    if (!user) {
      return NextResponse.json({ success: true, message: 'Si ce compte existe, un code a été envoyé.' });
    }

    // Générer un code à 6 chiffres
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await prisma.user.update({
      where: { id: user.id }, // Utiliser l'ID unique
      data: { resetCode, resetCodeExpires: expires }
    });

    // --- ENVOI DU CODE (WhatsApp + Email) ---
    
    // 1. WhatsApp (si dispo)
    if (user.phone) {
        const whatsappMsg = `*Récupération Student Hub* 🔐\n\nBonjour ${user.firstName || ''} ! Voici votre code de sécurité pour réinitialiser votre mot de passe : *${resetCode}*\n\nCe code expire dans 15 minutes.`;
        await sendWhatsAppMessage(user.phone, whatsappMsg);
    }

    // 2. Email (Roue de secours)
    if (user.email) {
      try {
        await sendEmail({
          to: user.email,
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
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erreur forgot-password:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
