import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Aucune base réelle : Prisma est remplacé par un stockage en mémoire (voir `fakeRateLimit`).
const { fakeRateLimit } = vi.hoisted(() => ({
  fakeRateLimit: {
    create: vi.fn(),
    updateMany: vi.fn(),
    findUnique: vi.fn(),
    deleteMany: vi.fn(),
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: { rateLimit: fakeRateLimit } }));
vi.mock('@prisma/client', () => {
  class PrismaClientKnownRequestError extends Error {
    code: string;
    constructor(message: string, init: { code: string; clientVersion: string }) {
      super(message);
      this.code = init.code;
    }
  }
  return { Prisma: { PrismaClientKnownRequestError } };
});

import { Prisma } from '@prisma/client';
import { checkRateLimit, checkRateLimitDb, getRateLimitKey, safeCompare } from '@/lib/rateLimit';

let keySeq = 0;
// Le compteur en mémoire est partagé au niveau du module : chaque test utilise sa propre clé.
const uniqueKey = (prefix = 'test') => `${prefix}:${++keySeq}`;

describe('checkRateLimit (fenêtre glissante en mémoire)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('autorise jusqu\'à la limite puis refuse', () => {
    const key = uniqueKey();
    expect(checkRateLimit(key, 3, 60_000)).toEqual({ allowed: true, retryAfterMs: 0 });
    expect(checkRateLimit(key, 3, 60_000).allowed).toBe(true);
    expect(checkRateLimit(key, 3, 60_000).allowed).toBe(true);

    const blocked = checkRateLimit(key, 3, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
    expect(blocked.retryAfterMs).toBeLessThanOrEqual(60_000);
  });

  it('un refus ne consomme pas de crédit supplémentaire', () => {
    const key = uniqueKey();
    checkRateLimit(key, 1, 1_000);
    for (let i = 0; i < 5; i++) expect(checkRateLimit(key, 1, 1_000).allowed).toBe(false);

    // Une seule fenêtre plus tard, un seul appel est de nouveau accepté.
    vi.advanceTimersByTime(1_001);
    expect(checkRateLimit(key, 1, 1_000).allowed).toBe(true);
    expect(checkRateLimit(key, 1, 1_000).allowed).toBe(false);
  });

  it('calcule le délai restant à partir de la plus ancienne requête de la fenêtre', () => {
    const key = uniqueKey();
    checkRateLimit(key, 2, 10_000); // t = 0
    vi.advanceTimersByTime(4_000);
    checkRateLimit(key, 2, 10_000); // t = 4 s
    vi.advanceTimersByTime(1_000); // t = 5 s

    const blocked = checkRateLimit(key, 2, 10_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBe(5_000); // la 1re requête sort de la fenêtre à t = 10 s
  });

  it('libère les crédits quand la fenêtre est écoulée', () => {
    const key = uniqueKey();
    checkRateLimit(key, 2, 10_000);
    checkRateLimit(key, 2, 10_000);
    expect(checkRateLimit(key, 2, 10_000).allowed).toBe(false);

    vi.advanceTimersByTime(10_001);
    expect(checkRateLimit(key, 2, 10_000).allowed).toBe(true);
  });

  it('isole les clés entre elles', () => {
    const a = uniqueKey('a');
    const b = uniqueKey('b');
    checkRateLimit(a, 1, 60_000);
    expect(checkRateLimit(a, 1, 60_000).allowed).toBe(false);
    expect(checkRateLimit(b, 1, 60_000).allowed).toBe(true);
  });
});

describe('getRateLimitKey', () => {
  const req = (headers: Record<string, string>) => new Request('http://localhost/api/x', { headers });

  it('utilise la première adresse de x-forwarded-for', () => {
    const key = getRateLimitKey(req({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1', 'user-agent': 'UA' }));
    expect(key).toBe('203.0.113.7::UA');
  });

  it('se rabat sur x-real-ip puis sur "unknown"', () => {
    expect(getRateLimitKey(req({ 'x-real-ip': '198.51.100.2', 'user-agent': 'UA' }))).toBe('198.51.100.2::UA');
    expect(getRateLimitKey(req({}))).toMatch(/^unknown::/);
  });

  it('tronque le user-agent à 40 caractères', () => {
    const key = getRateLimitKey(req({ 'x-forwarded-for': '1.2.3.4', 'user-agent': 'x'.repeat(200) }));
    expect(key).toBe(`1.2.3.4::${'x'.repeat(40)}`);
  });
});

describe('safeCompare', () => {
  it('renvoie true pour deux chaînes identiques', () => {
    expect(safeCompare('123456', '123456')).toBe(true);
    expect(safeCompare('', '')).toBe(true);
  });

  it('renvoie false pour des chaînes différentes de même longueur', () => {
    expect(safeCompare('123456', '123457')).toBe(false);
  });

  it('renvoie false pour des longueurs différentes, sans lever d\'exception', () => {
    expect(safeCompare('123456', '12345')).toBe(false);
    expect(safeCompare('123456', '1234567')).toBe(false);
    expect(safeCompare('', '1')).toBe(false);
  });

  it('est sensible à la casse', () => {
    expect(safeCompare('AbC', 'abc')).toBe(false);
  });

  it('renvoie false (sans lever) pour des chaînes de même longueur mais de taille en octets différente', () => {
    // "é" = 2 octets UTF-8, "e" = 1 octet : timingSafeEqual lève une RangeError si on ne compare
    // pas d'abord la longueur des buffers. Une entrée utilisateur ne doit jamais provoquer un 500.
    expect(safeCompare('é', 'e')).toBe(false);
    expect(safeCompare('12345é', '123456')).toBe(false);
  });
});

describe('checkRateLimitDb (algorithme, base simulée en mémoire)', () => {
  type Row = { key: string; count: number; resetAt: Date };
  type Where = { key: string; resetAt?: { lte?: Date; gt?: Date }; count?: { lt?: number } };
  type Data = { count?: number | { increment: number }; resetAt?: Date };

  let rows: Map<string, Row>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // pas de ménage aléatoire pendant les tests
    rows = new Map();

    fakeRateLimit.create.mockImplementation(async ({ data }: { data: Row }) => {
      if (rows.has(data.key)) {
        throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' });
      }
      rows.set(data.key, { ...data });
      return data;
    });

    // Chaque appel s'exécute d'un bloc (comme une instruction SQL atomique).
    fakeRateLimit.updateMany.mockImplementation(async ({ where, data }: { where: Where; data: Data }) => {
      const row = rows.get(where.key);
      if (!row) return { count: 0 };
      if (where.resetAt?.lte && !(row.resetAt <= where.resetAt.lte)) return { count: 0 };
      if (where.resetAt?.gt && !(row.resetAt > where.resetAt.gt)) return { count: 0 };
      if (where.count?.lt !== undefined && !(row.count < where.count.lt)) return { count: 0 };
      if (data.resetAt) row.resetAt = data.resetAt;
      if (typeof data.count === 'number') row.count = data.count;
      else if (data.count) row.count += data.count.increment;
      return { count: 1 };
    });

    fakeRateLimit.findUnique.mockImplementation(async ({ where }: { where: { key: string } }) => rows.get(where.key) ?? null);
    fakeRateLimit.deleteMany.mockImplementation(async () => ({ count: 0 }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    fakeRateLimit.create.mockReset();
    fakeRateLimit.updateMany.mockReset();
    fakeRateLimit.findUnique.mockReset();
    fakeRateLimit.deleteMany.mockReset();
  });

  it('autorise jusqu\'à la limite puis refuse avec un délai d\'attente', async () => {
    const key = uniqueKey('db');
    for (let i = 0; i < 3; i++) {
      expect(await checkRateLimitDb(key, 3, 60_000)).toEqual({ allowed: true, retryAfterMs: 0 });
    }
    const blocked = await checkRateLimitDb(key, 3, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBe(60_000);
    expect(rows.get(key)?.count).toBe(3); // un refus n'incrémente pas
  });

  it('repart de zéro quand la fenêtre est expirée', async () => {
    const key = uniqueKey('db');
    await checkRateLimitDb(key, 1, 10_000);
    expect((await checkRateLimitDb(key, 1, 10_000)).allowed).toBe(false);

    vi.advanceTimersByTime(10_001);
    expect((await checkRateLimitDb(key, 1, 10_000)).allowed).toBe(true);
    expect(rows.get(key)?.count).toBe(1);
  });

  it('n\'accorde jamais plus que la limite sous des appels concurrents', async () => {
    const key = uniqueKey('db');
    const results = await Promise.all(Array.from({ length: 20 }, () => checkRateLimitDb(key, 5, 60_000)));
    expect(results.filter((r) => r.allowed)).toHaveLength(5);
    expect(rows.get(key)?.count).toBe(5);
  });

  it('isole les clés entre elles', async () => {
    const a = uniqueKey('db-a');
    const b = uniqueKey('db-b');
    await checkRateLimitDb(a, 1, 60_000);
    expect((await checkRateLimitDb(a, 1, 60_000)).allowed).toBe(false);
    expect((await checkRateLimitDb(b, 1, 60_000)).allowed).toBe(true);
  });

  it('se rabat sur le compteur en mémoire si la base est indisponible', async () => {
    fakeRateLimit.create.mockRejectedValue(new Error('base indisponible'));
    const key = uniqueKey('db-down');

    expect((await checkRateLimitDb(key, 2, 60_000)).allowed).toBe(true);
    expect((await checkRateLimitDb(key, 2, 60_000)).allowed).toBe(true);
    expect((await checkRateLimitDb(key, 2, 60_000)).allowed).toBe(false);
  });
});
