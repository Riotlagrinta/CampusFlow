import { describe, expect, it, vi } from 'vitest';
import { describeDatabaseTarget, isProductionEnvironment, maskEmail, parseArgs } from './safety';

describe('parseArgs', () => {
  it('sépare les drapeaux (--xxx) des arguments positionnels', () => {
    const { flags, positional } = parseArgs(['--yes', 'a@exemple.com', 'b@exemple.com', '--autre']);
    expect([...flags].sort()).toEqual(['--autre', '--yes']);
    expect(positional).toEqual(['a@exemple.com', 'b@exemple.com']);
  });

  it('renvoie des ensembles vides sans argument', () => {
    const { flags, positional } = parseArgs([]);
    expect(flags.size).toBe(0);
    expect(positional).toEqual([]);
  });
});

describe('maskEmail', () => {
  it('masque le compte et le domaine mais garde l\'extension', () => {
    expect(maskEmail('alice@exemple.com')).toBe('a***@e***.com');
    expect(maskEmail('prenom.nom@ecole.edu.tg')).toBe('p***@e***.edu.tg');
  });

  it('ne laisse jamais l\'adresse complète dans le résultat', () => {
    const masked = maskEmail('secret.person@private-domain.org');
    expect(masked).not.toContain('secret');
    expect(masked).not.toContain('private');
  });
});

describe('describeDatabaseTarget', () => {
  it('affiche l\'hôte et la base sans identifiants ni paramètres', () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://utilisateur:motdepasse@ep-exemple.neon.tech:5432/studenthub?sslmode=require');
    const target = describeDatabaseTarget();
    expect(target).toBe('ep-exemple.neon.tech/studenthub');
    expect(target).not.toContain('utilisateur');
    expect(target).not.toContain('motdepasse');
    expect(target).not.toContain('sslmode');
  });

  it('signale une variable absente ou illisible sans lever d\'exception', () => {
    vi.stubEnv('DATABASE_URL', '');
    expect(describeDatabaseTarget()).toContain('non défini');
    vi.stubEnv('DATABASE_URL', 'pas une url');
    expect(describeDatabaseTarget()).toContain('illisible');
  });
});

describe('isProductionEnvironment', () => {
  it('est vrai avec NODE_ENV=production ou VERCEL_ENV=production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', '');
    expect(isProductionEnvironment()).toBe(true);

    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('VERCEL_ENV', 'production');
    expect(isProductionEnvironment()).toBe(true);
  });

  it('est faux en développement et en test', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('VERCEL_ENV', '');
    expect(isProductionEnvironment()).toBe(false);

    vi.stubEnv('NODE_ENV', 'test');
    expect(isProductionEnvironment()).toBe(false);
  });
});
