import { describe, expect, it } from 'vitest';
import {
  base32Decode,
  base32Encode,
  buildOtpauthUrl,
  formatSecretForDisplay,
  generateTotpSecret,
  normalizeTotpCode,
  totpAt,
  totpStep,
  verifyTotp,
} from './totp';

// Secret de test de la RFC 6238 (annexe B) : l'ASCII « 12345678901234567890 », en base32.
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));

describe('base32', () => {
  it('encode et décode sans perte', () => {
    for (const text of ['', 'f', 'fo', 'foo', 'foob', 'fooba', 'foobar']) {
      expect(base32Decode(base32Encode(Buffer.from(text))).toString()).toBe(text);
    }
  });

  it('suit les vecteurs de la RFC 4648', () => {
    expect(base32Encode(Buffer.from('foobar'))).toBe('MZXW6YTBOI');
    expect(base32Encode(Buffer.from('fooba'))).toBe('MZXW6YTB');
  });

  it('ignore la casse, les espaces, les tirets et le remplissage', () => {
    expect(base32Decode('mzxw 6ytb-oi==').toString()).toBe('foobar');
  });

  it('refuse un caractère hors alphabet', () => {
    expect(() => base32Decode('MZXW1')).toThrow();
  });
});

describe('totpAt : vecteurs de la RFC 6238 (SHA-1)', () => {
  // Les valeurs de la RFC ont 8 chiffres ; les 6 derniers sont le code à 6 chiffres.
  const cases: Array<[number, string]> = [
    [59, '287082'],
    [1111111109, '081804'],
    [1111111111, '050471'],
    [1234567890, '005924'],
    [2000000000, '279037'],
  ];
  for (const [seconds, expected] of cases) {
    it(`t = ${seconds} s -> ${expected}`, () => {
      expect(totpAt(RFC_SECRET, seconds * 1000)).toBe(expected);
    });
  }

  it('donne 8 chiffres à t = 59 s comme la RFC', () => {
    expect(totpAt(RFC_SECRET, 59_000, 8)).toBe('94287082');
  });
});

describe('verifyTotp', () => {
  const now = 1_700_000_000_000;
  const step = totpStep(now);

  it('accepte le code courant et renvoie son pas', () => {
    expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, now), now)).toBe(step);
  });

  it('tolère un pas avant et un pas après, pas deux', () => {
    expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, now - 30_000), now)).toBe(step - 1);
    expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, now + 30_000), now)).toBe(step + 1);
    expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, now - 90_000), now)).toBeNull();
    expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, now + 90_000), now)).toBeNull();
  });

  it('refuse un code faux', () => {
    const good = totpAt(RFC_SECRET, now);
    const bad = good === '000000' ? '000001' : '000000';
    expect(verifyTotp(RFC_SECRET, bad, now)).toBeNull();
  });

  it('refuse le rejeu : un pas déjà consommé ne passe plus', () => {
    const code = totpAt(RFC_SECRET, now);
    expect(verifyTotp(RFC_SECRET, code, now, { afterStep: step - 1 })).toBe(step);
    expect(verifyTotp(RFC_SECRET, code, now, { afterStep: step })).toBeNull();
    expect(verifyTotp(RFC_SECRET, code, now, { afterStep: step + 5 })).toBeNull();
  });

  it('accepte un code saisi avec une espace', () => {
    const code = totpAt(RFC_SECRET, now);
    expect(verifyTotp(RFC_SECRET, `${code.slice(0, 3)} ${code.slice(3)}`, now)).toBe(step);
  });

  it('refuse les entrées qui ne sont pas 6 chiffres ou un secret illisible', () => {
    expect(verifyTotp(RFC_SECRET, '12345', now)).toBeNull();
    expect(verifyTotp(RFC_SECRET, '1234567', now)).toBeNull();
    expect(verifyTotp(RFC_SECRET, 'abcdef', now)).toBeNull();
    expect(verifyTotp(RFC_SECRET, 123456 as unknown as string, now)).toBeNull();
    expect(verifyTotp(RFC_SECRET, null, now)).toBeNull();
    expect(verifyTotp('!!pas du base32!!', '123456', now)).toBeNull();
  });

  it('un code d\'un autre secret est refusé', () => {
    const other = generateTotpSecret();
    expect(verifyTotp(RFC_SECRET, totpAt(other, now), now)).toBeNull();
  });
});

describe('normalizeTotpCode', () => {
  it('ne garde que 6 chiffres exacts', () => {
    expect(normalizeTotpCode('123456')).toBe('123456');
    expect(normalizeTotpCode(' 123 456 ')).toBe('123456');
    expect(normalizeTotpCode('12345')).toBeNull();
    expect(normalizeTotpCode('12345a')).toBeNull();
    expect(normalizeTotpCode(undefined)).toBeNull();
  });
});

describe('secret et URI', () => {
  it('génère 32 caractères base32 différents à chaque appel', () => {
    const a = generateTotpSecret();
    const b = generateTotpSecret();
    expect(a).toMatch(/^[A-Z2-7]{32}$/);
    expect(a).not.toBe(b);
    expect(base32Decode(a)).toHaveLength(20);
  });

  it('construit une URI otpauth lisible par les authentificateurs', () => {
    const url = buildOtpauthUrl({ issuer: 'StudentHub', account: 'admin@exemple.com', secretBase32: RFC_SECRET });
    expect(url.startsWith('otpauth://totp/StudentHub:admin%40exemple.com?')).toBe(true);
    const params = new URL(url).searchParams;
    expect(params.get('secret')).toBe(RFC_SECRET);
    expect(params.get('issuer')).toBe('StudentHub');
    expect(params.get('digits')).toBe('6');
    expect(params.get('period')).toBe('30');
    expect(params.get('algorithm')).toBe('SHA1');
  });

  it('affiche le secret par groupes de 4', () => {
    expect(formatSecretForDisplay('ABCDEFGHIJKLMNOP')).toBe('ABCD EFGH IJKL MNOP');
  });
});
