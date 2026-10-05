import { describe, expect, it } from 'vitest';
import {
  PACKS,
  SUBSCRIPTION_PACKS,
  TOPUP_PACKS,
  findPackForTransaction,
  formatDuration,
  formatPrice,
  getPack,
} from '@/lib/packs';

describe('catalogue des offres (PACKS)', () => {
  it('contient au moins une recharge et un abonnement', () => {
    expect(TOPUP_PACKS.length).toBeGreaterThan(0);
    expect(SUBSCRIPTION_PACKS.length).toBeGreaterThan(0);
  });

  it('partitionne exactement le catalogue entre recharges et abonnements', () => {
    expect(TOPUP_PACKS.length + SUBSCRIPTION_PACKS.length).toBe(PACKS.length);
    expect(PACKS.every((p) => p.type === 'TOPUP' || p.type === 'SUBSCRIPTION')).toBe(true);
  });

  it('a des identifiants et des noms uniques et non vides', () => {
    const ids = PACKS.map((p) => p.id);
    const names = PACKS.map((p) => p.name);
    expect(ids.every((id) => id.trim().length > 0)).toBe(true);
    expect(names.every((name) => name.trim().length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(names).size).toBe(names.length);
  });

  it('a des prix entiers strictement positifs (FCFA)', () => {
    for (const pack of PACKS) {
      expect(Number.isInteger(pack.price), `${pack.id}: prix entier`).toBe(true);
      expect(pack.price, `${pack.id}: prix > 0`).toBeGreaterThan(0);
    }
  });

  it('a des quantités de jetons entières et positives ou nulles', () => {
    for (const pack of PACKS) {
      expect(Number.isInteger(pack.tokens), `${pack.id}: jetons entiers`).toBe(true);
      expect(pack.tokens, `${pack.id}: jetons >= 0`).toBeGreaterThanOrEqual(0);
    }
  });

  it('une recharge donne des jetons et n\'a pas de durée d\'abonnement', () => {
    for (const pack of TOPUP_PACKS) {
      expect(pack.tokens, `${pack.id}: une recharge sans jeton n'a aucun sens`).toBeGreaterThan(0);
      expect(pack.durationDays, `${pack.id}: pas de durée sur une recharge`).toBeNull();
    }
  });

  it('un abonnement a une durée entière strictement positive', () => {
    for (const pack of SUBSCRIPTION_PACKS) {
      expect(Number.isInteger(pack.durationDays), `${pack.id}: durée entière`).toBe(true);
      expect(pack.durationDays as number, `${pack.id}: durée > 0`).toBeGreaterThan(0);
    }
  });

  it('les recharges plus chères coûtent moins cher par jeton (aucune offre dominée)', () => {
    const byPrice = [...TOPUP_PACKS].sort((a, b) => a.price - b.price);
    for (let i = 1; i < byPrice.length; i++) {
      const smaller = byPrice[i - 1];
      const bigger = byPrice[i];
      expect(bigger.tokens, `${bigger.id} doit donner plus de jetons que ${smaller.id}`).toBeGreaterThan(smaller.tokens);
      expect(bigger.price / bigger.tokens, `${bigger.id} doit être au moins aussi avantageux que ${smaller.id}`).toBeLessThanOrEqual(
        smaller.price / smaller.tokens
      );
    }
  });

  it('les abonnements plus longs ne donnent pas moins de jetons bonus', () => {
    const byDuration = [...SUBSCRIPTION_PACKS]
      // token_master est une offre "volume de jetons" avec 1 mois d'accès : hors de cette échelle de durées.
      .filter((p) => p.id !== 'token_master')
      .sort((a, b) => (a.durationDays as number) - (b.durationDays as number));
    for (let i = 1; i < byDuration.length; i++) {
      expect(byDuration[i].tokens).toBeGreaterThanOrEqual(byDuration[i - 1].tokens);
    }
  });
});

describe('getPack', () => {
  it('retrouve une offre par identifiant', () => {
    for (const pack of PACKS) expect(getPack(pack.id)).toBe(pack);
  });

  it('renvoie undefined pour un identifiant inconnu ou d\'un type invalide', () => {
    expect(getPack('inexistant')).toBeUndefined();
    expect(getPack('')).toBeUndefined();
    expect(getPack(undefined)).toBeUndefined();
    expect(getPack(null)).toBeUndefined();
    expect(getPack(42)).toBeUndefined();
    expect(getPack({ id: 'pro' })).toBeUndefined();
  });

  it('ne se laisse pas piéger par les propriétés héritées d\'Object', () => {
    expect(getPack('__proto__')).toBeUndefined();
    expect(getPack('constructor')).toBeUndefined();
  });

  it('ne renvoie jamais une offre retirée de la vente', () => {
    // L'ancien abonnement « monthly » (5 000 FCFA) n'est plus achetable.
    expect(getPack('monthly')).toBeUndefined();
  });
});

describe('findPackForTransaction', () => {
  const sample = PACKS[0];

  it('retrouve l\'offre par son nom canonique et son type', () => {
    const found = findPackForTransaction({
      packName: sample.name,
      type: sample.type,
      amount: sample.price,
      tokens: sample.tokens,
    });
    expect(found?.id).toBe(sample.id);
  });

  it('retrouve toutes les offres du catalogue à partir de leurs propres valeurs', () => {
    for (const pack of PACKS) {
      const found = findPackForTransaction({ packName: pack.name, type: pack.type, amount: pack.price, tokens: pack.tokens });
      expect(found?.id, pack.id).toBe(pack.id);
    }
  });

  it('reconnaît les anciens noms enregistrés avant l\'unification', () => {
    for (const pack of PACKS) {
      for (const legacyName of pack.legacyNames ?? []) {
        const found = findPackForTransaction({ packName: legacyName, type: pack.type, amount: pack.price, tokens: pack.tokens });
        expect(found?.id, `${pack.id} <- ${legacyName}`).toBe(pack.id);
      }
    }
  });

  it('refuse un nom qui n\'est qu\'une correspondance partielle', () => {
    const found = findPackForTransaction({
      packName: `${sample.name} (promo)`,
      type: sample.type,
      amount: 1,
      tokens: 1,
    });
    expect(found).toBeUndefined();
  });

  it('ne confond pas une recharge et un abonnement portant le même nom', () => {
    const found = findPackForTransaction({
      packName: sample.name,
      type: sample.type === 'TOPUP' ? 'SUBSCRIPTION' : 'TOPUP',
      amount: 1,
      tokens: 1,
    });
    expect(found).toBeUndefined();
  });
});

describe('formatPrice', () => {
  it('sépare les milliers par une espace insécable', () => {
    expect(formatPrice(500)).toBe('500');
    expect(formatPrice(2000)).toBe('2\u00a0000');
    expect(formatPrice(1250000)).toBe('1\u00a0250\u00a0000');
  });
});

describe('formatDuration', () => {
  it('exprime les multiples de 30 jours en mois', () => {
    expect(formatDuration(30)).toBe('1 mois');
    expect(formatDuration(90)).toBe('3 mois');
    expect(formatDuration(180)).toBe('6 mois');
  });

  it('exprime les autres durées en jours, avec le bon pluriel', () => {
    expect(formatDuration(1)).toBe('1 jour');
    expect(formatDuration(10)).toBe('10 jours');
    expect(formatDuration(45)).toBe('45 jours');
  });
});
