import { NextResponse, after } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { captchaFailure, verifyCaptcha } from '@/lib/captcha';
import { sendEmail } from '@/lib/mail';
import { deliveryChannelsPhrase, isWhatsAppConfigured, sendWhatsAppMessage } from '@/lib/whatsapp';
import {
  checkLimits,
  clientIp,
  generateOtp,
  identifierKey,
  identifierSchema,
  identifierWhere,
  rateKey,
  safeErrorSummary,
  tooManyRequests,
} from '@/lib/authHelpers';

const forgotSchema = z.object({
  identifier: identifierSchema,
  // Jeton anti-robot (Cloudflare Turnstile), exigé seulement quand le CAPTCHA est configuré.
  captchaToken: z.unknown().optional(), // validé par verifyCaptcha (type, longueur)
});

// Réponse identique que le compte existe ou non. Le message annonce les canaux réels
// (« par email » seulement tant que WhatsApp n'est pas configuré).
function neutralResponse() {
  return {
    success: true,
    message: `Si ce compte existe, un code de sécurité vient d'être envoyé ${deliveryChannelsPhrase()}.`,
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = forgotSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Email ou numéro de téléphone requis' }, { status: 400 });
    }
    const { identifier } = parsed.data;

    // ORDRE : limite par IP, puis anti-robot, puis limites par identifiant. Ces dernières ne sont
    // consommées qu'après le CAPTCHA : sans cela, trois requêtes sans jeton avec l'identifiant d'une
    // victime (un administrateur, par exemple) épuiseraient son quota et l'empêcheraient de récupérer son
    // compte, en boucle toutes les 15 minutes. La réponse ne dépend pas de l'existence du compte.
    const ipLimit = await checkLimits([
      { key: rateKey('forgot:ip', clientIp(req)), limit: 10, windowMs: 15 * 60 * 1000 },
    ]);
    if (!ipLimit.allowed) return tooManyRequests(ipLimit.retryAfterMs);

    const captcha = await verifyCaptcha(parsed.data.captchaToken, clientIp(req));
    if (!captcha.ok) {
      const failure = captchaFailure(captcha.reason);
      return NextResponse.json(failure.body, { status: failure.status });
    }

    const limit = await checkLimits([
      { key: rateKey('forgot:id', identifierKey(identifier)), limit: 3, windowMs: 15 * 60 * 1000 },
      // Chaque nouveau code remet le compteur d'essais à zéro : on plafonne le nombre de codes par jour.
      { key: rateKey('forgot:day', identifierKey(identifier)), limit: 10, windowMs: 24 * 60 * 60 * 1000 },
    ]);
    if (!limit.allowed) return tooManyRequests(limit.retryAfterMs);


    // Tout le travail dépendant de l'existence du compte (écriture + envois) est fait après
    // la réponse : le temps de réponse ne permet pas de deviner si l'identifiant existe.
    after(async () => {
      try {
        // Un compte non activé doit d'abord valider son code d'inscription.
        const user = await prisma.user.findFirst({
          where: { ...identifierWhere(identifier), isActive: true },
          select: { id: true, email: true, phone: true, firstName: true },
        });
        if (!user) return;

        const resetCode = generateOtp();
        await prisma.user.update({
          where: { id: user.id },
          data: {
            resetCode,
            resetCodeExpires: new Date(Date.now() + 15 * 60 * 1000),
            resetAttempts: 0,
          },
        });

        // WhatsApp seulement s'il est configuré : sinon le code part uniquement par email.
        const whatsappEnabled = isWhatsAppConfigured();

        const emailHtml = `
          <div style="font-family: sans-serif; padding: 20px; color: #333; text-align: center;">
            <h1 style="color: #2563eb;">Récupération de compte</h1>
            <p>Voici votre code de sécurité :</p>
            <div style="font-size: 32px; font-weight: bold; letter-spacing: 5px; padding: 20px; background: #fef2f2; border: 2px solid #fee2e2; border-radius: 15px; display: inline-block; margin: 20px 0; color: #dc2626;">
              ${resetCode}
            </div>
            <p style="font-size: 14px; color: #666;">Ce code expirera dans <strong>15 minutes</strong>. Ne le communiquez à personne. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.</p>
          </div>
        `;

        const [whatsappSent, emailSent] = await Promise.all([
          whatsappEnabled && user.phone
            ? sendWhatsAppMessage(
                user.phone,
                `*Récupération Student Hub* 🔐\n\nBonjour ${user.firstName || ''} ! Voici votre code de sécurité : *${resetCode}*\n\nCe code expire dans 15 minutes. Ne le communiquez à personne. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.`
              )
            : Promise.resolve(false),
          user.email
            ? sendEmail({ to: user.email, subject: 'Réinitialisation de votre mot de passe', html: emailHtml })
            : Promise.resolve(false),
        ]);

        if (!whatsappSent && !emailSent) {
          console.error('forgot-password : aucun canal n\'a livré le code', { userId: user.id });
        }
      } catch (error) {
        console.error('Erreur forgot-password (traitement différé):', safeErrorSummary(error));
      }
    });

    return NextResponse.json(neutralResponse());
  } catch (error) {
    console.error('Erreur forgot-password:', safeErrorSummary(error));
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
