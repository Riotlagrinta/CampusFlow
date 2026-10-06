import { describe, expect, it } from 'vitest';
import { buildMfaEmail } from './notify';

const WHEN = new Date('2026-10-05T14:30:00.000Z');

describe('buildMfaEmail', () => {
  it("annonce l'activation avec la date et dit quoi faire si ce n'est pas l'intéressé", () => {
    const { subject, html } = buildMfaEmail({ kind: 'enrolled' }, WHEN);
    expect(subject).toContain('Double authentification activée');
    expect(html).toContain('2026');
    expect(html).toContain('Mot de passe oublié');
    expect(html).toContain('administrateur système');
  });

  it("annonce l'usage d'un code de secours et le nombre restant", () => {
    const { subject, html } = buildMfaEmail({ kind: 'recovery-used', remaining: 5 }, WHEN);
    expect(subject).toContain('code de secours');
    expect(html).toContain('Il vous en reste 5');
  });

  it('ne contient aucun code, secret ni lien : seulement une information', () => {
    for (const event of [{ kind: 'enrolled' as const }, { kind: 'recovery-used' as const, remaining: 0 }]) {
      const { html } = buildMfaEmail(event, WHEN);
      expect(html).not.toMatch(/https?:\/\//);
      // aucun nombre de 6 chiffres isolé (hors couleurs hexadécimales du style, comme #059669)
      expect(html).not.toMatch(/(?<![#\w])\d{6}(?!\w)/);
    }
  });
});
