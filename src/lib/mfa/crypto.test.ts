import { randomBytes } from 'crypto';
import { describe, expect, it } from 'vitest';
import {
  decryptSecret,
  deriveKey,
  encryptSecret,
  findRecoveryIndex,
  generateRecoveryCodes,
  hashRecoveryCode,
  normalizeRecoveryCode,
  parseRecoveryHashes,
  readMfaKey,
  RECOVERY_CODE_COUNT,
} from './crypto';

const key = randomBytes(32);

describe('readMfaKey', () => {
  it('est désactivée sans clé', () => {
    expect(readMfaKey(undefined)).toEqual({ state: 'off' });
    expect(readMfaKey('')).toEqual({ state: 'off' });
    expect(readMfaKey('   ')).toEqual({ state: 'off' });
  });

  it('accepte 32 octets en base64 standard ou URL-safe', () => {
    const standard = key.toString('base64');
    const urlSafe = key.toString('base64url');
    expect(readMfaKey(standard)).toEqual({ state: 'ok', key });
    expect(readMfaKey(urlSafe)).toEqual({ state: 'ok', key });
  });

  it('refuse une clé évidemment faible (octets nuls, motif répété)', () => {
    expect(readMfaKey(Buffer.alloc(32).toString('base64')).state).toBe('invalid');
    expect(readMfaKey(Buffer.alloc(32, 7).toString('base64')).state).toBe('invalid');
    expect(readMfaKey(Buffer.from('abababababababababababababababab').toString('base64')).state).toBe('invalid');
  });

  it('refuse une clé de mauvaise taille ou mal formée (état invalid, pas off)', () => {
    expect(readMfaKey(randomBytes(16).toString('base64')).state).toBe('invalid');
    expect(readMfaKey(randomBytes(64).toString('base64')).state).toBe('invalid');
    expect(readMfaKey('pas du base64 !!!').state).toBe('invalid');
    expect(readMfaKey('court').state).toBe('invalid');
  });
});

describe('deriveKey (HKDF)', () => {
  it('donne 32 octets, déterministes, différents par usage et différents de la clé maître', () => {
    const a = deriveKey(key, 'secret-encryption');
    expect(a).toHaveLength(32);
    expect(a.equals(deriveKey(key, 'secret-encryption'))).toBe(true);
    expect(a.equals(deriveKey(key, 'recovery-code'))).toBe(false);
    expect(a.equals(key)).toBe(false);
    expect(a.equals(deriveKey(randomBytes(32), 'secret-encryption'))).toBe(false);
  });
});

describe('encryptSecret / decryptSecret', () => {
  it('chiffre puis déchiffre', () => {
    const payload = encryptSecret('JBSWY3DPEHPK3PXP', key, 'user-1');
    expect(payload).toMatch(/^v1\.[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(payload).not.toContain('JBSWY3DPEHPK3PXP');
    expect(decryptSecret(payload, key, 'user-1')).toBe('JBSWY3DPEHPK3PXP');
  });

  it('produit un résultat différent à chaque appel (IV aléatoire)', () => {
    expect(encryptSecret('A', key, 'u')).not.toBe(encryptSecret('A', key, 'u'));
  });

  it('refuse un autre compte (AAD), une autre clé et une donnée altérée', () => {
    const payload = encryptSecret('SECRET', key, 'user-1');
    expect(decryptSecret(payload, key, 'user-2')).toBeNull();
    expect(decryptSecret(payload, randomBytes(32), 'user-1')).toBeNull();

    const parts = payload.split('.');
    const flipped = Buffer.from(parts[3], 'base64url');
    flipped[0] ^= 0xff;
    expect(decryptSecret([parts[0], parts[1], parts[2], flipped.toString('base64url')].join('.'), key, 'user-1')).toBeNull();
  });

  it('refuse les formats inconnus ou vides', () => {
    expect(decryptSecret(null, key, 'u')).toBeNull();
    expect(decryptSecret('', key, 'u')).toBeNull();
    expect(decryptSecret('v2.a.b.c', key, 'u')).toBeNull();
    expect(decryptSecret('v1.a.b', key, 'u')).toBeNull();
    expect(decryptSecret('en clair', key, 'u')).toBeNull();
  });
});

describe('codes de secours', () => {
  it('en génère 8, au format XXXXX-XXXXX, sans caractères ambigus et tous différents', () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(RECOVERY_CODE_COUNT);
    for (const code of codes) expect(code).toMatch(/^[A-HJKMNP-Z2-9]{5}-[A-HJKMNP-Z2-9]{5}$/);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('normalise la saisie (casse, tiret, espaces) et refuse le reste', () => {
    expect(normalizeRecoveryCode('abcde-fghjk')).toBe('ABCDEFGHJK');
    expect(normalizeRecoveryCode(' ABCDE FGHJK ')).toBe('ABCDEFGHJK');
    expect(normalizeRecoveryCode('ABCDE-FGHJ')).toBeNull();
    expect(normalizeRecoveryCode('ABCDE-FGHJ0')).toBeNull(); // 0 n'existe pas dans l'alphabet
    expect(normalizeRecoveryCode('ABCDE-FGHJI')).toBeNull(); // I non plus
    expect(normalizeRecoveryCode(12345 as unknown as string)).toBeNull();
  });

  it('retrouve un code par son empreinte, et pas un autre', () => {
    const codes = generateRecoveryCodes();
    const hashes = codes.map((c) => hashRecoveryCode(normalizeRecoveryCode(c)!, key));
    expect(findRecoveryIndex(hashes, normalizeRecoveryCode(codes[3])!, key)).toBe(3);
    expect(findRecoveryIndex(hashes, 'ZZZZZZZZZZ', key)).toBe(-1);
  });

  it('l\'empreinte dépend de la clé : sans elle, la base ne suffit pas à énumérer les codes', () => {
    const code = 'ABCDEFGHJK';
    expect(hashRecoveryCode(code, key)).not.toBe(hashRecoveryCode(code, randomBytes(32)));
    expect(hashRecoveryCode(code, key)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('parseRecoveryHashes ignore tout ce qui n\'est pas une empreinte valide', () => {
    const good = 'a'.repeat(64);
    expect(parseRecoveryHashes(JSON.stringify([good, 'court', 42, null]))).toEqual([good]);
    expect(parseRecoveryHashes('pas du json')).toEqual([]);
    expect(parseRecoveryHashes('{"a":1}')).toEqual([]);
    expect(parseRecoveryHashes(null)).toEqual([]);
  });
});
