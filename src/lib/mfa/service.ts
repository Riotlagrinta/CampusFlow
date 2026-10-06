import { prisma } from '@/lib/prisma';
import {
  decryptSecret,
  encryptSecret,
  findRecoveryIndex,
  generateRecoveryCodes,
  hashRecoveryCode,
  normalizeRecoveryCode,
  parseRecoveryHashes,
  readMfaKey,
} from '@/lib/mfa/crypto';
import {
  buildOtpauthUrl,
  formatSecretForDisplay,
  generateTotpSecret,
  normalizeTotpCode,
  verifyTotp,
} from '@/lib/mfa/totp';

// Opérations de base de données de la double authentification. Chaque changement d'état est une
// écriture conditionnelle (`updateMany` avec le contenu attendu) : deux requêtes simultanées ne
// peuvent pas consommer deux fois le même code, ni activer deux fois le second facteur.

export const MFA_ISSUER = 'StudentHub';

export class MfaConfigError extends Error {
  constructor() {
    super('MFA_ENCRYPTION_KEY absente ou invalide');
    this.name = 'MfaConfigError';
  }
}

function requireKey(): Buffer {
  const state = readMfaKey();
  if (state.state !== 'ok') throw new MfaConfigError();
  return state.key;
}

export type EnrollmentStart = { secretDisplay: string; otpauthUrl: string };

/**
 * Démarre l'activation : génère un secret, le stocke chiffré (non actif tant que `mfaEnabledAt` est
 * null) et le renvoie UNE fois pour l'affichage. Refusé si un second facteur est déjà actif : le
 * remplacer exigerait de le prouver d'abord (non prévu ; voir la procédure de secours en SQL).
 */
export async function beginEnrollment(userId: string, email: string): Promise<EnrollmentStart | 'already_enrolled'> {
  const key = requireKey();
  const secret = generateTotpSecret();
  const stored = await prisma.user.updateMany({
    where: { id: userId, mfaEnabledAt: null },
    data: { mfaSecret: encryptSecret(secret, key, userId), mfaLastStep: null, mfaRecovery: null },
  });
  if (stored.count !== 1) return 'already_enrolled';

  return {
    secretDisplay: formatSecretForDisplay(secret),
    otpauthUrl: buildOtpauthUrl({ issuer: MFA_ISSUER, account: email, secretBase32: secret }),
  };
}

export type ConfirmResult =
  | { ok: true; recoveryCodes: string[]; enabledAt: Date }
  | { ok: false; reason: 'no_pending' | 'invalid_code' };

/** Active le second facteur si le code prouve que l'authentificateur est bien configuré. */
export async function confirmEnrollment(userId: string, code: unknown): Promise<ConfirmResult> {
  const key = requireKey();
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { mfaSecret: true, mfaEnabledAt: true },
  });
  if (!row || row.mfaEnabledAt || !row.mfaSecret) return { ok: false, reason: 'no_pending' };

  const secret = decryptSecret(row.mfaSecret, key, userId);
  if (!secret) return { ok: false, reason: 'no_pending' };

  const step = verifyTotp(secret, code, Date.now());
  if (step === null) return { ok: false, reason: 'invalid_code' };

  const recoveryCodes = generateRecoveryCodes();
  const hashes = recoveryCodes.map((c) => hashRecoveryCode(normalizeRecoveryCode(c) as string, key));
  const enabledAt = new Date();

  const activated = await prisma.user.updateMany({
    where: { id: userId, mfaEnabledAt: null, mfaSecret: row.mfaSecret },
    data: { mfaEnabledAt: enabledAt, mfaLastStep: step, mfaRecovery: JSON.stringify(hashes) },
  });
  if (activated.count !== 1) return { ok: false, reason: 'no_pending' };

  return { ok: true, recoveryCodes, enabledAt };
}

export type VerifyResult =
  | { ok: true; enabledAt: Date; usedRecovery: boolean; recoveryLeft: number }
  | { ok: false; reason: 'not_enrolled' | 'invalid_code' | 'unreadable' };

/**
 * Valide un code à 6 chiffres (jamais deux fois le même pas) ou un code de secours (à usage unique).
 * Le message d'échec est le même pour tout code faux : rien n'indique ce qui a manqué.
 */
export async function verifySecondFactor(userId: string, input: unknown): Promise<VerifyResult> {
  const key = requireKey();
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { mfaSecret: true, mfaEnabledAt: true, mfaLastStep: true, mfaRecovery: true },
  });
  if (!row || !row.mfaEnabledAt || !row.mfaSecret) return { ok: false, reason: 'not_enrolled' };

  const secret = decryptSecret(row.mfaSecret, key, userId);

  const totp = normalizeTotpCode(input);
  if (totp) {
    // Secret illisible : seuls les codes de secours (empreintes HMAC, sans le secret) peuvent encore servir.
    if (!secret) return { ok: false, reason: 'unreadable' };
    const step = verifyTotp(secret, totp, Date.now(), { afterStep: row.mfaLastStep });
    if (step === null) return { ok: false, reason: 'invalid_code' };

    const consumed = await prisma.user.updateMany({
      where: {
        id: userId,
        mfaEnabledAt: row.mfaEnabledAt,
        OR: [{ mfaLastStep: null }, { mfaLastStep: { lt: step } }],
      },
      data: { mfaLastStep: step },
    });
    if (consumed.count !== 1) return { ok: false, reason: 'invalid_code' };
    return {
      ok: true,
      enabledAt: row.mfaEnabledAt,
      usedRecovery: false,
      recoveryLeft: parseRecoveryHashes(row.mfaRecovery).length,
    };
  }

  const recovery = normalizeRecoveryCode(input);
  if (recovery) {
    const hashes = parseRecoveryHashes(row.mfaRecovery);
    const index = findRecoveryIndex(hashes, recovery, key);
    if (index === -1) return { ok: false, reason: 'invalid_code' };

    const remaining = hashes.filter((_, i) => i !== index);
    const consumed = await prisma.user.updateMany({
      where: { id: userId, mfaEnabledAt: row.mfaEnabledAt, mfaRecovery: row.mfaRecovery },
      data: { mfaRecovery: JSON.stringify(remaining) },
    });
    if (consumed.count !== 1) return { ok: false, reason: 'invalid_code' };
    return { ok: true, enabledAt: row.mfaEnabledAt, usedRecovery: true, recoveryLeft: remaining.length };
  }

  return { ok: false, reason: 'invalid_code' };
}
