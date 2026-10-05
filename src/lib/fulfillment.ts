/**
 * Cycle de vie d'un paiement : création du lien Genius Pay, vérification auprès
 * de la passerelle, crédit atomique (jetons + abonnement) et notifications.
 *
 * Module serveur uniquement. Les offres viennent de `@/lib/packs`.
 */
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { after } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { checkRateLimitDb } from '@/lib/rateLimit';
import { sendPushNotification } from '@/lib/notifications';
import { sendWhatsAppMessage } from '@/lib/whatsapp';
import { escapeHtml, sendEmail } from '@/lib/mail';
import { findPackForTransaction, getPack } from '@/lib/packs';
import { classifyGatewayStatus } from '@/lib/paymentStatus';

const DAY_MS = 24 * 60 * 60 * 1000;
const GENIUS_API_BASE = 'https://pay.genius.ci/api/v1/merchant';

/** Préfixes des références locales (non fournies par la passerelle). */
export const MANUAL_REF_PREFIX = 'MANUAL_';
const PLACEHOLDER_REF_PREFIX = 'GENIUS_INIT_';

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= 200 ? value : null;
}

function asAmount(value: unknown): number | null {
  const n =
    typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Journal structuré (une ligne JSON). Ne jamais y mettre de secret, de signature ni de corps brut. */
export function logPayment(event: string, fields: Record<string, unknown> = {}): void {
  console.info(JSON.stringify({ scope: 'payment', event, ...fields, at: new Date().toISOString() }));
}

export function logPaymentError(event: string, fields: Record<string, unknown> = {}): void {
  console.error(JSON.stringify({ scope: 'payment', event, ...fields, at: new Date().toISOString() }));
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0].trim();
    if (first) return first;
  }
  return req.headers.get('x-real-ip') || 'unknown';
}

/** Exécute une tâche après l'envoi de la réponse (sans jamais lever d'erreur). */
export function runAfterResponse(task: () => Promise<void>): void {
  const safe = async () => {
    try {
      await task();
    } catch (e) {
      logPaymentError('background_task_failed', { message: errorMessage(e) });
    }
  };
  try {
    after(safe);
  } catch {
    // Hors contexte de requête : on lance simplement la tâche.
    void safe();
  }
}

/** Origine publique de l'application (NEXT_PUBLIC_APP_URL), sans domaine de repli. */
export function getAppUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (url.protocol !== 'https:' && !(isLocal && url.protocol === 'http:')) return null;
    return url.origin;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Passerelle Genius Pay
// ---------------------------------------------------------------------------

function getGeniusCredentials(): { publicKey: string; secretKey: string } | null {
  const publicKey = process.env.GENIUS_PAY_PUBLIC_KEY?.trim();
  const secretKey = process.env.GENIUS_PAY_SECRET_KEY?.trim();
  if (!publicKey || publicKey.length < 10 || !secretKey || secretKey.length < 10) return null;
  return { publicKey, secretKey };
}

/** Vrai si une clé secrète Genius Pay est configurée (nécessaire pour vérifier les webhooks). */
export function getGeniusWebhookSecret(): string | null {
  return getGeniusCredentials()?.secretKey ?? null;
}

/**
 * Vérifie la signature d'un webhook : HMAC-SHA256 hexadécimal du corps brut,
 * clé = GENIUS_PAY_SECRET_KEY (format repris du code existant ; un éventuel
 * préfixe "sha256=" est toléré). Comparaison en temps constant.
 */
export function verifyGeniusSignature(rawBody: string, header: string | null, secretKey: string): boolean {
  if (!header) return false;
  const provided = header.trim().replace(/^sha256=/i, '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(provided)) return false;
  const expected = createHmac('sha256', secretKey).update(rawBody).digest();
  return timingSafeEqual(Buffer.from(provided, 'hex'), expected);
}

/** Une référence fournie par la passerelle (et non un identifiant local provisoire). */
export function isGatewayReference(reference: string | null | undefined): reference is string {
  return (
    typeof reference === 'string' &&
    reference.length > 0 &&
    !reference.startsWith(MANUAL_REF_PREFIX) &&
    !reference.startsWith(PLACEHOLDER_REF_PREFIX)
  );
}

type GeniusPaymentCheck =
  | {
      ok: true;
      status: string;
      amount: number | null;
      currency: string | null;
      references: string[];
      metadataTxId: string | null;
    }
  | { ok: false; reason: 'config' | 'network' | 'http' | 'invalid'; httpStatus?: number };

/** Interroge Genius Pay sur l'état réel d'un paiement (vérification « rebond »). */
async function fetchGeniusPayment(reference: string): Promise<GeniusPaymentCheck> {
  const creds = getGeniusCredentials();
  if (!creds) return { ok: false, reason: 'config' };

  let res: Response;
  try {
    res = await fetch(`${GENIUS_API_BASE}/payments/${encodeURIComponent(reference)}`, {
      headers: {
        Accept: 'application/json',
        'X-API-Key': creds.publicKey,
        'X-API-Secret': creds.secretKey,
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return { ok: false, reason: 'network' };
  }

  if (!res.ok) return { ok: false, reason: 'http', httpStatus: res.status };

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    return { ok: false, reason: 'invalid' };
  }

  const body = asRecord(json);
  const data = asRecord(body?.data);
  const status = asString(data?.status)?.toUpperCase();
  if (!body || body.success !== true || !data || !status) return { ok: false, reason: 'invalid' };

  return {
    ok: true,
    status,
    amount: asAmount(data.amount),
    currency: asString(data.currency),
    references: [asString(data.reference), asString(data.id)].filter((r): r is string => r !== null),
    metadataTxId: asString(asRecord(data.metadata)?.dbTransactionId),
  };
}

// ---------------------------------------------------------------------------
// Crédit d'une transaction (unique point d'entrée)
// ---------------------------------------------------------------------------

export class FulfillmentError extends Error {
  constructor(
    public readonly code: 'UNKNOWN_PACK' | 'USER_NOT_FOUND' | 'CONFLICT',
    message: string
  ) {
    super(message);
    this.name = 'FulfillmentError';
  }
}

export type FulfilledResult = {
  status: 'fulfilled';
  transactionId: string;
  userId: string;
  type: 'TOPUP' | 'SUBSCRIPTION';
  packName: string;
  amount: number;
  tokens: number;
  subscriptionExpiresAt: Date | null;
};

export type FulfillResult =
  | FulfilledResult
  | { status: 'already_processed'; transactionStatus: string }
  | { status: 'not_found' };

/**
 * Prolonge l'abonnement d'un utilisateur et crédite les jetons bonus.
 * Comparaison-et-écriture : si le compte change entre la lecture et l'écriture
 * (autre paiement simultané), l'écriture ne touche aucune ligne et on relit.
 */
async function extendSubscription(
  db: Prisma.TransactionClient,
  userId: string,
  days: number,
  bonusTokens: number
): Promise<Date> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { isSubscribed: true, subscriptionExpiresAt: true },
    });
    if (!user) throw new FulfillmentError('USER_NOT_FOUND', 'Utilisateur introuvable.');

    const now = new Date();
    const base =
      user.isSubscribed && user.subscriptionExpiresAt && user.subscriptionExpiresAt > now
        ? user.subscriptionExpiresAt
        : now;
    // Addition en millisecondes : déterministe (setMonth() dérape en fin de mois).
    const expiresAt = new Date(base.getTime() + days * DAY_MS);

    const updated = await db.user.updateMany({
      where: {
        id: userId,
        isSubscribed: user.isSubscribed,
        subscriptionExpiresAt: user.subscriptionExpiresAt,
      },
      data: {
        isSubscribed: true,
        subscriptionExpiresAt: expiresAt,
        ...(bonusTokens > 0 ? { aiBonusRequests: { increment: bonusTokens } } : {}),
      },
    });
    if (updated.count === 1) return expiresAt;
  }
  throw new FulfillmentError('CONFLICT', "Le compte est modifié en continu : réessayez dans un instant.");
}

/**
 * Valide une transaction PENDING et crédite l'utilisateur, en une seule
 * transaction SQL (tout ou rien). Idempotent : seul le premier appel passe
 * PENDING -> COMPLETED ; les suivants (double webhook, double clic admin)
 * renvoient `already_processed` sans rien créditer.
 *
 * L'appelant est responsable d'avoir établi que le paiement est réel
 * (webhook vérifié, ou approbation d'un administrateur).
 */
export async function fulfillTransaction(transactionId: string): Promise<FulfillResult> {
  return prisma.$transaction(
    async (db): Promise<FulfillResult> => {
      const claimed = await db.transaction.updateMany({
        where: { id: transactionId, status: 'PENDING' },
        data: { status: 'COMPLETED' },
      });

      if (claimed.count !== 1) {
        const existing = await db.transaction.findUnique({
          where: { id: transactionId },
          select: { status: true },
        });
        return existing
          ? { status: 'already_processed', transactionStatus: existing.status }
          : { status: 'not_found' };
      }

      const t = await db.transaction.findUniqueOrThrow({
        where: { id: transactionId },
        select: { id: true, userId: true, type: true, packName: true, amount: true, tokens: true },
      });

      let subscriptionExpiresAt: Date | null = null;

      if (t.type === 'SUBSCRIPTION') {
        const pack = findPackForTransaction(t);
        if (!pack || !pack.durationDays) {
          // Annule aussi le passage à COMPLETED : la transaction reste PENDING.
          throw new FulfillmentError('UNKNOWN_PACK', `Offre d'abonnement non reconnue : « ${t.packName} ».`);
        }
        subscriptionExpiresAt = await extendSubscription(db, t.userId, pack.durationDays, t.tokens);
      } else if (t.tokens > 0) {
        const credited = await db.user.updateMany({
          where: { id: t.userId },
          data: { aiBonusRequests: { increment: t.tokens } },
        });
        if (credited.count !== 1) throw new FulfillmentError('USER_NOT_FOUND', 'Utilisateur introuvable.');
      }

      return {
        status: 'fulfilled',
        transactionId: t.id,
        userId: t.userId,
        type: t.type === 'SUBSCRIPTION' ? 'SUBSCRIPTION' : 'TOPUP',
        packName: t.packName,
        amount: t.amount,
        tokens: t.tokens,
        subscriptionExpiresAt,
      };
    },
    { maxWait: 5_000, timeout: 15_000 }
  );
}

// ---------------------------------------------------------------------------
// Règlement d'une transaction Genius Pay (webhook ET vérification à la demande)
// ---------------------------------------------------------------------------

export type SettleOutcome =
  | { kind: 'fulfilled'; result: FulfilledResult }
  | { kind: 'already_processed'; transactionStatus: string }
  | { kind: 'not_confirmed'; gatewayStatus: string }
  | { kind: 'failed'; gatewayStatus: string }
  | {
      kind: 'rejected';
      reason:
        | 'not_pending'
        | 'not_gateway_reference'
        | 'reference_mismatch'
        | 'metadata_mismatch'
        | 'currency_mismatch'
        | 'amount_mismatch'
        | 'not_found';
    }
  | { kind: 'gateway_error'; reason: 'config' | 'network' | 'http' | 'invalid'; httpStatus?: number };

/**
 * Interroge Genius Pay (fail-closed : toute erreur = aucun crédit), vérifie que
 * le paiement correspond bien à CETTE transaction (référence, montant, devise,
 * métadonnées), puis appelle `fulfillTransaction`.
 *
 * Un statut d'échec définitif de la passerelle (voir `GATEWAY_FAILED_STATUSES`) fait passer la
 * transaction de PENDING à FAILED (jamais d'écrasement d'une transaction COMPLETED). Un statut
 * inconnu reste « non confirmé ». Une transaction FAILED reste vérifiable : si la passerelle
 * confirme finalement le paiement (échec transitoire puis nouvelle tentative réussie), elle est
 * rouverte puis créditée, pour qu'un paiement réel ne soit jamais perdu.
 */
export async function settleGeniusTransaction(tx: {
  id: string;
  status: string;
  amount: number;
  reference: string | null;
}): Promise<SettleOutcome> {
  if (tx.status === 'COMPLETED') return { kind: 'already_processed', transactionStatus: tx.status };
  if (tx.status !== 'PENDING' && tx.status !== 'FAILED') return { kind: 'rejected', reason: 'not_pending' };
  if (!isGatewayReference(tx.reference)) return { kind: 'rejected', reason: 'not_gateway_reference' };

  const check = await fetchGeniusPayment(tx.reference);
  if (!check.ok) return { kind: 'gateway_error', reason: check.reason, httpStatus: check.httpStatus };

  const statusClass = classifyGatewayStatus(check.status);

  if (statusClass === 'failed') {
    if (tx.status === 'FAILED') return { kind: 'already_processed', transactionStatus: 'FAILED' };
    // Une erreur de base de données remonte à l'appelant (500) : le webhook sera rejoué.
    const marked = await prisma.transaction.updateMany({
      where: { id: tx.id, status: 'PENDING' },
      data: { status: 'FAILED' },
    });
    if (marked.count === 1) {
      logPayment('transaction_failed', { transactionId: tx.id, gatewayStatus: check.status });
      return { kind: 'failed', gatewayStatus: check.status };
    }
    // Modifiée entre-temps (autre webhook, approbation admin) : on rend l'état réel.
    const current = await prisma.transaction.findUnique({ where: { id: tx.id }, select: { status: true } });
    if (!current) return { kind: 'rejected', reason: 'not_found' };
    return current.status === 'FAILED'
      ? { kind: 'failed', gatewayStatus: check.status }
      : { kind: 'already_processed', transactionStatus: current.status };
  }

  if (statusClass !== 'success') {
    return tx.status === 'FAILED'
      ? { kind: 'already_processed', transactionStatus: 'FAILED' }
      : { kind: 'not_confirmed', gatewayStatus: check.status };
  }

  if (check.references.length > 0 && !check.references.includes(tx.reference)) {
    return { kind: 'rejected', reason: 'reference_mismatch' };
  }
  if (check.metadataTxId && check.metadataTxId !== tx.id) {
    return { kind: 'rejected', reason: 'metadata_mismatch' };
  }
  if (check.currency && check.currency.toUpperCase() !== 'XOF') {
    return { kind: 'rejected', reason: 'currency_mismatch' };
  }
  if (check.amount !== null && check.amount !== tx.amount) {
    return { kind: 'rejected', reason: 'amount_mismatch' };
  }
  if (check.amount === null) {
    logPaymentError('amount_unverified', { transactionId: tx.id });
  }

  if (tx.status === 'FAILED') {
    const reopened = await prisma.transaction.updateMany({
      where: { id: tx.id, status: 'FAILED' },
      data: { status: 'PENDING' },
    });
    if (reopened.count === 1) logPayment('failed_transaction_reopened', { transactionId: tx.id });
  }

  const result = await fulfillTransaction(tx.id);
  if (result.status === 'fulfilled') return { kind: 'fulfilled', result };
  if (result.status === 'already_processed') {
    return { kind: 'already_processed', transactionStatus: result.transactionStatus };
  }
  return { kind: 'rejected', reason: 'not_found' };
}

// ---------------------------------------------------------------------------
// Création d'un paiement Genius Pay
// ---------------------------------------------------------------------------

export type CheckoutResult =
  | { ok: true; url: string; transactionId: string }
  | { ok: false; status: number; error: string };

async function markFailed(transactionId: string): Promise<void> {
  try {
    await prisma.transaction.updateMany({
      where: { id: transactionId, status: 'PENDING' },
      data: { status: 'FAILED' },
    });
  } catch (e) {
    logPaymentError('mark_failed_error', { transactionId, message: errorMessage(e) });
  }
}

/**
 * Crée une transaction PENDING (référence locale UUID unique) puis le paiement
 * chez Genius Pay. Si la passerelle échoue, la transaction passe en FAILED.
 * Le prix et le contenu viennent exclusivement du catalogue serveur.
 */
export async function startGeniusCheckout(userId: string, packId: unknown): Promise<CheckoutResult> {
  const pack = getPack(packId);
  if (!pack) return { ok: false, status: 400, error: 'Pack invalide.' };

  const creds = getGeniusCredentials();
  const baseUrl = getAppUrl();
  if (!creds || !baseUrl) {
    logPaymentError('checkout_config_missing', {
      genius: Boolean(creds),
      appUrl: Boolean(baseUrl),
    });
    return {
      ok: false,
      status: 503,
      error: 'Le paiement en ligne est momentanément indisponible. Réessayez plus tard ou utilisez le paiement manuel.',
    };
  }

  const limit = await checkRateLimitDb(`genius-create:user:${userId}`, 10, 10 * 60_000);
  if (!limit.allowed) {
    return { ok: false, status: 429, error: 'Trop de tentatives de paiement. Réessayez dans quelques minutes.' };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, firstName: true, lastName: true },
  });
  if (!user) return { ok: false, status: 404, error: 'Utilisateur introuvable.' };

  const dbTransaction = await prisma.transaction.create({
    data: {
      userId: user.id,
      amount: pack.price,
      tokens: pack.tokens,
      packName: pack.name,
      type: pack.type,
      status: 'PENDING',
      reference: `${PLACEHOLDER_REF_PREFIX}${randomUUID()}`,
    },
    select: { id: true },
  });

  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Étudiant DefiTech';
  const payload = {
    amount: pack.price,
    currency: 'XOF',
    description: `Achat ${pack.name} - StudentHub`,
    customer: { name: fullName, email: user.email },
    success_url: `${baseUrl}/shop/success?tx=${dbTransaction.id}`,
    error_url: `${baseUrl}/shop`,
    callback_url: `${baseUrl}/api/payment/genius/callback`,
    metadata: { dbTransactionId: dbTransaction.id, userId: user.id },
  };

  let gatewayReference: string | null = null;
  let checkoutUrl: string | null = null;
  try {
    const response = await fetch(`${GENIUS_API_BASE}/payments`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-API-Key': creds.publicKey,
        'X-API-Secret': creds.secretKey,
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });

    const json: unknown = await response.json().catch(() => null);
    const body = asRecord(json);
    const data = asRecord(body?.data);

    if (!response.ok || !body || body.success !== true || !data) {
      const gatewayError = asString(asRecord(body?.error)?.message) ?? asString(body?.message);
      logPaymentError('gateway_rejected', {
        transactionId: dbTransaction.id,
        httpStatus: response.status,
        gatewayError,
      });
    } else {
      gatewayReference = asString(data.reference) ?? asString(data.id);
      const rawUrl = typeof data.checkout_url === 'string' ? data.checkout_url.trim() : '';
      checkoutUrl = /^https:\/\//i.test(rawUrl) ? rawUrl : null;
    }
  } catch (e) {
    logPaymentError('gateway_unreachable', { transactionId: dbTransaction.id, message: errorMessage(e) });
  }

  if (!gatewayReference || !checkoutUrl) {
    await markFailed(dbTransaction.id);
    return {
      ok: false,
      status: 502,
      error: "La passerelle de paiement n'a pas pu créer le paiement. Réessayez dans un instant.",
    };
  }

  // La référence de la passerelle remplace la référence provisoire (clé de rapprochement du webhook).
  try {
    await prisma.transaction.update({
      where: { id: dbTransaction.id },
      data: { reference: gatewayReference },
    });
  } catch (e) {
    logPaymentError('reference_update_failed', {
      transactionId: dbTransaction.id,
      gatewayReference,
      message: errorMessage(e),
    });
    await markFailed(dbTransaction.id);
    return { ok: false, status: 500, error: "Erreur d'enregistrement du paiement. Réessayez dans un instant." };
  }

  logPayment('checkout_created', {
    transactionId: dbTransaction.id,
    userId: user.id,
    packId: pack.id,
    amount: pack.price,
  });
  return { ok: true, url: checkoutUrl, transactionId: dbTransaction.id };
}

// ---------------------------------------------------------------------------
// Notifications (meilleur effort : ne bloquent jamais le crédit)
// ---------------------------------------------------------------------------

async function attempt(label: string, task: () => Promise<unknown>): Promise<void> {
  try {
    const outcome = await task();
    const notDelivered =
      outcome === false ||
      (typeof outcome === 'object' && outcome !== null && 'failed' in outcome && Number((outcome as { failed: unknown }).failed) > 0);
    if (notDelivered) logPaymentError('notification_not_delivered', { channel: label });
  } catch (e) {
    logPaymentError('notification_failed', { channel: label, message: errorMessage(e) });
  }
}

function formatDateFr(date: Date): string {
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
}

/**
 * Prévient l'étudiant (push, WhatsApp) et, pour un paiement automatique,
 * l'administrateur (WhatsApp, email). À appeler après `fulfillTransaction`.
 */
export async function notifyFulfillment(result: FulfilledResult, source: 'GENIUS' | 'ADMIN'): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: result.userId },
    select: { firstName: true, lastName: true, email: true, phone: true, pushToken: true },
  });
  if (!user) return;

  const userName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;
  const amountStr = `${result.amount} FCFA`;
  const effect =
    result.type === 'SUBSCRIPTION' && result.subscriptionExpiresAt
      ? `Votre abonnement est actif jusqu'au ${formatDateFr(result.subscriptionExpiresAt)}${
          result.tokens > 0 ? ` et ${result.tokens} jetons ont été ajoutés` : ''
        }.`
      : `${result.tokens} jetons ont été ajoutés à votre compte.`;

  if (user.pushToken) {
    const pushToken = user.pushToken;
    await attempt('push', () => sendPushNotification(pushToken, 'Paiement validé', effect));
  }

  if (user.phone) {
    const phone = user.phone;
    const message = `*DefiTech Student Hub*\n\nMerci ${user.firstName || ''} ! Votre paiement de *${amountStr}* pour « ${result.packName} » a été validé.\n\n${effect}`;
    await attempt('whatsapp_client', () => sendWhatsAppMessage(phone, message));
  }

  if (source !== 'GENIUS') return;

  const adminPhone = process.env.ADMIN_WHATSAPP_PHONE || '';
  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || '';

  if (adminPhone) {
    const message = `*Nouveau paiement reçu*\n\nClient : ${userName}\nEmail : ${user.email}\nMontant : ${amountStr}\nPack : ${result.packName}\n\nLe compte a été crédité automatiquement.`;
    await attempt('whatsapp_admin', () => sendWhatsAppMessage(adminPhone, message));
  }

  if (adminEmail) {
    await attempt('email_admin', () =>
      sendEmail({
        to: adminEmail,
        subject: `Nouveau paiement - ${amountStr} - ${userName}`,
        html: `
          <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
            <h2 style="color: #059669;">Nouveau paiement reçu</h2>
            <p><strong>Client :</strong> ${escapeHtml(userName)} (${escapeHtml(user.email)})</p>
            <p><strong>Montant :</strong> <span style="font-size: 20px; color: #059669; font-weight: bold;">${escapeHtml(amountStr)}</span></p>
            <p><strong>Pack :</strong> ${escapeHtml(result.packName)}</p>
            <p><strong>ID Transaction :</strong> ${escapeHtml(result.transactionId)}</p>
            <hr />
            <p style="font-size: 12px; color: #666;">Notification automatique de DefiTech Student Hub</p>
          </div>
        `,
      })
    );
  }
}
