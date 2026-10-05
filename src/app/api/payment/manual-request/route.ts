import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/session';
import { checkRateLimitDb } from '@/lib/rateLimit';
import { sendWhatsAppMessage } from '@/lib/whatsapp';
import { getPack } from '@/lib/packs';
import { isPaymentsEnabled, paymentsDisabledResponse } from '@/lib/payments';
import {
  MANUAL_REF_PREFIX,
  getClientIp,
  logPayment,
  logPaymentError,
  runAfterResponse,
} from '@/lib/fulfillment';

const METHODS = ['TMONEY', 'FLOOZ'] as const;

const bodySchema = z.object({
  packId: z.string().min(1).max(50),
  method: z.enum(METHODS),
  // Numéro utilisé pour le transfert (facultatif) : chiffres, espaces et "+" uniquement.
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ]{8,16}$/)
    .optional(),
});

const publicSelect = {
  id: true,
  status: true,
  packName: true,
  amount: true,
  tokens: true,
  type: true,
  reference: true,
  createdAt: true,
} as const;

/**
 * Enregistre une demande de paiement manuel (T-Money / Flooz) en attente de
 * validation par un administrateur. Une seule demande PENDING par pack et par
 * utilisateur : une répétition renvoie la demande existante.
 */
export async function POST(req: Request) {
  // Interrupteur des paiements : fermé, aucune demande n'est enregistrée (ni base, ni rate limit).
  if (!isPaymentsEnabled()) return paymentsDisabledResponse();

  try {
    const authUser = await getAuthUser(req);
    if (!authUser) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const [userLimit, ipLimit] = await Promise.all([
      checkRateLimitDb(`manual-request:user:${authUser.id}`, 5, 60 * 60_000),
      checkRateLimitDb(`manual-request:ip:${getClientIp(req)}`, 20, 60 * 60_000),
    ]);
    const blocked = !userLimit.allowed ? userLimit : !ipLimit.allowed ? ipLimit : null;
    if (blocked) {
      return NextResponse.json(
        { error: 'Trop de demandes. Réessayez plus tard.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(blocked.retryAfterMs / 1000)) } }
      );
    }

    const body: unknown = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Demande invalide : vérifiez le pack, la méthode de paiement et le numéro de téléphone.' },
        { status: 400 }
      );
    }
    const { packId, method, phone } = parsed.data;

    const pack = getPack(packId);
    if (!pack) return NextResponse.json({ error: 'Pack invalide' }, { status: 400 });

    // Anti double-clic : une demande par pack toutes les 30 secondes au plus.
    const burst = await checkRateLimitDb(`manual-request:pack:${authUser.id}:${pack.id}`, 1, 30_000);

    const existing = await prisma.transaction.findFirst({
      where: {
        userId: authUser.id,
        status: 'PENDING',
        packName: pack.name,
        reference: { startsWith: MANUAL_REF_PREFIX },
      },
      orderBy: { createdAt: 'desc' },
      select: publicSelect,
    });
    if (existing) return NextResponse.json({ ...existing, alreadyPending: true });
    if (!burst.allowed) {
      return NextResponse.json({ error: 'Demande déjà en cours de traitement.' }, { status: 429 });
    }

    const user = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: { firstName: true, lastName: true, email: true },
    });
    if (!user) return NextResponse.json({ error: 'Utilisateur non trouvé' }, { status: 404 });

    const dbTransaction = await prisma.transaction.create({
      data: {
        userId: authUser.id,
        amount: pack.price,
        tokens: pack.tokens,
        packName: pack.name,
        type: pack.type,
        status: 'PENDING',
        reference: `${MANUAL_REF_PREFIX}${method}_${randomUUID()}`,
      },
      select: publicSelect,
    });

    logPayment('manual_request_created', {
      transactionId: dbTransaction.id,
      userId: authUser.id,
      packId: pack.id,
      method,
    });

    const adminPhone = process.env.ADMIN_WHATSAPP_PHONE || '';
    if (adminPhone) {
      const userName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;
      const message =
        `*Nouvelle demande de paiement manuel*\n\n` +
        `Client : ${userName}\nEmail : ${user.email}\n` +
        `Montant : ${pack.price} FCFA\nPack : ${pack.name}\nMéthode : ${method}\n` +
        (phone ? `Numéro du transfert : ${phone}\n` : '') +
        `Référence : ${dbTransaction.reference}\n\n` +
        `L'étudiant attend la validation de son paiement.`;
      runAfterResponse(async () => {
        await sendWhatsAppMessage(adminPhone, message);
      });
    }

    return NextResponse.json(dbTransaction);
  } catch (error) {
    logPaymentError('manual_request_error', { message: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "Erreur lors de l'enregistrement" }, { status: 500 });
  }
}
