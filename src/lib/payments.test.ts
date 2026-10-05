import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PAYMENTS_DISABLED_CODE,
  PAYMENTS_DISABLED_MESSAGE,
  isPaymentsEnabled,
  paymentsDisabledBody,
  paymentsDisabledResponse,
} from '@/lib/payments';

describe('isPaymentsEnabled', () => {
  it('est faux quand la variable est absente (désactivé par défaut)', () => {
    vi.stubEnv('NEXT_PUBLIC_PAYMENTS_ENABLED', undefined);
    expect(isPaymentsEnabled()).toBe(false);
  });

  it('est vrai uniquement pour la valeur exacte "true"', () => {
    vi.stubEnv('NEXT_PUBLIC_PAYMENTS_ENABLED', 'true');
    expect(isPaymentsEnabled()).toBe(true);
  });

  it.each(['', 'false', 'TRUE', 'True', '1', 'yes', 'on', ' true', 'true ', 'truee'])(
    'est faux pour la valeur %j',
    (value) => {
      vi.stubEnv('NEXT_PUBLIC_PAYMENTS_ENABLED', value);
      expect(isPaymentsEnabled()).toBe(false);
    }
  );
});

describe('réponse « paiements désactivés »', () => {
  it('utilise le message français et le code stable', () => {
    expect(PAYMENTS_DISABLED_MESSAGE).toBe('Les paiements ne sont pas encore disponibles.');
    expect(PAYMENTS_DISABLED_CODE).toBe('payments_disabled');
    expect(paymentsDisabledBody()).toEqual({
      error: PAYMENTS_DISABLED_MESSAGE,
      code: 'payments_disabled',
    });
  });

  it('est une réponse HTTP 503 au format { error, code }', async () => {
    const res = paymentsDisabledResponse();
    expect(res.status).toBe(503);
    expect(res.headers.get('content-type')).toContain('application/json');
    await expect(res.json()).resolves.toEqual({
      error: 'Les paiements ne sont pas encore disponibles.',
      code: 'payments_disabled',
    });
  });
});

// --- Points d'entrée serveur : fermés avant toute lecture/écriture ---------------------------

const mocks = vi.hoisted(() => ({
  getAuthUser: vi.fn(),
  checkRateLimitDb: vi.fn(),
  startGeniusCheckout: vi.fn(),
  transactionCreate: vi.fn(),
  transactionFindFirst: vi.fn(),
  userFindUnique: vi.fn(),
}));

vi.mock('@/lib/session', () => ({ getAuthUser: mocks.getAuthUser }));
vi.mock('@/lib/rateLimit', () => ({ checkRateLimitDb: mocks.checkRateLimitDb }));
vi.mock('@/lib/whatsapp', () => ({ sendWhatsAppMessage: vi.fn() }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    transaction: { create: mocks.transactionCreate, findFirst: mocks.transactionFindFirst },
    user: { findUnique: mocks.userFindUnique },
  },
}));
vi.mock('@/lib/fulfillment', () => ({
  MANUAL_REF_PREFIX: 'MANUAL_',
  getClientIp: () => 'test-ip',
  logPayment: vi.fn(),
  logPaymentError: vi.fn(),
  runAfterResponse: vi.fn(),
  startGeniusCheckout: mocks.startGeniusCheckout,
}));

function expectNothingTouched() {
  expect(mocks.getAuthUser).not.toHaveBeenCalled();
  expect(mocks.checkRateLimitDb).not.toHaveBeenCalled();
  expect(mocks.startGeniusCheckout).not.toHaveBeenCalled();
  expect(mocks.transactionCreate).not.toHaveBeenCalled();
  expect(mocks.transactionFindFirst).not.toHaveBeenCalled();
  expect(mocks.userFindUnique).not.toHaveBeenCalled();
}

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe("points d'entrée de paiement quand les paiements sont désactivés", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_PAYMENTS_ENABLED', undefined);
  });

  it('POST /api/payment/genius/create répond 503 payments_disabled sans rien lire ni écrire', async () => {
    const { POST } = await import('@/app/api/payment/genius/create/route');
    const res = await POST(jsonRequest('http://localhost/api/payment/genius/create', { packId: 'starter' }));
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ error: PAYMENTS_DISABLED_MESSAGE, code: 'payments_disabled' });
    expectNothingTouched();
  });

  it('POST /api/payment/manual-request répond 503 payments_disabled sans rien lire ni écrire', async () => {
    const { POST } = await import('@/app/api/payment/manual-request/route');
    const res = await POST(
      jsonRequest('http://localhost/api/payment/manual-request', { packId: 'starter', method: 'TMONEY' })
    );
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ error: PAYMENTS_DISABLED_MESSAGE, code: 'payments_disabled' });
    expectNothingTouched();
  });

  it("createGeniusPayment renvoie l'erreur sans lire la session ni créer de transaction", async () => {
    const { createGeniusPayment } = await import('@/lib/actions/payment');
    await expect(createGeniusPayment('starter')).resolves.toEqual({
      error: PAYMENTS_DISABLED_MESSAGE,
      code: 'payments_disabled',
    });
    expectNothingTouched();
  });

  it("ne bloque plus la création quand les paiements sont activés (la requête continue vers l'authentification)", async () => {
    vi.stubEnv('NEXT_PUBLIC_PAYMENTS_ENABLED', 'true');
    mocks.getAuthUser.mockResolvedValue(null);
    const { POST } = await import('@/app/api/payment/genius/create/route');
    const res = await POST(jsonRequest('http://localhost/api/payment/genius/create', { packId: 'starter' }));
    expect(res.status).toBe(401);
    expect(mocks.getAuthUser).toHaveBeenCalledTimes(1);
  });
});
