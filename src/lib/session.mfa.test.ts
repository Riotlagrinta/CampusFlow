// Règle centrale du second facteur dans getAuthUser : session et base simulées, jetons réels.
import { randomBytes } from 'node:crypto';
import { SignJWT } from 'jose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ auth: vi.fn(), findUnique: vi.fn() }));

vi.mock('@/../auth', () => ({ auth: m.auth }));
vi.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique: m.findUnique } } }));
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ get: () => undefined })) }));

import { effectiveMfaMode, getAuthUser, requireAdmin } from './session';
import { signMfaProof } from './mfa/proof';

const AUTH_SECRET = 'secret-d-authentification-de-test-0123456789';
const KEY = randomBytes(32).toString('base64');
const secretBytes = new TextEncoder().encode(AUTH_SECRET);

const ENABLED_AT = new Date('2026-10-01T10:00:00.000Z');
const AUTH_TIME = 1_790_000_000;

function dbUser(over: Record<string, unknown> = {}) {
  return {
    id: 'admin-1',
    email: 'admin@exemple.com',
    role: 'ADMIN',
    isActive: true,
    passwordChangedAt: null,
    mfaEnabledAt: ENABLED_AT,
    ...over,
  };
}

function webSession(over: Record<string, unknown> = {}) {
  m.auth.mockResolvedValue({ user: { email: 'admin@exemple.com', id: 'admin-1' }, authTime: AUTH_TIME, ...over });
}

async function requestWithProof(claims?: Partial<{ sub: string; at: number; ea: number }>) {
  const token = await signMfaProof(
    { sub: 'admin-1', at: AUTH_TIME, ea: ENABLED_AT.getTime(), ...claims },
    secretBytes
  );
  return new Request('https://studenthub.test/api/x', { headers: { cookie: `sh_mfa=${token}` } });
}

beforeEach(() => {
  vi.stubEnv('AUTH_SECRET', AUTH_SECRET);
  vi.stubEnv('MFA_ENCRYPTION_KEY', KEY);
  m.auth.mockReset();
  m.findUnique.mockReset();
  m.findUnique.mockResolvedValue(dbUser());
  webSession();
});

describe('getAuthUser : second facteur des administrateurs', () => {
  it('fonction désactivée (pas de clé) et ADMIN non inscrit : il garde ses droits', async () => {
    vi.stubEnv('MFA_ENCRYPTION_KEY', '');
    m.findUnique.mockResolvedValue(dbUser({ mfaEnabledAt: null }));
    expect(await getAuthUser(new Request('https://studenthub.test/api/x'))).toEqual({
      id: 'admin-1',
      email: 'admin@exemple.com',
      role: 'ADMIN',
    });
  });

  it('clé ABSENTE mais ADMIN déjà inscrit : refusé (jamais d\'accès sur mot de passe seul)', async () => {
    vi.stubEnv('MFA_ENCRYPTION_KEY', '');
    const user = await getAuthUser(new Request('https://studenthub.test/api/x'));
    expect(user).toEqual({ id: 'admin-1', email: 'admin@exemple.com', role: 'STUDENT', mfaPending: true });
    // même avec une preuve d'une session précédente
    expect((await getAuthUser(await requestWithProof()))?.role).toBe('STUDENT');
  });

  it('effectiveMfaMode : seul un ADMIN inscrit passe de « off » à « invalid »', () => {
    vi.stubEnv('MFA_ENCRYPTION_KEY', '');
    expect(effectiveMfaMode({ user: { role: 'ADMIN', mfaEnabledAt: ENABLED_AT } })).toBe('invalid');
    expect(effectiveMfaMode({ user: { role: 'ADMIN', mfaEnabledAt: null } })).toBe('off');
    expect(effectiveMfaMode({ user: { role: 'STUDENT', mfaEnabledAt: ENABLED_AT } })).toBe('off');
    vi.stubEnv('MFA_ENCRYPTION_KEY', KEY);
    expect(effectiveMfaMode({ user: { role: 'ADMIN', mfaEnabledAt: ENABLED_AT } })).toBe('on');
  });

  it('activée, sans preuve : l\'ADMIN devient un étudiant (mfaPending)', async () => {
    const user = await getAuthUser(new Request('https://studenthub.test/api/x'));
    expect(user).toEqual({ id: 'admin-1', email: 'admin@exemple.com', role: 'STUDENT', mfaPending: true });
    expect(await requireAdmin(new Request('https://studenthub.test/api/x'))).toBeNull();
  });

  it('activée, avec une preuve valable de cette session : l\'ADMIN garde ses droits', async () => {
    const req = await requestWithProof();
    expect(await getAuthUser(req)).toEqual({ id: 'admin-1', email: 'admin@exemple.com', role: 'ADMIN' });
    expect(await requireAdmin(req)).not.toBeNull();
  });

  it('refuse la preuve d\'une autre session (nouvelle connexion)', async () => {
    const req = await requestWithProof({ at: AUTH_TIME - 500 });
    expect((await getAuthUser(req))?.role).toBe('STUDENT');
  });

  it('refuse la preuve d\'un autre compte', async () => {
    const req = await requestWithProof({ sub: 'someone-else' });
    expect((await getAuthUser(req))?.role).toBe('STUDENT');
  });

  it('refuse la preuve émise avant la réinitialisation du second facteur', async () => {
    const req = await requestWithProof({ ea: ENABLED_AT.getTime() - 1000 });
    expect((await getAuthUser(req))?.role).toBe('STUDENT');
  });

  it('refuse toute preuve tant que le second facteur n\'est pas activé en base', async () => {
    m.findUnique.mockResolvedValue(dbUser({ mfaEnabledAt: null }));
    const req = await requestWithProof();
    expect((await getAuthUser(req))?.role).toBe('STUDENT');
  });

  it('refuse une preuve signée avec une autre clé ou un cookie arbitraire', async () => {
    const forged = await signMfaProof(
      { sub: 'admin-1', at: AUTH_TIME, ea: ENABLED_AT.getTime() },
      new TextEncoder().encode('une-autre-cle-completement-differente-12345')
    );
    const req = new Request('https://studenthub.test/api/x', { headers: { cookie: `sh_mfa=${forged}` } });
    expect((await getAuthUser(req))?.role).toBe('STUDENT');
    const junk = new Request('https://studenthub.test/api/x', { headers: { cookie: 'sh_mfa=n-importe-quoi' } });
    expect((await getAuthUser(junk))?.role).toBe('STUDENT');
  });

  it('un jeton Bearer mobile ne donne jamais les droits ADMIN quand la fonction est active', async () => {
    m.auth.mockResolvedValue(null);
    const bearer = await new SignJWT({ id: 'admin-1', email: 'admin@exemple.com', role: 'ADMIN' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('admin-1')
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(secretBytes);
    const req = new Request('https://studenthub.test/api/x', { headers: { authorization: `Bearer ${bearer}` } });
    expect(await getAuthUser(req)).toEqual({ id: 'admin-1', email: 'admin@exemple.com', role: 'STUDENT', mfaPending: true });
  });

  it('un jeton Bearer garde les droits ADMIN quand la fonction est désactivée et l\'ADMIN non inscrit', async () => {
    vi.stubEnv('MFA_ENCRYPTION_KEY', '');
    m.findUnique.mockResolvedValue(dbUser({ mfaEnabledAt: null }));
    m.auth.mockResolvedValue(null);
    const bearer = await new SignJWT({ id: 'admin-1', email: 'admin@exemple.com', role: 'ADMIN' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('admin-1')
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(secretBytes);
    const req = new Request('https://studenthub.test/api/x', { headers: { authorization: `Bearer ${bearer}` } });
    expect((await getAuthUser(req))?.role).toBe('ADMIN');
  });

  it('clé mal formée : refus pour tout ADMIN, même avec une preuve (fail-closed)', async () => {
    vi.stubEnv('MFA_ENCRYPTION_KEY', 'pas-une-cle-valide');
    const req = await requestWithProof();
    expect(await getAuthUser(req)).toEqual({ id: 'admin-1', email: 'admin@exemple.com', role: 'STUDENT', mfaPending: true });
  });

  it('ne touche pas aux étudiants, avec ou sans preuve', async () => {
    m.findUnique.mockResolvedValue(dbUser({ role: 'STUDENT', mfaEnabledAt: null }));
    expect(await getAuthUser(new Request('https://studenthub.test/api/x'))).toEqual({
      id: 'admin-1',
      email: 'admin@exemple.com',
      role: 'STUDENT',
    });
  });

  it('un compte désactivé reste refusé quoi qu\'il arrive', async () => {
    m.findUnique.mockResolvedValue(dbUser({ isActive: false }));
    const req = await requestWithProof();
    expect(await getAuthUser(req)).toBeNull();
  });
});
