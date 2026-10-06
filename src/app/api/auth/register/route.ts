import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { captchaFailure, verifyCaptcha } from '@/lib/captcha';
import { escapeHtml, sendEmail } from '@/lib/mail';
import { deliveryChannelsPhrase, isWhatsAppConfigured, sendWhatsAppMessage } from '@/lib/whatsapp';
import {
  BCRYPT_COST,
  checkLimits,
  clientIp,
  firstIssue,
  generateOtp,
  isReservedEmail,
  isValidPhone,
  normalizePhone,
  passwordSchema,
  personNameSchema,
  rateKey,
  safeErrorSummary,
  tooManyRequests,
} from '@/lib/authHelpers';
import { checkRateLimitDb } from '@/lib/rateLimit';

const OTP_TTL_MS = 60 * 60 * 1000;

const idSchema = (label: string) =>
  z.string({ error: `${label} requis` }).trim().min(1, `${label} requis`).max(100, `${label} invalide`);

const registerSchema = z.object({
  email: z
    .string({ error: 'Adresse email requise' })
    .trim()
    .toLowerCase()
    .max(254, 'Adresse email trop longue')
    .pipe(z.email({ error: 'Adresse email invalide' })),
  phone: z
    .string({ error: 'Numéro de téléphone requis' })
    .trim()
    .max(30, 'Numéro de téléphone invalide')
    .transform(normalizePhone)
    .refine(isValidPhone, 'Numéro de téléphone invalide (format international, ex : 22890000000)'),
  firstName: personNameSchema('Prénom'),
  lastName: personNameSchema('Nom'),
  password: passwordSchema,
  fieldId: idSchema('Filière'),
  levelId: idSchema('Niveau'),
  referralCode: z.string().trim().max(32).nullish(),
  // Jeton anti-robot (Cloudflare Turnstile), exigé seulement quand le CAPTCHA est configuré.
  captchaToken: z.unknown().optional(), // validé par verifyCaptcha (type, longueur)
});

// Même réponse que le compte existe déjà ou non (pas d'énumération des comptes). Le message annonce
// les canaux réels : « par email » seulement tant que WhatsApp n'est pas configuré.
function neutralResponse() {
  return {
    success: true,
    message: `Si les informations sont valides, un code de validation vient d'être envoyé ${deliveryChannelsPhrase()}.`,
  };
}

function buildReferralCode(firstName: string): string {
  const prefix = firstName
    .normalize('NFD')
    .replace(/[^A-Za-z]/g, '')
    .substring(0, 3)
    .toUpperCase();
  return `${prefix || 'DEFI'}-${randomBytes(4).toString('hex').toUpperCase()}`;
}

// Le parrain doit être un compte actif ; le bonus n'est versé qu'à l'activation du filleul.
async function findReferrerId(
  db: Pick<typeof prisma, 'user'>,
  referralCode: string | null
): Promise<string | null> {
  if (!referralCode) return null;
  const referrer = await db.user.findFirst({
    where: { referralCode, isActive: true },
    select: { id: true },
  });
  return referrer?.id ?? null;
}

// Rappel ajouté à tous les messages contenant un code de validation d'inscription.
const OTP_WARNING = 'Ne communiquez ce code à personne. Si vous n\'avez pas demandé la création d\'un compte StudentHub, ignorez ce message.';

type NewUser = {
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  passwordHash: string;
  fieldId: string;
  levelId: string;
  referralCode: string | null;
  otpCode: string;
  otpCodeExpires: Date;
  reclaimIds: string[];
};

// Création du compte (et libération des préinscriptions expirées) dans une seule transaction.
// Renvoie null si l'email ou le téléphone a été pris entre-temps.
async function createPendingUser(input: NewUser): Promise<string | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const created = await prisma.$transaction(async (tx) => {
        if (input.reclaimIds.length > 0) {
          await tx.userBadge.deleteMany({ where: { userId: { in: input.reclaimIds } } });
          await tx.user.deleteMany({ where: { id: { in: input.reclaimIds }, isActive: false } });
        }

        const referredById = await findReferrerId(tx, input.referralCode);

        return tx.user.create({
          data: {
            email: input.email,
            phone: input.phone,
            firstName: input.firstName,
            lastName: input.lastName,
            password: input.passwordHash,
            fieldId: input.fieldId,
            academicLevelId: input.levelId,
            referredById,
            referralCode: buildReferralCode(input.firstName),
            isActive: false,
            otpCode: input.otpCode,
            otpCodeExpires: input.otpCodeExpires,
            otpAttempts: 0,
            xp: 0,
            level: 1,
            streak: 1,
          },
          select: { id: true },
        });
      });
      return created.id;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        // Collision sur le code de parrainage généré : on retente avec un autre code.
        if (JSON.stringify(error.meta?.target ?? '').includes('referralCode')) continue;
        return null;
      }
      throw error;
    }
  }
  throw new Error('Impossible de générer un code de parrainage unique');
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: firstIssue(parsed.error, 'Tous les champs sont requis') }, { status: 400 });
    }
    const { email, phone, firstName, lastName, password, fieldId, levelId } = parsed.data;
    const referralCode = parsed.data.referralCode?.toUpperCase() || null;

    // L'inscription déclenche l'envoi de messages à des adresses/numéros choisis par l'appelant.
    // ORDRE : limite par IP, puis anti-robot, puis limites par email et par numéro. Ces dernières ne
    // sont consommées qu'après le CAPTCHA : sans cela, des requêtes sans jeton suffiraient à épuiser
    // le quota d'une victime précise (son email ou son numéro) et à l'empêcher de s'inscrire.
    const ipLimit = await checkLimits([
      { key: rateKey('register:ip', clientIp(req)), limit: 10, windowMs: 60 * 60 * 1000 },
    ]);
    if (!ipLimit.allowed) {
      return tooManyRequests(ipLimit.retryAfterMs, "Trop de tentatives d'inscription. Réessayez plus tard.");
    }

    const captcha = await verifyCaptcha(parsed.data.captchaToken, clientIp(req));
    if (!captcha.ok) {
      const failure = captchaFailure(captcha.reason);
      return NextResponse.json(failure.body, { status: failure.status });
    }

    const limit = await checkLimits([
      { key: rateKey('register:email', email), limit: 5, windowMs: 60 * 60 * 1000 },
      { key: rateKey('register:phone', phone), limit: 3, windowMs: 60 * 60 * 1000 },
    ]);
    if (!limit.allowed) {
      return tooManyRequests(limit.retryAfterMs, "Trop de tentatives d'inscription. Réessayez plus tard.");
    }

    const [field, level] = await Promise.all([
      prisma.field.findUnique({ where: { id: fieldId }, select: { name: true } }),
      prisma.level.findUnique({ where: { id: levelId }, select: { id: true } }),
    ]);
    if (!field || !level) {
      return NextResponse.json({ error: 'Filière ou niveau invalide' }, { status: 400 });
    }

    // Toujours haché, même si le compte existe déjà : le temps de réponse ne l'indique pas.
    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

    const now = new Date();
    const conflicts = await prisma.user.findMany({
      where: {
        OR: [
          { email: { equals: email, mode: 'insensitive' } },
          { phone: { in: [phone, `+${phone}`] } },
        ],
      },
      select: { id: true, email: true, phone: true, isActive: true, otpCodeExpires: true },
    });

    // Adresse réservée (comptes système, domaines .invalid, admin@/support@/noreply@) : même réponse
    // que pour une adresse déjà prise, sans créer ni modifier quoi que ce soit. La requête ci-dessus
    // a été faite quand même pour que le temps de réponse ne distingue pas les deux cas.
    if (isReservedEmail(email)) return NextResponse.json(neutralResponse());

    // Un compte inactif sans date d'expiration de code est traité comme une pré-inscription expirée
    // (réclamable). Jamais pour un compte dont l'email est réservé : un compte système (inactif, sans
    // code) serait sinon supprimé puis recréé par n'importe qui.
    const isExpiredPending = (u: (typeof conflicts)[number]) =>
      !isReservedEmail(u.email) && !u.isActive && (!u.otpCodeExpires || u.otpCodeExpires <= now);

    const otpCode = generateOtp();
    const otpCodeExpires = new Date(Date.now() + OTP_TTL_MS);

    let createdUserId: string | null = null;

    if (conflicts.length === 0 || conflicts.every(isExpiredPending)) {
      // Nouveau compte (les préinscriptions expirées qui bloquaient l'email/le numéro sont libérées).
      createdUserId = await createPendingUser({
        email,
        phone,
        firstName,
        lastName,
        passwordHash,
        fieldId,
        levelId,
        referralCode,
        otpCode,
        otpCodeExpires,
        reclaimIds: conflicts.map((u) => u.id),
      });
      if (!createdUserId) return NextResponse.json(neutralResponse());
    } else {
      const [only] = conflicts;
      const samePending =
        conflicts.length === 1 &&
        !only.isActive &&
        only.email.toLowerCase() === email &&
        (only.phone === phone || only.phone === `+${phone}`);

      if (!samePending) {
        // Un compte actif (ou une préinscription d'une autre personne) utilise déjà ces
        // coordonnées : réponse neutre, et le titulaire de l'email est prévenu.
        const holder = conflicts.find((u) => u.isActive && u.email.toLowerCase() === email);
        if (holder) {
          await sendEmail({
            to: holder.email,
            subject: 'Tentative d\'inscription avec votre adresse - DefiTech Hub',
            html: `
              <div style="font-family: sans-serif; padding: 20px; color: #333;">
                <h2 style="color: #2563eb;">Un compte existe déjà</h2>
                <p>Quelqu'un a tenté de créer un compte avec votre adresse email. Si c'était vous, connectez-vous ou utilisez « Mot de passe oublié » sur la page de connexion.</p>
                <p style="font-size: 12px; color: #9ca3af;">Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer ce message.</p>
              </div>
            `,
          });
        }
        return NextResponse.json(neutralResponse());
      }

      // Préinscription non expirée, mêmes coordonnées : le DERNIER inscrit l'emporte. Ses données
      // (dont le mot de passe) remplacent les précédentes et un nouveau code est envoyé (l'ancien
      // est invalidé). Sans cela, quelqu'un qui préinscrirait l'email/le numéro d'une victime avec
      // son propre mot de passe verrait le compte s'activer avec ce mot de passe quand la victime
      // saisit le code reçu, et la victime ne pourrait pas reprendre la main en se réinscrivant.
      const referredById = await findReferrerId(prisma, referralCode);
      const resent = await prisma.user.updateMany({
        where: { id: only.id, isActive: false },
        data: {
          password: passwordHash,
          firstName,
          lastName,
          fieldId,
          academicLevelId: levelId,
          referredById,
          otpCode,
          otpCodeExpires,
          otpAttempts: 0,
        },
      });
      if (resent.count !== 1) return NextResponse.json(neutralResponse());
    }

    // --- Envoi du code : par email, et aussi par WhatsApp si UltraMsg est configuré (en parallèle) ---
    // Sans WHATSAPP_INSTANCE_ID / WHATSAPP_TOKEN, aucune tentative WhatsApp n'est faite : c'est l'email
    // qui doit livrer le code.
    const whatsappEnabled = isWhatsAppConfigured();

    const otpEmailHtml = `
      <div style="font-family: sans-serif; padding: 20px; color: #333; text-align: center;">
        <h1 style="color: #2563eb;">Bienvenue chez DefiTech !</h1>
        <p>Voici votre code de validation pour activer votre compte (valable 1 heure) :</p>
        <div style="font-size: 32px; font-weight: bold; letter-spacing: 5px; padding: 20px; background: #f3f4f6; border-radius: 10px; display: inline-block; margin: 20px 0;">
          ${otpCode}
        </div>
        <p style="font-size: 13px; color: #b91c1c; max-width: 420px; margin: 0 auto;">${OTP_WARNING}</p>
      </div>
    `;

    // L'alerte à l'administrateur double le coût en emails d'une inscription : plafonnée par jour, pour
    // qu'une vague d'inscriptions ne consomme pas à elle seule le quota quotidien de Gmail.
    const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL;
    const notifyAdmin =
      !!createdUserId && !!adminEmail && (await checkRateLimitDb('notify:signup', 20, 24 * 60 * 60 * 1000)).allowed;
    const [whatsappSent, emailSent] = await Promise.all([
      whatsappEnabled
        ? sendWhatsAppMessage(
            phone,
            `*DefiTech Student Hub* 🚀\n\nBonjour ${firstName} ! Voici votre code de validation : *${otpCode}*\n\nUtilisez-le pour activer votre compte (valable 1 heure). Bienvenue parmi nous !\n\n${OTP_WARNING}`
          )
        : Promise.resolve(false),
      sendEmail({ to: email, subject: `${otpCode} est votre code de validation DefiTech Hub`, html: otpEmailHtml }),
      // Notification à l'administrateur : un échec n'a aucune conséquence pour l'utilisateur.
      notifyAdmin && adminEmail
        ? sendEmail({
            to: adminEmail,
            subject: '🚀 Nouvelle pré-inscription sur le Hub',
            html: `
              <p><strong>${escapeHtml(firstName)} ${escapeHtml(lastName)}</strong> (${escapeHtml(email)}) s'est inscrit en <strong>${escapeHtml(field.name)}</strong>.</p>
              <p>En attente de validation OTP.</p>
            `,
          })
        : Promise.resolve(false),
    ]);

    if (!whatsappSent && !emailSent) {
      // Aucun canal n'a livré le code : on libère l'email/le numéro pour que l'utilisateur
      // puisse réessayer immédiatement, et on le lui dit.
      if (createdUserId) {
        await prisma.user.deleteMany({ where: { id: createdUserId, isActive: false } }).catch(() => {});
      }
      return NextResponse.json(
        {
          error: whatsappEnabled
            ? 'Impossible d\'envoyer le code de validation (WhatsApp et email indisponibles). Vérifiez votre numéro et votre email, puis réessayez dans quelques minutes.'
            : 'Impossible d\'envoyer le code par email. Vérifiez votre adresse email, puis réessayez dans quelques minutes.',
        },
        { status: 502 }
      );
    }

    return NextResponse.json(neutralResponse());
  } catch (error) {
    console.error('Erreur inscription:', safeErrorSummary(error));
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
