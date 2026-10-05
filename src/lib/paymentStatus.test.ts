import { describe, expect, it } from 'vitest';
import {
  GATEWAY_FAILED_STATUSES,
  PENDING_EXPIRY_MS,
  classifyGatewayStatus,
  isPendingExpired,
  presentedStatus,
} from '@/lib/paymentStatus';

describe('classifyGatewayStatus', () => {
  it('reconnaît le succès, sans tenir compte de la casse ni des espaces', () => {
    expect(classifyGatewayStatus('SUCCESS')).toBe('success');
    expect(classifyGatewayStatus('success')).toBe('success');
    expect(classifyGatewayStatus('  Success ')).toBe('success');
  });

  it.each(['FAILED', 'CANCELLED', 'CANCELED', 'EXPIRED', 'DECLINED', 'REJECTED', 'ERROR'])(
    "classe %s comme un échec définitif",
    (status) => {
      expect(classifyGatewayStatus(status)).toBe('failed');
      expect(classifyGatewayStatus(status.toLowerCase())).toBe('failed');
    }
  );

  it('garde la liste des échecs exactement telle que documentée', () => {
    expect([...GATEWAY_FAILED_STATUSES].sort()).toEqual(
      ['CANCELED', 'CANCELLED', 'DECLINED', 'ERROR', 'EXPIRED', 'FAILED', 'REJECTED'].sort()
    );
  });

  it('laisse en attente tout statut inconnu ou ambigu', () => {
    for (const status of ['PENDING', 'PROCESSING', 'INITIATED', 'WAITING', 'REFUNDED', 'SUCCESSFUL', '']) {
      expect(classifyGatewayStatus(status)).toBe('pending');
    }
    expect(classifyGatewayStatus(null)).toBe('pending');
    expect(classifyGatewayStatus(undefined)).toBe('pending');
  });

  it("ne confond jamais un échec avec un succès (pas de correspondance partielle)", () => {
    expect(classifyGatewayStatus('NOT_SUCCESS')).toBe('pending');
    expect(classifyGatewayStatus('SUCCESS_FAILED')).toBe('pending');
  });
});

describe('expiration des transactions PENDING', () => {
  const now = Date.UTC(2026, 0, 10, 12, 0, 0);

  it('ne considère pas expirée une transaction récente', () => {
    expect(isPendingExpired(new Date(now - 60_000), now)).toBe(false);
    expect(isPendingExpired(new Date(now - PENDING_EXPIRY_MS), now)).toBe(false); // exactement 24 h
  });

  it('considère expirée une transaction de plus de 24 h', () => {
    expect(isPendingExpired(new Date(now - PENDING_EXPIRY_MS - 1), now)).toBe(true);
    expect(isPendingExpired(new Date(now - 3 * PENDING_EXPIRY_MS).toISOString(), now)).toBe(true);
    expect(isPendingExpired(now - 2 * PENDING_EXPIRY_MS, now)).toBe(true);
  });

  it('tolère une date absente ou invalide (jamais expirée)', () => {
    expect(isPendingExpired(null, now)).toBe(false);
    expect(isPendingExpired(undefined, now)).toBe(false);
    expect(isPendingExpired('pas une date', now)).toBe(false);
  });

  it('ne présente comme expirée qu\'une transaction PENDING ancienne', () => {
    const old = new Date(now - 2 * PENDING_EXPIRY_MS);
    const recent = new Date(now - 1000);
    expect(presentedStatus('PENDING', old, now)).toBe('EXPIRED');
    expect(presentedStatus('PENDING', recent, now)).toBe('PENDING');
    expect(presentedStatus('COMPLETED', old, now)).toBe('COMPLETED');
    expect(presentedStatus('FAILED', old, now)).toBe('FAILED');
  });
});
