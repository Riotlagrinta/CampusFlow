import { describe, expect, it } from 'vitest';
import {
  PUBLIC_PAGES,
  isAdminPage,
  isApiPath,
  isPaymentsPage,
  isPublicPage,
  normalizePath,
  shouldRedirectPaymentsPage,
} from '@/lib/routeAccess';

describe('normalizePath', () => {
  it('ramène les variantes d\'écriture de /admin à la même forme', () => {
    for (const variant of [
      '/admin',
      '/Admin',
      '/ADMIN/',
      '//admin',
      '///admin//',
      '/%61dmin',
      '/%41DMIN',
      '/%2561dmin', // double encodage
      '/./admin',
      '/x/../admin',
      '/\\admin',
      '/%5cadmin',
      '/ad%00min',
    ]) {
      expect(normalizePath(variant), variant).toBe('/admin');
    }
  });

  it('ne lève jamais d\'erreur sur un encodage invalide', () => {
    expect(() => normalizePath('/%E0%A4%A')).not.toThrow();
    expect(() => normalizePath('/%zz')).not.toThrow();
    expect(normalizePath('/%')).toBe('/%');
  });

  it('ne remonte pas au-dessus de la racine', () => {
    expect(normalizePath('/../../admin')).toBe('/admin');
    expect(normalizePath('/..')).toBe('/');
  });

  it('garde la racine telle quelle', () => {
    expect(normalizePath('/')).toBe('/');
    expect(normalizePath('')).toBe('/');
    expect(normalizePath('//')).toBe('/');
  });
});

describe('isAdminPage', () => {
  it('reconnaît /admin et ses sous-chemins quelle que soit l\'écriture', () => {
    for (const path of ['/admin', '/admin/users', '/Admin', '//admin', '/%61dmin', '/%61dmin/users', '/public/../admin']) {
      expect(isAdminPage(path), path).toBe(true);
    }
  });

  it('ne confond pas avec des chemins voisins', () => {
    for (const path of ['/', '/administration', '/forum/admin-tips', '/profile']) {
      expect(isAdminPage(path), path).toBe(false);
    }
  });
});

describe('isPublicPage', () => {
  it('accepte les pages publiques et leurs sous-chemins', () => {
    for (const path of ['/', '/login', '/register', '/legal', '/legal/cgu', '/about', '/subscribe', '/shop/success']) {
      expect(isPublicPage(path), path).toBe(true);
    }
  });

  it('inclut /shop/success (retour de paiement, paramètre tx conservé) mais pas le reste de /shop', () => {
    expect(PUBLIC_PAGES).toContain('/shop/success');
    expect(isPublicPage('/shop/success')).toBe(true);
    expect(isPublicPage('/shop')).toBe(false);
    expect(isPublicPage('/shop/checkout')).toBe(false);
    expect(isPublicPage('/shop/successor')).toBe(false);
  });

  it('refuse les pages protégées', () => {
    for (const path of ['/admin', '/profile', '/quiz', '/forum', '/forum/abc', '/resources', '/ai-assistant']) {
      expect(isPublicPage(path), path).toBe(false);
    }
  });

  it('ne se laisse pas tromper par un préfixe public suivi de « .. »', () => {
    expect(isPublicPage('/login/../admin')).toBe(false);
    expect(isPublicPage('/login%2f..%2fadmin')).toBe(false);
    expect(isPublicPage('/legal/../profile')).toBe(false);
  });
});

describe('isApiPath', () => {
  it('reconnaît /api et ses sous-chemins', () => {
    expect(isApiPath('/api')).toBe(true);
    expect(isApiPath('/api/user/profile')).toBe(true);
    expect(isApiPath('/%61pi/user/profile')).toBe(true);
    expect(isApiPath('/apidocs')).toBe(false);
    expect(isApiPath('/')).toBe(false);
  });
});

describe('isPaymentsPage', () => {
  it('reconnaît la boutique, ses sous-chemins et les abonnements', () => {
    for (const path of ['/shop', '/shop/', '/shop/checkout', '/shop/success', '/shop/checkout/x', '/subscribe', '/subscribe/']) {
      expect(isPaymentsPage(path), path).toBe(true);
    }
  });

  it('ne se laisse pas contourner par les variantes d\'écriture', () => {
    for (const path of ['/Shop', '/SHOP/Checkout', '//shop', '/%73hop', '/%2573hop/checkout', '/x/../shop', '/./subscribe', '/\shop', '/%5cshop/success', '/Subscribe/']) {
      expect(isPaymentsPage(path), path).toBe(true);
    }
  });

  it('ne confond pas avec des chemins voisins', () => {
    for (const path of ['/', '/shopping', '/shops', '/subscribed', '/subscribers', '/admin', '/ai-assistant', '/profile', '/about', '/api/payment/genius/create', '/legal']) {
      expect(isPaymentsPage(path), path).toBe(false);
    }
  });
});

describe('shouldRedirectPaymentsPage', () => {
  const PAYMENT_PATHS = ['/shop', '/shop/checkout', '/shop/checkout?packId=pro', '/shop/success', '/shop/success?tx=abc', '/subscribe'];

  it('redirige les pages de paiement vers / quand les paiements sont désactivés', () => {
    for (const path of PAYMENT_PATHS) {
      expect(shouldRedirectPaymentsPage(path.split('?')[0], false), path).toBe(true);
    }
  });

  it('passe AVANT les pages publiques : /shop/success et /subscribe sont publiques mais fermées', () => {
    expect(isPublicPage('/shop/success')).toBe(true);
    expect(isPublicPage('/subscribe')).toBe(true);
    expect(shouldRedirectPaymentsPage('/shop/success', false)).toBe(true);
    expect(shouldRedirectPaymentsPage('/subscribe', false)).toBe(true);
  });

  it('ne redirige rien quand les paiements sont activés', () => {
    for (const path of PAYMENT_PATHS) {
      expect(shouldRedirectPaymentsPage(path.split('?')[0], true), path).toBe(false);
    }
  });

  it('ne redirige jamais les autres pages, même désactivé', () => {
    for (const path of ['/', '/login', '/register', '/ai-assistant', '/admin', '/profile', '/legal', '/about', '/api/payment/genius/callback']) {
      expect(shouldRedirectPaymentsPage(path, false), path).toBe(false);
    }
  });
});
