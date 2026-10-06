import { describe, expect, it } from 'vitest';
import { SignJWT, decodeJwt, jwtVerify } from 'jose';
import { deriveKey } from './crypto';
import {
  adminMfaDecision,
  mfaCookieNames,
  mfaCookieSettings,
  mfaMode,
  proofMatches,
  readCookieValue,
  signMfaProof,
  verifyMfaProof,
} from './proof';

const secret = new TextEncoder().encode('secret-de-test-pour-les-preuves-mfa');
const claims = { sub: 'user-1', at: 1_700_000_000, ea: 1_699_999_000_000 };

describe('signMfaProof / verifyMfaProof', () => {
  it('signe puis vérifie une preuve', async () => {
    const token = await signMfaProof(claims, secret);
    expect(await verifyMfaProof(token, secret)).toEqual(claims);
  });

  it('refuse une autre clé, un jeton altéré ou absent', async () => {
    const token = await signMfaProof(claims, secret);
    expect(await verifyMfaProof(token, new TextEncoder().encode('autre-secret-completement-different'))).toBeNull();
    expect(await verifyMfaProof(`${token}x`, secret)).toBeNull();
    expect(await verifyMfaProof(null, secret)).toBeNull();
    expect(await verifyMfaProof(token, null)).toBeNull();
    expect(await verifyMfaProof('', secret)).toBeNull();
  });

  it('refuse une preuve expirée', async () => {
    const longAgo = Math.floor(Date.now() / 1000) - 13 * 3600;
    expect(await verifyMfaProof(await signMfaProof(claims, secret, longAgo), secret)).toBeNull();
  });

  it('refuse un jeton Bearer mobile : même clé et même algorithme, mais pas le même type', async () => {
    const bearer = await new SignJWT({ id: 'user-1', email: 'a@b.c', role: 'ADMIN' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('user-1')
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(secret);
    expect(await verifyMfaProof(bearer, secret)).toBeNull();
  });

  it('une preuve MFA n\'est pas non plus un jeton Bearer : pas de claim email, et clé de signature distincte', async () => {
    const token = await signMfaProof(claims, secret);
    expect(typeof decodeJwt(token).email).not.toBe('string');
    // Vérifiée avec AUTH_SECRET brute (la clé des jetons Bearer), la preuve est rejetée.
    await expect(jwtVerify(token, secret)).rejects.toThrow();
  });

  it('refuse un jeton reformaté avec les bons claims mais signé comme un Bearer (AUTH_SECRET brute)', async () => {
    const forged = await new SignJWT({ typ: 'mfa-proof', at: claims.at, ea: claims.ea })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(claims.sub)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(secret);
    expect(await verifyMfaProof(forged, secret)).toBeNull();
  });

  it('refuse un jeton sans expiration, même correctement signé', async () => {
    const noExp = await new SignJWT({ typ: 'mfa-proof', at: claims.at, ea: claims.ea })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(claims.sub)
      .setIssuedAt()
      .sign(deriveKey(secret, 'mfa-proof'));
    expect(await verifyMfaProof(noExp, secret)).toBeNull();
  });
});

describe('proofMatches', () => {
  const expected = { userId: 'user-1', authTime: 1_700_000_000, enabledAtMs: 1_699_999_000_000 };

  it('accepte une preuve cohérente', () => {
    expect(proofMatches(claims, expected)).toBe(true);
  });

  it('refuse un autre compte, une autre session ou un second facteur refait', () => {
    expect(proofMatches(claims, { ...expected, userId: 'user-2' })).toBe(false);
    expect(proofMatches(claims, { ...expected, authTime: 1_700_000_001 })).toBe(false);
    expect(proofMatches(claims, { ...expected, authTime: undefined })).toBe(false);
    expect(proofMatches(claims, { ...expected, enabledAtMs: 1_699_999_000_001 })).toBe(false);
    expect(proofMatches(claims, { ...expected, enabledAtMs: null })).toBe(false);
    expect(proofMatches(null, expected)).toBe(false);
  });

  it('sans contrôle de mfaEnabledAt (proxy), seule la session et le compte comptent', () => {
    expect(proofMatches(claims, { ...expected, enabledAtMs: null }, false)).toBe(true);
    expect(proofMatches(claims, { ...expected, authTime: 5 }, false)).toBe(false);
  });
});

describe('readCookieValue', () => {
  it('lit le premier nom présent', () => {
    const header = 'a=1; __Host-sh_mfa=SECURE; sh_mfa=PLAIN; autre=2';
    expect(readCookieValue(header, ['__Host-sh_mfa', 'sh_mfa'])).toBe('SECURE');
    expect(readCookieValue('sh_mfa=PLAIN', ['__Host-sh_mfa', 'sh_mfa'])).toBe('PLAIN');
  });

  it('ne confond pas un nom qui en contient un autre, et gère les entrées vides', () => {
    expect(readCookieValue('xsh_mfa=1', ['sh_mfa'])).toBeNull();
    expect(readCookieValue('', ['sh_mfa'])).toBeNull();
    expect(readCookieValue(null, ['sh_mfa'])).toBeNull();
  });

  it('garde les « = » dans la valeur (un JWT n\'en a pas, mais une valeur base64 oui)', () => {
    expect(readCookieValue('sh_mfa=abc==', ['sh_mfa'])).toBe('abc==');
  });
});

describe('mfaCookieNames', () => {
  it('ne lit que le nom __Host- en production (pas de cookie tossing), le nom simple sinon', () => {
    expect(mfaCookieNames(true)).toEqual(['__Host-sh_mfa']);
    expect(mfaCookieNames(false)).toEqual(['sh_mfa']);
  });
});

describe('mfaCookieSettings', () => {
  it('préfixe __Host- et Secure en HTTPS, nom simple en développement', () => {
    expect(mfaCookieSettings(true).name).toBe('__Host-sh_mfa');
    expect(mfaCookieSettings(true).options.secure).toBe(true);
    expect(mfaCookieSettings(false).name).toBe('sh_mfa');
    expect(mfaCookieSettings(true).options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' });
  });
});

describe('mfaMode', () => {
  it('suit la clé de chiffrement', () => {
    expect(mfaMode('')).toBe('off');
    expect(mfaMode(Buffer.from('0123456789abcdefghijklmnopqrstuv').toString('base64'))).toBe('on');
    expect(mfaMode(Buffer.alloc(32, 7).toString('base64'))).toBe('invalid'); // clé faible
    expect(mfaMode('mal-forme')).toBe('invalid');
  });
});

describe('adminMfaDecision', () => {
  const base = { mode: 'on' as const, role: 'ADMIN', source: 'cookie' as const, proofOk: true };

  it('ne touche jamais aux non-administrateurs', () => {
    for (const mode of ['off', 'on', 'invalid'] as const) {
      expect(adminMfaDecision({ ...base, mode, role: 'STUDENT', proofOk: false })).toBe('keep');
    }
  });

  it('fonction désactivée : l\'ADMIN garde ses droits', () => {
    expect(adminMfaDecision({ ...base, mode: 'off', proofOk: false })).toBe('keep');
    expect(adminMfaDecision({ ...base, mode: 'off', source: 'bearer', proofOk: false })).toBe('keep');
  });

  it('activée : il faut une preuve valable, sur le web uniquement', () => {
    expect(adminMfaDecision(base)).toBe('keep');
    expect(adminMfaDecision({ ...base, proofOk: false })).toBe('downgrade');
    expect(adminMfaDecision({ ...base, source: 'bearer', proofOk: true })).toBe('downgrade');
  });

  it('clé mal formée : refus pour tous les ADMIN (fail-closed)', () => {
    expect(adminMfaDecision({ ...base, mode: 'invalid' })).toBe('downgrade');
    expect(adminMfaDecision({ ...base, mode: 'invalid', proofOk: false })).toBe('downgrade');
  });
});
