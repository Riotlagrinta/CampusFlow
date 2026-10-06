import { describe, expect, it, vi } from 'vitest';
import { captchaFailure, isCaptchaEnabled, TURNSTILE_VERIFY_URL, verifyCaptcha } from './captcha';

const ENV = { TURNSTILE_SECRET_KEY: 'secret-de-test', NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'site-de-test' };

function fakeFetch(response: unknown, init: { ok?: boolean; status?: number } = {}) {
  return vi.fn(async () => ({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => response,
  })) as unknown as typeof fetch;
}

describe('isCaptchaEnabled', () => {
  it('exige les DEUX clés', () => {
    expect(isCaptchaEnabled(ENV)).toBe(true);
    expect(isCaptchaEnabled({ TURNSTILE_SECRET_KEY: 'x' })).toBe(false);
    expect(isCaptchaEnabled({ NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'x' })).toBe(false);
    expect(isCaptchaEnabled({ TURNSTILE_SECRET_KEY: '  ', NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'x' })).toBe(false);
    expect(isCaptchaEnabled({})).toBe(false);
  });
});

describe('verifyCaptcha : désactivé', () => {
  it('laisse tout passer sans appeler Cloudflare', async () => {
    const fetchImpl = fakeFetch({ success: false });
    expect(await verifyCaptcha(undefined, '1.2.3.4', { env: {}, fetchImpl })).toEqual({ ok: true });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('verifyCaptcha : activé', () => {
  it('refuse un jeton absent, vide, non textuel ou démesuré, sans appeler Cloudflare', async () => {
    const fetchImpl = fakeFetch({ success: true });
    for (const token of [undefined, null, '', 42, {}, 'x'.repeat(2049)]) {
      expect(await verifyCaptcha(token, '1.2.3.4', { env: ENV, fetchImpl })).toEqual({ ok: false, reason: 'missing' });
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('accepte un jeton validé par Cloudflare et envoie secret, jeton et IP', async () => {
    const fetchImpl = fakeFetch({ success: true });
    expect(await verifyCaptcha('jeton', '203.0.113.7', { env: ENV, fetchImpl })).toEqual({ ok: true });

    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(TURNSTILE_VERIFY_URL);
    expect(init.method).toBe('POST');
    const sent = init.body as URLSearchParams;
    expect(sent.get('secret')).toBe('secret-de-test');
    expect(sent.get('response')).toBe('jeton');
    expect(sent.get('remoteip')).toBe('203.0.113.7');
  });

  it('n\'envoie pas une IP inconnue ou fantaisiste (adresse avec port, texte), mais accepte IPv4 et IPv6', async () => {
    const sentIp = async (ip: string | null) => {
      const fetchImpl = fakeFetch({ success: true });
      await verifyCaptcha('jeton', ip, { env: ENV, fetchImpl });
      const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
      return (init.body as URLSearchParams).get('remoteip');
    };
    expect(await sentIp('unknown')).toBeNull();
    expect(await sentIp('1.2.3.4:80')).toBeNull();
    expect(await sentIp('abc')).toBeNull();
    expect(await sentIp(null)).toBeNull();
    expect(await sentIp('203.0.113.7')).toBe('203.0.113.7');
    expect(await sentIp('2001:db8::1')).toBe('2001:db8::1');
  });

  it('rogne la clé secrète avant de l\'envoyer (un saut de ligne collé dans Vercel ne bloque pas tout le monde)', async () => {
    const fetchImpl = fakeFetch({ success: true });
    const env = { TURNSTILE_SECRET_KEY: '  secret-de-test\n', NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'site-de-test' };
    expect(await verifyCaptcha('jeton', null, { env, fetchImpl })).toEqual({ ok: true });
    const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect((init.body as URLSearchParams).get('secret')).toBe('secret-de-test');
  });

  it('journalise les pannes de configuration sans jamais écrire la clé ni le jeton', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await verifyCaptcha('jeton-secret-123', null, { env: ENV, fetchImpl: fakeFetch({ success: false, 'error-codes': ['invalid-input-secret'] }) });
    await verifyCaptcha('jeton-secret-123', null, { env: ENV, fetchImpl: fakeFetch({}, { ok: false, status: 500 }) });
    expect(spy).toHaveBeenCalledTimes(2);
    const logged = JSON.stringify(spy.mock.calls);
    expect(logged).toContain('[captcha]');
    expect(logged).not.toContain('secret-de-test');
    expect(logged).not.toContain('jeton-secret-123');
  });

  it('refuse un jeton rejeté par Cloudflare (robot, expiré ou déjà utilisé)', async () => {
    const fetchImpl = fakeFetch({ success: false, 'error-codes': ['timeout-or-duplicate'] });
    expect(await verifyCaptcha('jeton', null, { env: ENV, fetchImpl })).toEqual({ ok: false, reason: 'invalid' });
  });

  it('traite une clé secrète refusée ou une erreur interne comme une panne, pas comme un robot', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    for (const code of ['invalid-input-secret', 'missing-input-secret', 'internal-error', 'bad-request']) {
      const fetchImpl = fakeFetch({ success: false, 'error-codes': [code] });
      expect(await verifyCaptcha('jeton', null, { env: ENV, fetchImpl })).toEqual({ ok: false, reason: 'unavailable' });
    }
  });

  it('échoue FERMÉ quand Cloudflare est injoignable ou répond mal', async () => {
    const failing = vi.fn(async () => {
      throw new Error('réseau');
    }) as unknown as typeof fetch;
    expect(await verifyCaptcha('jeton', null, { env: ENV, fetchImpl: failing })).toEqual({ ok: false, reason: 'unavailable' });
    expect(await verifyCaptcha('jeton', null, { env: ENV, fetchImpl: fakeFetch({}, { ok: false, status: 500 }) })).toEqual({
      ok: false,
      reason: 'unavailable',
    });
    const notJson = vi.fn(async () => ({ ok: true, status: 200, json: async () => Promise.reject(new Error('pas du JSON')) })) as unknown as typeof fetch;
    expect(await verifyCaptcha('jeton', null, { env: ENV, fetchImpl: notJson })).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('un success autre que true ne passe pas', async () => {
    for (const success of ['true', 1, null, undefined]) {
      expect(await verifyCaptcha('jeton', null, { env: ENV, fetchImpl: fakeFetch({ success }) })).toEqual({ ok: false, reason: 'invalid' });
    }
  });
});

describe('captchaFailure', () => {
  it('400 captcha_required pour un jeton manquant ou refusé, 503 pour une panne', () => {
    expect(captchaFailure('missing')).toMatchObject({ status: 400, body: { code: 'captcha_required' } });
    expect(captchaFailure('invalid')).toMatchObject({ status: 400, body: { code: 'captcha_required' } });
    expect(captchaFailure('unavailable')).toMatchObject({ status: 503, body: { code: 'captcha_unavailable' } });
  });
});
