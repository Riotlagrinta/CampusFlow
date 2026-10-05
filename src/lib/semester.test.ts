import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCurrentSemester } from '@/lib/semester';

const at = (iso: string) => new Date(`${iso}T12:00:00Z`);

describe('getCurrentSemester', () => {
  beforeEach(() => {
    // Neutralise d'éventuelles variables de l'environnement de la machine.
    vi.stubEnv('NEXT_PUBLIC_CURRENT_SEMESTER', '');
    vi.stubEnv('CURRENT_SEMESTER', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('retourne S1 de septembre à janvier', () => {
    for (const day of ['2026-09-01', '2026-10-03', '2026-11-15', '2026-12-31', '2027-01-01', '2027-01-31']) {
      expect(getCurrentSemester(at(day))).toBe(1);
    }
  });

  it('retourne S2 de février à août', () => {
    for (const day of ['2027-02-01', '2027-03-10', '2027-05-20', '2027-07-14', '2027-08-31']) {
      expect(getCurrentSemester(at(day))).toBe(2);
    }
  });

  it('utilise la date du jour par défaut', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(at('2026-10-03'));
      expect(getCurrentSemester()).toBe(1);
      vi.setSystemTime(at('2027-04-03'));
      expect(getCurrentSemester()).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('NEXT_PUBLIC_CURRENT_SEMESTER force le semestre', () => {
    vi.stubEnv('NEXT_PUBLIC_CURRENT_SEMESTER', '2');
    expect(getCurrentSemester(at('2026-10-03'))).toBe(2);
    vi.stubEnv('NEXT_PUBLIC_CURRENT_SEMESTER', '1');
    expect(getCurrentSemester(at('2027-04-03'))).toBe(1);
  });

  it('CURRENT_SEMESTER force le semestre à défaut de la variable publique', () => {
    vi.stubEnv('NEXT_PUBLIC_CURRENT_SEMESTER', '');
    vi.stubEnv('CURRENT_SEMESTER', '2');
    expect(getCurrentSemester(at('2026-10-03'))).toBe(2);
  });

  it('la variable publique est prioritaire sur CURRENT_SEMESTER', () => {
    vi.stubEnv('NEXT_PUBLIC_CURRENT_SEMESTER', '1');
    vi.stubEnv('CURRENT_SEMESTER', '2');
    expect(getCurrentSemester(at('2027-04-03'))).toBe(1);
  });

  it('ignore une valeur invalide et retombe sur le calendrier', () => {
    for (const bad of ['3', '0', 'S1', '1.5', 'abc']) {
      vi.stubEnv('NEXT_PUBLIC_CURRENT_SEMESTER', bad);
      vi.stubEnv('CURRENT_SEMESTER', bad);
      expect(getCurrentSemester(at('2026-10-03'))).toBe(1);
      expect(getCurrentSemester(at('2027-04-03'))).toBe(2);
    }
  });

  it('invalide en variable publique : la variable serveur valide est utilisée', () => {
    vi.stubEnv('NEXT_PUBLIC_CURRENT_SEMESTER', 'x');
    vi.stubEnv('CURRENT_SEMESTER', '2');
    expect(getCurrentSemester(at('2026-10-03'))).toBe(2);
  });
});
