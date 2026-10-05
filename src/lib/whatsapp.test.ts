import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deliveryChannelsPhrase, isWhatsAppConfigured, sendWhatsAppMessage } from '@/lib/whatsapp';

function setEnv(instanceId: string | undefined, token: string | undefined) {
  // `undefined` supprime la variable pour la durée du test.
  vi.stubEnv('WHATSAPP_INSTANCE_ID', instanceId);
  vi.stubEnv('WHATSAPP_TOKEN', token);
}

describe('isWhatsAppConfigured', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('est faux quand les deux variables sont absentes', () => {
    setEnv(undefined, undefined);
    expect(isWhatsAppConfigured()).toBe(false);
  });

  it('est faux quand une seule variable est définie', () => {
    setEnv('instance123', undefined);
    expect(isWhatsAppConfigured()).toBe(false);
    setEnv(undefined, 'secret-token');
    expect(isWhatsAppConfigured()).toBe(false);
  });

  it('est faux quand les variables sont vides ou blanches', () => {
    setEnv('', '');
    expect(isWhatsAppConfigured()).toBe(false);
    setEnv('instance123', '');
    expect(isWhatsAppConfigured()).toBe(false);
    setEnv('   ', 'secret-token');
    expect(isWhatsAppConfigured()).toBe(false);
  });

  it('est vrai quand les deux variables sont renseignées', () => {
    setEnv('instance123', 'secret-token');
    expect(isWhatsAppConfigured()).toBe(true);
  });
});

describe('deliveryChannelsPhrase', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('annonce l\'email seul quand WhatsApp n\'est pas configuré', () => {
    setEnv(undefined, undefined);
    expect(deliveryChannelsPhrase()).toBe('par email');
  });

  it('annonce WhatsApp et email quand WhatsApp est configuré', () => {
    setEnv('instance123', 'secret-token');
    expect(deliveryChannelsPhrase()).toBe('par WhatsApp et par email');
  });
});

describe('sendWhatsAppMessage', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renvoie false sans réseau ni journal quand WhatsApp n\'est pas configuré', async () => {
    setEnv(undefined, undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await sendWhatsAppMessage('22890000000', 'code 123456')).toBe(false);
    expect(await sendWhatsAppMessage('22890000000', 'code 654321')).toBe(false);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('renvoie false sans réseau quand les variables sont vides', async () => {
    setEnv('', '');
    expect(await sendWhatsAppMessage('22890000000', 'code')).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('envoie le message quand WhatsApp est configuré', async () => {
    setEnv('instance123', 'secret-token');
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ sent: 'true' }) });

    expect(await sendWhatsAppMessage('+228 90 00 00 00', 'code')).toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.ultramsg.com/instance123/messages/chat');
    expect(JSON.parse(init.body).to).toBe('22890000000');
  });

  it('refuse un numéro invalide sans appeler le réseau', async () => {
    setEnv('instance123', 'secret-token');
    expect(await sendWhatsAppMessage('123', 'code')).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
