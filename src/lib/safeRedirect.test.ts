import { describe, expect, it } from 'vitest';
import { safeRedirectPath } from '@/lib/safeRedirect';

const ORIGIN = 'https://studenthub.example';

describe('safeRedirectPath : redirections refusées (repli sur « / »)', () => {
  const refused: Array<[string, string]> = [
    ['adresse sans protocole', '//evil.com'],
    ['trois barres', '///evil.com'],
    ['barre oblique inverse', '/\\evil.com'],
    ['barre oblique inverse après un segment', '/\\/evil.com'],
    ['tabulation encodée (%09) : supprimée par les navigateurs', '/%09/evil.com'],
    ['tabulation réelle', '/\t/evil.com'],
    ['retour à la ligne encodé', '/%0a/evil.com'],
    ['retour chariot réel', '/\r/evil.com'],
    ['caractère nul', '/\u0000/evil.com'],
    ['barre oblique inverse encodée (%5c)', '/%5cevil.com'],
    ['segment « . » puis barre : /.//evil.com', '/.//evil.com'],
    ['segment « .. » puis barre : /..//evil.com', '/..//evil.com'],
    ['segment « . » encodé : /%2e//evil.com', '/%2e//evil.com'],
    ['segment « .. » encodé', '/%2e%2e//evil.com'],
    ['barre encodée après le premier « / »', '/%2f/evil.com'],
    ['double encodage', '/%252e//evil.com'],
    ['URL absolue vers un autre site', 'https://evil.com'],
    ['URL absolue vers un autre site, avec chemin', 'https://evil.com/shop'],
    ['URL http', 'http://studenthub.example/shop'],
    ['protocole javascript', 'javascript:alert(1)'],
    ['protocole data', 'data:text/html,<script>alert(1)</script>'],
    ['chemin relatif sans « / » initial', 'shop/success'],
    ['espace puis double barre', ' //evil.com'],
    ['URL avec identifiants', 'https://studenthub.example@evil.com/'],
    ['valeur vide', ''],
    ['espaces seuls', '   '],
    ['trop long', `/${'a'.repeat(3000)}`],
  ];

  it.each(refused)('%s', (_label, raw) => {
    expect(safeRedirectPath(raw, ORIGIN)).toBe('/');
  });

  it('refuse les valeurs absentes ou non textuelles', () => {
    expect(safeRedirectPath(null, ORIGIN)).toBe('/');
    expect(safeRedirectPath(undefined, ORIGIN)).toBe('/');
    expect(safeRedirectPath(42 as unknown as string, ORIGIN)).toBe('/');
    expect(safeRedirectPath({ toString: () => '/ok' } as unknown as string, ORIGIN)).toBe('/');
  });

  it('refuse quand l\'origine fournie est invalide', () => {
    expect(safeRedirectPath('/shop', 'pas une origine')).toBe('/');
    expect(safeRedirectPath('/shop', 'null')).toBe('/');
  });

  it('utilise le repli demandé', () => {
    expect(safeRedirectPath('//evil.com', ORIGIN, '/dashboard')).toBe('/dashboard');
    expect(safeRedirectPath('/shop', ORIGIN, '/dashboard')).toBe('/shop');
  });

  it('ne renvoie jamais un chemin commençant par « // » ni contenant « \\ »', () => {
    const attempts = [
      '/.//evil.com',
      '/..//evil.com',
      '/%2e//evil.com',
      '/././/evil.com',
      '/a/..//evil.com',
      '/a/%2e%2e//evil.com',
      '//evil.com',
      '/\\evil.com',
    ];
    for (const raw of attempts) {
      const result = safeRedirectPath(raw, ORIGIN);
      expect(result.startsWith('//'), raw).toBe(false);
      expect(result.includes('\\'), raw).toBe(false);
    }
  });
});

describe('safeRedirectPath : chemins valides conservés', () => {
  it('conserve chemin, paramètres et ancre', () => {
    expect(safeRedirectPath('/shop/success?tx=abc#x', ORIGIN)).toBe('/shop/success?tx=abc#x');
  });

  it('conserve la racine et les chemins simples', () => {
    expect(safeRedirectPath('/', ORIGIN)).toBe('/');
    expect(safeRedirectPath('/shop', ORIGIN)).toBe('/shop');
    expect(safeRedirectPath('/forum/questions/abc-123', ORIGIN)).toBe('/forum/questions/abc-123');
    expect(safeRedirectPath('/ai-assistant?q=bonjour', ORIGIN)).toBe('/ai-assistant?q=bonjour');
  });

  it('refuse même une URL absolue vers le MÊME site : seuls les chemins internes sont admis', () => {
    expect(safeRedirectPath('https://studenthub.example/shop?x=1', ORIGIN)).toBe('/');
  });

  it('résout les segments « . » et « .. » légitimes sans quitter le site', () => {
    expect(safeRedirectPath('/a/./b', ORIGIN)).toBe('/a/b');
    expect(safeRedirectPath('/a/b/../c', ORIGIN)).toBe('/a/c');
    expect(safeRedirectPath('/../shop', ORIGIN)).toBe('/shop');
  });

  it('conserve les caractères accentués encodés et les paramètres encodés', () => {
    expect(safeRedirectPath('/resources?q=alg%C3%A8bre', ORIGIN)).toBe('/resources?q=alg%C3%A8bre');
    expect(safeRedirectPath('/search?q=a%20b', ORIGIN)).toBe('/search?q=a%20b');
  });

  it('ignore les espaces de bord', () => {
    expect(safeRedirectPath('  /shop  ', ORIGIN)).toBe('/shop');
  });

  it('une adresse « ressemblante » mais interne reste un simple chemin', () => {
    expect(safeRedirectPath('/@evil.com', ORIGIN)).toBe('/@evil.com');
    expect(safeRedirectPath('/evil.com//shop', ORIGIN)).toBe('/evil.com//shop');
  });
});
