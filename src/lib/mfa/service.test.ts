// Service du second facteur testé avec une table User simulée en mémoire. Le simulateur reproduit
// les conditions d'écriture que le service emploie (id, égalité, null, OR + lt) : ce qui est vérifié,
// c'est la logique d'anti-rejeu et d'écriture conditionnelle, pas Prisma.
import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = {
  id: string;
  mfaSecret: string | null;
  mfaEnabledAt: Date | null;
  mfaLastStep: number | null;
  mfaRecovery: string | null;
};

const db = vi.hoisted(() => ({ row: null as null | Record<string, unknown> }));

function matches(row: Row, where: Record<string, unknown>): boolean {
  for (const [key, expected] of Object.entries(where)) {
    if (key === 'OR') {
      if (!(expected as Record<string, unknown>[]).some((clause) => matches(row, clause))) return false;
      continue;
    }
    const actual = (row as unknown as Record<string, unknown>)[key];
    if (expected === null) {
      if (actual !== null) return false;
    } else if (expected instanceof Date) {
      if (!(actual instanceof Date) || actual.getTime() !== expected.getTime()) return false;
    } else if (typeof expected === 'object') {
      const cond = expected as { lt?: number };
      if (cond.lt !== undefined && !(typeof actual === 'number' && actual < cond.lt)) return false;
    } else if (actual !== expected) {
      return false;
    }
  }
  return true;
}

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const row = db.row as unknown as Row | null;
        return row && row.id === where.id ? { ...row } : null;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const row = db.row as unknown as Row | null;
        if (!row || !matches(row, where)) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      }),
    },
  },
}));

import { beginEnrollment, confirmEnrollment, verifySecondFactor } from './service';
import { totpAt } from './totp';

const KEY = randomBytes(32).toString('base64');
const START = new Date('2026-10-05T12:00:00.000Z');

function freshRow(): Row {
  return { id: 'admin-1', mfaSecret: null, mfaEnabledAt: null, mfaLastStep: null, mfaRecovery: null };
}

async function enroll(): Promise<{ secret: string; recoveryCodes: string[] }> {
  const started = await beginEnrollment('admin-1', 'admin@exemple.com');
  if (started === 'already_enrolled') throw new Error('déjà activé');
  const secret = started.secretDisplay.replace(/\s/g, '');
  const confirmed = await confirmEnrollment('admin-1', totpAt(secret, Date.now()));
  if (!confirmed.ok) throw new Error(`confirmation refusée : ${confirmed.reason}`);
  return { secret, recoveryCodes: confirmed.recoveryCodes };
}

beforeEach(() => {
  vi.stubEnv('MFA_ENCRYPTION_KEY', KEY);
  vi.useFakeTimers();
  vi.setSystemTime(START);
  db.row = freshRow();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('activation', () => {
  it('stocke le secret chiffré, jamais en clair, et ne l\'active pas avant la confirmation', async () => {
    const started = await beginEnrollment('admin-1', 'admin@exemple.com');
    expect(started).not.toBe('already_enrolled');
    const row = db.row as unknown as Row;
    const clear = (started as { secretDisplay: string }).secretDisplay.replace(/\s/g, '');
    expect(row.mfaSecret).toMatch(/^v1\./);
    expect(row.mfaSecret).not.toContain(clear);
    expect(row.mfaEnabledAt).toBeNull();
    expect((started as { otpauthUrl: string }).otpauthUrl).toContain(`secret=${clear}`);
  });

  it('refuse un code faux, active avec le bon, et ne stocke que des empreintes de codes de secours', async () => {
    const started = await beginEnrollment('admin-1', 'admin@exemple.com');
    const secret = (started as { secretDisplay: string }).secretDisplay.replace(/\s/g, '');

    const wrong = await confirmEnrollment('admin-1', '000000');
    expect(wrong).toEqual({ ok: false, reason: 'invalid_code' });
    expect((db.row as unknown as Row).mfaEnabledAt).toBeNull();

    const ok = await confirmEnrollment('admin-1', totpAt(secret, Date.now()));
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.recoveryCodes).toHaveLength(8);

    const row = db.row as unknown as Row;
    expect(row.mfaEnabledAt).toEqual(ok.enabledAt);
    expect(typeof row.mfaLastStep).toBe('number');
    const stored = JSON.parse(row.mfaRecovery as string) as string[];
    expect(stored).toHaveLength(8);
    for (const code of ok.recoveryCodes) {
      expect(row.mfaRecovery).not.toContain(code.replace('-', ''));
      expect(row.mfaRecovery).not.toContain(code);
    }
  });

  it('refuse de recommencer quand le second facteur est déjà actif', async () => {
    await enroll();
    expect(await beginEnrollment('admin-1', 'admin@exemple.com')).toBe('already_enrolled');
  });

  it('une confirmation sans activation en cours est refusée', async () => {
    expect(await confirmEnrollment('admin-1', '123456')).toEqual({ ok: false, reason: 'no_pending' });
  });
});

describe('vérification à la connexion', () => {
  it('refuse un compte sans second facteur', async () => {
    expect(await verifySecondFactor('admin-1', '123456')).toEqual({ ok: false, reason: 'not_enrolled' });
  });

  it('accepte le code du pas suivant, mais pas un code déjà consommé (anti-rejeu)', async () => {
    const { secret } = await enroll();
    // Le code utilisé à la confirmation est déjà consommé.
    expect(await verifySecondFactor('admin-1', totpAt(secret, Date.now()))).toEqual({ ok: false, reason: 'invalid_code' });

    vi.setSystemTime(new Date(START.getTime() + 30_000));
    const next = totpAt(secret, Date.now());
    const first = await verifySecondFactor('admin-1', next);
    expect(first.ok).toBe(true);
    // Rejouer le même code, même une seconde plus tard dans la même fenêtre, échoue.
    expect(await verifySecondFactor('admin-1', next)).toEqual({ ok: false, reason: 'invalid_code' });
  });

  it('refuse un code faux ou mal formé sans rien modifier', async () => {
    await enroll();
    const before = JSON.stringify(db.row);
    for (const bad of ['000000', 'abc', '', '1234567', null, 42]) {
      expect((await verifySecondFactor('admin-1', bad)).ok).toBe(false);
    }
    expect(JSON.stringify(db.row)).toBe(before);
  });

  it('deux requêtes simultanées avec le même code : une seule passe', async () => {
    const { secret } = await enroll();
    vi.setSystemTime(new Date(START.getTime() + 60_000));
    const code = totpAt(secret, Date.now());
    const results = await Promise.all([verifySecondFactor('admin-1', code), verifySecondFactor('admin-1', code)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });

  it('un code de secours ne sert qu\'une fois, et pas deux fois en parallèle', async () => {
    const { recoveryCodes } = await enroll();
    const [first, second] = recoveryCodes;

    const used = await verifySecondFactor('admin-1', first.toLowerCase()); // saisie en minuscules
    expect(used).toMatchObject({ ok: true, usedRecovery: true, recoveryLeft: 7 });
    expect(await verifySecondFactor('admin-1', first)).toEqual({ ok: false, reason: 'invalid_code' });

    const parallel = await Promise.all([verifySecondFactor('admin-1', second), verifySecondFactor('admin-1', second)]);
    expect(parallel.filter((r) => r.ok)).toHaveLength(1);
  });

  it('secret corrompu mais clé correcte : le code à 6 chiffres est « illisible », les codes de secours marchent', async () => {
    const { secret, recoveryCodes } = await enroll();
    (db.row as unknown as Row).mfaSecret = 'v1.corrompu.corrompu.corrompu';
    vi.setSystemTime(new Date(START.getTime() + 30_000));
    expect(await verifySecondFactor('admin-1', totpAt(secret, Date.now()))).toEqual({ ok: false, reason: 'unreadable' });
    expect(await verifySecondFactor('admin-1', recoveryCodes[0])).toMatchObject({ ok: true, usedRecovery: true });
  });

  it('un code de secours inconnu est refusé', async () => {
    await enroll();
    expect(await verifySecondFactor('admin-1', 'ZZZZZ-ZZZZZ')).toEqual({ ok: false, reason: 'invalid_code' });
  });

  it('signale un secret illisible quand la clé de chiffrement a changé', async () => {
    const { secret } = await enroll();
    vi.stubEnv('MFA_ENCRYPTION_KEY', randomBytes(32).toString('base64'));
    vi.setSystemTime(new Date(START.getTime() + 30_000));
    expect(await verifySecondFactor('admin-1', totpAt(secret, Date.now()))).toEqual({ ok: false, reason: 'unreadable' });
  });

  it('le secret chiffré copié vers un autre compte ne se déchiffre pas', async () => {
    const { secret } = await enroll();
    const stolen = (db.row as unknown as Row).mfaSecret;
    db.row = { ...freshRow(), id: 'autre-compte', mfaSecret: stolen, mfaEnabledAt: new Date() };
    vi.setSystemTime(new Date(START.getTime() + 30_000));
    expect(await verifySecondFactor('autre-compte', totpAt(secret, Date.now()))).toEqual({ ok: false, reason: 'unreadable' });
  });
});

describe('configuration', () => {
  it('lève une erreur explicite sans clé valide (jamais de secret stocké en clair)', async () => {
    vi.stubEnv('MFA_ENCRYPTION_KEY', '');
    await expect(beginEnrollment('admin-1', 'admin@exemple.com')).rejects.toThrow('MFA_ENCRYPTION_KEY');
    vi.stubEnv('MFA_ENCRYPTION_KEY', 'mal-formee');
    await expect(verifySecondFactor('admin-1', '123456')).rejects.toThrow('MFA_ENCRYPTION_KEY');
    expect((db.row as unknown as Row).mfaSecret).toBeNull();
  });
});
