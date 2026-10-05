import bcrypt from 'bcryptjs';
import { describe, expect, it, vi } from 'vitest';

// authHelpers importe le rate limit persistant (donc Prisma) et NextResponse : on les
// remplace, ces tests ne portent que sur de la logique pure (aucune base, aucun serveur).
vi.mock('@/lib/rateLimit', () => ({ checkRateLimitDb: vi.fn() }));
vi.mock('next/server', () => ({ NextResponse: { json: vi.fn() } }));

import {
  BCRYPT_COST,
  identifierKey,
  identifierSchema,
  identifierWhere,
  isIssuedBeforePasswordChange,
  isReservedEmail,
  isTokenIdMismatch,
  isValidPhone,
  normalizePhone,
  otpCodeSchema,
  passwordSchema,
  personNameSchema,
  rateKey,
  verifyPassword,
} from '@/lib/authHelpers';

describe('identifierSchema (email OU téléphone, toujours une chaîne)', () => {
  it('accepte un email, un téléphone et des variantes courantes', () => {
    expect(identifierSchema.safeParse('etudiant@exemple.com').success).toBe(true);
    expect(identifierSchema.safeParse('22890000000').success).toBe(true);
    expect(identifierSchema.safeParse('+228 90 00 00 00').success).toBe(true);
  });

  it('retire les espaces autour de la valeur', () => {
    const result = identifierSchema.safeParse('  etudiant@exemple.com  ');
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe('etudiant@exemple.com');
  });

  it('respecte les bornes 3 et 100 caractères (après trim)', () => {
    expect(identifierSchema.safeParse('abc').success).toBe(true);
    expect(identifierSchema.safeParse('a'.repeat(100)).success).toBe(true);

    expect(identifierSchema.safeParse('').success).toBe(false);
    expect(identifierSchema.safeParse('ab').success).toBe(false);
    expect(identifierSchema.safeParse('   ab   ').success).toBe(false);
    expect(identifierSchema.safeParse('a'.repeat(101)).success).toBe(false);
  });

  it('refuse les objets : aucun opérateur Prisma ne peut passer par identifier', () => {
    const injections: unknown[] = [
      { startsWith: '' },
      { contains: '@' },
      { not: '' },
      { in: ['admin@exemple.com'] },
      { gt: '' },
      { OR: [{ email: { startsWith: '' } }] },
      ['etudiant@exemple.com'],
      [{ startsWith: '' }],
    ];
    for (const value of injections) {
      expect(identifierSchema.safeParse(value).success, JSON.stringify(value)).toBe(false);
    }
  });

  it('refuse les types non textuels', () => {
    for (const value of [undefined, null, 123456, true, false, 0, () => 'abc', Symbol('x')]) {
      expect(identifierSchema.safeParse(value).success, String(typeof value)).toBe(false);
    }
  });

  it('renvoie un message d\'erreur en français quand la valeur est absente', () => {
    const result = identifierSchema.safeParse(undefined);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toBe('Email ou téléphone requis');
  });
});

describe('otpCodeSchema', () => {
  it('n\'accepte que 6 chiffres exactement', () => {
    expect(otpCodeSchema.safeParse('123456').success).toBe(true);
    expect(otpCodeSchema.safeParse('000042').success).toBe(true); // zéros initiaux conservés
    expect(otpCodeSchema.safeParse(' 123456 ').success).toBe(true); // trim

    for (const value of ['12345', '1234567', '12345a', '12 456', '', 123456, { $gt: '' }, null]) {
      expect(otpCodeSchema.safeParse(value).success, JSON.stringify(value)).toBe(false);
    }
  });
});

describe('passwordSchema', () => {
  it('exige 8 caractères minimum', () => {
    expect(passwordSchema.safeParse('1234567').success).toBe(false);
    expect(passwordSchema.safeParse('12345678').success).toBe(true);
  });

  it('refuse plus de 72 octets (limite de bcrypt) au lieu de tronquer en silence', () => {
    expect(passwordSchema.safeParse('a'.repeat(72)).success).toBe(true);
    expect(passwordSchema.safeParse('a'.repeat(73)).success).toBe(false);
    // 40 caractères de 2 octets = 80 octets
    expect(passwordSchema.safeParse('é'.repeat(40)).success).toBe(false);
  });

  it('refuse les valeurs non textuelles', () => {
    expect(passwordSchema.safeParse(undefined).success).toBe(false);
    expect(passwordSchema.safeParse(12345678).success).toBe(false);
    expect(passwordSchema.safeParse({ length: 99 }).success).toBe(false);
  });
});

describe('normalizePhone / isValidPhone', () => {
  it('ne garde que les chiffres', () => {
    expect(normalizePhone('+228 90-00.00.00')).toBe('22890000000');
    expect(normalizePhone('(228) 90 00 00 00')).toBe('22890000000');
    expect(normalizePhone('abc')).toBe('');
  });

  it('valide 8 à 15 chiffres', () => {
    expect(isValidPhone('1234567')).toBe(false);
    expect(isValidPhone('12345678')).toBe(true);
    expect(isValidPhone('22890000000')).toBe(true);
    expect(isValidPhone('1'.repeat(15))).toBe(true);
    expect(isValidPhone('1'.repeat(16))).toBe(false);
    expect(isValidPhone('')).toBe(false);
    expect(isValidPhone('2289000000a')).toBe(false);
  });
});

describe('identifierWhere / identifierKey', () => {
  type Clause = Record<string, unknown>;
  const clauses = (identifier: string) => (identifierWhere(identifier).OR as Clause[]) ?? [];

  it('cherche un email tel que saisi et en minuscules (emails historiques de casse libre)', () => {
    expect(clauses('Etudiant@Exemple.com')).toEqual([{ email: 'Etudiant@Exemple.com' }, { email: 'etudiant@exemple.com' }]);
    expect(clauses('etudiant@exemple.com')).toEqual([{ email: 'etudiant@exemple.com' }]);
  });

  it('cherche un téléphone avec et sans « + »', () => {
    expect(clauses('+228 90 00 00 00')).toEqual(
      expect.arrayContaining([{ phone: '22890000000' }, { phone: '+22890000000' }])
    );
  });

  it('ne produit que des égalités sur des chaînes (jamais d\'opérateur Prisma)', () => {
    for (const id of ['etudiant@exemple.com', 'Etudiant@Exemple.com', '22890000000', '+228 90 00 00 00']) {
      for (const clause of clauses(id)) {
        const values = Object.values(clause);
        expect(values).toHaveLength(1);
        expect(typeof values[0], `${id} -> ${JSON.stringify(clause)}`).toBe('string');
      }
    }
  });

  it('produit une clé canonique stable pour le rate limit', () => {
    expect(identifierKey('  Etudiant@Exemple.COM ')).toBe('etudiant@exemple.com');
    expect(identifierKey('+228 90 00 00 00')).toBe('22890000000');
    expect(identifierKey('22890000000')).toBe(identifierKey('+228 90 00 00 00'));
  });
});

describe('rateKey', () => {
  it('est déterministe, préfixée par la portée et ne contient pas la valeur en clair', () => {
    const key = rateKey('login:id', 'etudiant@exemple.com');
    expect(key).toBe(rateKey('login:id', 'etudiant@exemple.com'));
    expect(key.startsWith('login:id:')).toBe(true);
    expect(key).not.toContain('etudiant');
    expect(key).not.toContain('@');
  });

  it('distingue les valeurs et les portées', () => {
    expect(rateKey('login:id', 'a@exemple.com')).not.toBe(rateKey('login:id', 'b@exemple.com'));
    expect(rateKey('login:id', 'a@exemple.com')).not.toBe(rateKey('otp:id', 'a@exemple.com'));
  });
});

describe('isIssuedBeforePasswordChange (révocation des sessions)', () => {
  const changedAt = new Date('2026-10-03T12:00:00.500Z'); // 12:00:00 en secondes entières
  const changedSeconds = Math.floor(changedAt.getTime() / 1000);

  it('ne contrôle rien tant que le mot de passe n\'a jamais été changé', () => {
    expect(isIssuedBeforePasswordChange(1, null)).toBe(false);
    expect(isIssuedBeforePasswordChange(undefined, null)).toBe(false);
    expect(isIssuedBeforePasswordChange(undefined, undefined)).toBe(false);
  });

  it('refuse une session ouverte avant le changement', () => {
    expect(isIssuedBeforePasswordChange(changedSeconds - 1, changedAt)).toBe(true);
    expect(isIssuedBeforePasswordChange(changedSeconds - 3600, changedAt)).toBe(true);
  });

  it('accepte une session ouverte dans la même seconde (connexion juste après une réinitialisation)', () => {
    expect(isIssuedBeforePasswordChange(changedSeconds, changedAt)).toBe(false);
  });

  it('accepte une session ouverte après le changement', () => {
    expect(isIssuedBeforePasswordChange(changedSeconds + 1, changedAt)).toBe(false);
    expect(isIssuedBeforePasswordChange(changedSeconds + 86_400, changedAt)).toBe(false);
  });

  it('compare en secondes : les millisecondes du changement ne rejettent pas la seconde en cours', () => {
    const lateInSecond = new Date('2026-10-03T12:00:00.999Z');
    expect(isIssuedBeforePasswordChange(changedSeconds, lateInSecond)).toBe(false);
  });

  it('refuse une session sans date d\'émission valide dès que le mot de passe a changé', () => {
    expect(isIssuedBeforePasswordChange(undefined, changedAt)).toBe(true);
    expect(isIssuedBeforePasswordChange(null, changedAt)).toBe(true);
    expect(isIssuedBeforePasswordChange(Number.NaN, changedAt)).toBe(true);
    expect(isIssuedBeforePasswordChange(Number.POSITIVE_INFINITY, changedAt)).toBe(true);
    expect(isIssuedBeforePasswordChange('1790000000' as unknown as number, changedAt)).toBe(true);
  });
});

describe('verifyPassword : compte inconnu', () => {
  it('compare un hash factice du MÊME coût que les vrais hash (pas de fuite par le temps de réponse)', async () => {
    const hashSpy = vi.spyOn(bcrypt, 'hash').mockResolvedValue('hash-factice' as never);
    const compareSpy = vi.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);

    expect(await verifyPassword('mot-de-passe-quelconque', null)).toBe(false);

    expect(hashSpy).toHaveBeenCalledTimes(1);
    expect(hashSpy.mock.calls[0][1]).toBe(BCRYPT_COST);
    expect(compareSpy).toHaveBeenCalledWith('mot-de-passe-quelconque', 'hash-factice');
  });

  it('compare le vrai hash quand le compte existe', async () => {
    const compareSpy = vi.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
    expect(await verifyPassword('bon', '$2b$12$hashreel')).toBe(true);
    expect(compareSpy).toHaveBeenCalledWith('bon', '$2b$12$hashreel');
  });
});

describe('isReservedEmail (comptes système et noms réservés)', () => {
  it('refuse les comptes système réellement utilisés par le code', () => {
    expect(isReservedEmail('ai-tutor@defitech.tg')).toBe(true);
    expect(isReservedEmail('compte-supprime@studenthub.invalid')).toBe(true);
  });

  it('est insensible à la casse et aux espaces', () => {
    expect(isReservedEmail('AI-Tutor@DefiTech.TG')).toBe(true);
    expect(isReservedEmail('  ai-tutor@defitech.tg  ')).toBe(true);
    expect(isReservedEmail(' Compte-Supprime@StudentHub.Invalid ')).toBe(true);
    expect(isReservedEmail('ADMIN@defitech.tg')).toBe(true);
  });

  it('refuse tout domaine .invalid (TLD réservé, jamais routable)', () => {
    expect(isReservedEmail('n-importe-qui@studenthub.invalid')).toBe(true);
    expect(isReservedEmail('a@b.c.invalid')).toBe(true);
    expect(isReservedEmail('a@invalid')).toBe(true);
    expect(isReservedEmail('a@exemple.INVALID')).toBe(true);
    expect(isReservedEmail('a@exemple.invalid.')).toBe(true);
  });

  it('refuse admin@, support@ et noreply@ du domaine de l\'organisation (étiquette « + » comprise)', () => {
    expect(isReservedEmail('admin@defitech.tg')).toBe(true);
    expect(isReservedEmail('support@defitech.tg')).toBe(true);
    expect(isReservedEmail('noreply@defitech.tg')).toBe(true);
    expect(isReservedEmail('admin+promo@defitech.tg')).toBe(true);
  });

  it('accepte les adresses ordinaires', () => {
    expect(isReservedEmail('etudiant@defitech.tg')).toBe(false);
    expect(isReservedEmail('admin@gmail.com')).toBe(false); // le nom seul n'est réservé que sur le domaine de l'organisation
    expect(isReservedEmail('ai-tutor@gmail.com')).toBe(false);
    expect(isReservedEmail('invalid@gmail.com')).toBe(false);
    expect(isReservedEmail('a@notinvalid.com')).toBe(false);
    expect(isReservedEmail('a@invalid.com')).toBe(false);
    expect(isReservedEmail('administrateur@defitech.tg')).toBe(false);
    expect(isReservedEmail('')).toBe(false);
    expect(isReservedEmail('pas-un-email')).toBe(false);
  });
});

describe('personNameSchema (prénom / nom insérés dans des messages officiels)', () => {
  const parse = (value: unknown, label = 'Prénom') => personNameSchema(label).safeParse(value);

  it('accepte les noms usuels, accents, apostrophes, tirets et initiales', () => {
    for (const name of [
      'Koffi',
      'Aïcha',
      'Jean-Pierre',
      "N'Dri",
      'N’Guessan',
      'Marie Claire',
      'José',
      'Müller',
      'Ñandú',
      'Adjoa',
      'J. Paul',
      'J.-P.',
      'O\'Brien',
      'Çelik',
      'Amadou Tidiane Diallo',
      'Nguyễn',
      '李明',
    ]) {
      expect(parse(name).success, name).toBe(true);
    }
  });

  it('accepte les lettres combinantes (accent décomposé)', () => {
    expect(parse('José').success).toBe(true); // « José » en e + accent combinant
  });

  it('retire les espaces autour de la valeur', () => {
    const result = parse('  Koffi  ');
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe('Koffi');
  });

  it('refuse les chiffres, liens, symboles et balises', () => {
    for (const name of [
      'Koffi2',
      '123',
      'https://evil.com',
      'http://evil.com/pay',
      'evil.com',
      'bit.ly',
      'www.paiement-securise.tg',
      'Koffi:',
      'a/b',
      'Koffi@evil',
      '<b>Koffi</b>',
      'Koffi>',
      'Koffi<',
      'Koffi_Dupont',
      'Koffi!',
      'Koffi\nDupont',
      'Koffi\tDupont',
      '+22890000000',
      '😀',
    ]) {
      expect(parse(name).success, name).toBe(false);
    }
  });

  it('exige une lettre en première position', () => {
    for (const name of ['-Koffi', "'Koffi", '.Koffi', '’Koffi']) {
      expect(parse(name).success, name).toBe(false);
    }
  });

  it('refuse vide, espaces seuls, trop long et valeurs non textuelles', () => {
    expect(parse('').success).toBe(false);
    expect(parse('   ').success).toBe(false);
    expect(parse('a'.repeat(50)).success).toBe(true);
    expect(parse('a'.repeat(51)).success).toBe(false);
    for (const value of [undefined, null, 42, { startsWith: '' }, ['Koffi']]) {
      expect(parse(value).success, JSON.stringify(value)).toBe(false);
    }
  });

  it('renvoie un message clair en français, avec le libellé du champ', () => {
    const invalid = parse('Koffi2', 'Prénom');
    expect(invalid.success).toBe(false);
    if (!invalid.success) {
      expect(invalid.error.issues[0].message).toContain('Prénom invalide');
      expect(invalid.error.issues[0].message).toContain('lettres');
    }

    const link = parse('evil.com', 'Nom');
    expect(link.success).toBe(false);
    if (!link.success) expect(link.error.issues[0].message).toContain('Nom invalide');

    const tooLong = parse('a'.repeat(51), 'Nom');
    if (!tooLong.success) expect(tooLong.error.issues[0].message).toBe('Nom trop long (50 caractères maximum)');

    const missing = parse(undefined, 'Prénom');
    if (!missing.success) expect(missing.error.issues[0].message).toBe('Prénom requis');
  });
});

describe('isTokenIdMismatch (jeton d\'un compte supprimé puis recréé)', () => {
  it('accepte un identifiant identique à celui du compte trouvé en base', () => {
    expect(isTokenIdMismatch('user-2', 'user-2')).toBe(false);
    expect(isTokenIdMismatch('user-2', 'user-2', 'user-2')).toBe(false); // JWT mobile : id et sub
  });

  it('refuse un identifiant différent (ancien compte, même email)', () => {
    expect(isTokenIdMismatch('user-2', 'user-1')).toBe(true);
    expect(isTokenIdMismatch('user-2', 'user-2', 'user-1')).toBe(true);
    expect(isTokenIdMismatch('user-2', 'user-1', 'user-2')).toBe(true);
  });

  it('accepte un jeton sans identifiant (anciens jetons)', () => {
    expect(isTokenIdMismatch('user-2')).toBe(false);
    expect(isTokenIdMismatch('user-2', undefined)).toBe(false);
    expect(isTokenIdMismatch('user-2', undefined, undefined)).toBe(false);
    expect(isTokenIdMismatch('user-2', null)).toBe(false);
    expect(isTokenIdMismatch('user-2', '')).toBe(false);
  });

  it('accepte quand un seul des deux identifiants (id ou sub) est présent et correct', () => {
    expect(isTokenIdMismatch('user-2', undefined, 'user-2')).toBe(false);
    expect(isTokenIdMismatch('user-2', 'user-2', undefined)).toBe(false);
  });

  it('refuse un identifiant présent mais non textuel ou de casse différente', () => {
    expect(isTokenIdMismatch('123', 123)).toBe(true);
    expect(isTokenIdMismatch('user-2', { toString: () => 'user-2' })).toBe(true);
    expect(isTokenIdMismatch('abc', 'ABC')).toBe(true);
  });
});
