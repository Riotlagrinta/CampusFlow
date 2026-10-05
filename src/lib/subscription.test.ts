import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isPremium } from '@/lib/subscription';

const NOW = new Date('2026-06-15T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

describe('isPremium', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('est vrai pour un abonné dont l\'expiration est dans le futur', () => {
    expect(isPremium({ isSubscribed: true, subscriptionExpiresAt: new Date(NOW.getTime() + DAY_MS) })).toBe(true);
  });

  it('est faux pour un abonnement expiré, même si le drapeau isSubscribed est resté vrai', () => {
    expect(isPremium({ isSubscribed: true, subscriptionExpiresAt: new Date(NOW.getTime() - DAY_MS) })).toBe(false);
  });

  it('est faux à l\'instant exact de l\'expiration (borne exclusive)', () => {
    expect(isPremium({ isSubscribed: true, subscriptionExpiresAt: new Date(NOW.getTime()) })).toBe(false);
    expect(isPremium({ isSubscribed: true, subscriptionExpiresAt: new Date(NOW.getTime() + 1) })).toBe(true);
  });

  it('est faux sans date d\'expiration', () => {
    expect(isPremium({ isSubscribed: true, subscriptionExpiresAt: null })).toBe(false);
  });

  it('est faux pour un non-abonné, même avec une expiration future résiduelle', () => {
    expect(isPremium({ isSubscribed: false, subscriptionExpiresAt: new Date(NOW.getTime() + DAY_MS) })).toBe(false);
    expect(isPremium({ isSubscribed: false, subscriptionExpiresAt: null })).toBe(false);
  });

  it('évolue avec le temps : un abonnement valide expire sans intervention', () => {
    const user = { isSubscribed: true, subscriptionExpiresAt: new Date(NOW.getTime() + 30 * DAY_MS) };
    expect(isPremium(user)).toBe(true);

    vi.setSystemTime(new Date(NOW.getTime() + 31 * DAY_MS));
    expect(isPremium(user)).toBe(false);
  });
});
