import { describe, expect, it } from 'vitest';
import { loginReasonMessage } from '@/lib/loginReason';

describe('loginReasonMessage (liste blanche des motifs de la page de connexion)', () => {
  it('renvoie le message fixe de la session expirée', () => {
    const message = loginReasonMessage('session_expired');
    expect(message).toContain('session a expiré');
    expect(message).toContain('Reconnectez-vous');
  });

  it('ignore toute valeur inconnue, vide ou absente', () => {
    for (const value of [null, undefined, '', 'unknown', 'SESSION_EXPIRED', ' session_expired', 'session_expired ']) {
      expect(loginReasonMessage(value), String(value)).toBeNull();
    }
  });

  it('ne renvoie jamais le contenu de l\'URL : une charge HTML ou un nom hérité ne donne rien', () => {
    for (const value of ['<img src=x onerror=alert(1)>', 'constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      expect(loginReasonMessage(value), value).toBeNull();
    }
  });

  it('refuse les valeurs non textuelles', () => {
    expect(loginReasonMessage(42 as unknown as string)).toBeNull();
    expect(loginReasonMessage({} as unknown as string)).toBeNull();
  });
});
