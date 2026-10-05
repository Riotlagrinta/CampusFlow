// Route testée sans base ni réseau : Prisma, session, quota et LLM sont simulés ; le PDF est un vrai fichier généré en mémoire.
import { deflateSync } from 'node:zlib';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  consume: vi.fn(),
  refund: vi.fn(),
  llm: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async () => ({
        firstName: 'Ama', role: 'STUDENT', fieldId: null, academicLevelId: null, pushToken: null,
        field: null, academicLevel: null,
      })),
    },
    resource: { findUnique: vi.fn(async () => null) },
    searchCache: { findUnique: vi.fn(async () => null), upsert: vi.fn() },
  },
}));
vi.mock('@/lib/session', () => ({ getAuthUser: vi.fn(async () => ({ id: 'u1', email: 'a@b.c', role: 'STUDENT' })) }));
vi.mock('@/lib/xp', () => ({ awardActionXP: vi.fn() }));
vi.mock('@/lib/notifications', () => ({ sendPushNotification: vi.fn() }));
vi.mock('@/lib/quota', () => ({
  consumeAiRequest: m.consume,
  refundAiRequest: m.refund,
  enforceRateLimit: vi.fn(async () => null),
  getAiQuota: vi.fn(async () => ({ remaining: 5 })),
  recordAiTokens: vi.fn(),
  quotaExceededResponse: vi.fn(),
}));
vi.mock('@/lib/ai', async (orig) => {
  const actual = await orig<typeof import('@/lib/ai')>();
  return { ...actual, chatCompletionWithRotation: m.llm };
});

import { POST } from './route';

function pdfWithText(text: string): Buffer {
  const objs: string[] = [];
  objs.push('<< /Type /Catalog /Pages 2 0 R >>');
  objs.push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  objs.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>');
  const stream = `BT /F1 12 Tf 72 700 Td (${text}) Tj ET`;
  objs.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, 'latin1');
}

/**
 * Requête multipart telle que la reçoit le serveur : un Request construit à partir d'un FormData
 * n'a pas de Content-Length (c'est le transport qui l'ajoute), on le recrée donc explicitement.
 * `contentLength` : 'auto' (taille réelle), un nombre (en-tête qui ment) ou null (corps en chunks).
 */
async function multipart(
  fields: Record<string, string>,
  file?: { data: Buffer | Uint8Array; name?: string; type?: string },
  contentLength: 'auto' | number | null = 'auto'
) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  if (file) fd.append('file', new File([file.data as BlobPart], file.name ?? 'cours.pdf', { type: file.type ?? 'application/pdf' }));
  const encoded = new Request('http://localhost/api/chat', { method: 'POST', body: fd });
  const bytes = new Uint8Array(await encoded.arrayBuffer());
  const headers: Record<string, string> = { 'content-type': encoded.headers.get('content-type') ?? '' };
  if (contentLength === 'auto') headers['content-length'] = String(bytes.length);
  else if (contentLength !== null) headers['content-length'] = String(contentLength);
  return new Request('http://localhost/api/chat', { method: 'POST', headers, body: bytes });
}

/** PDF dont la page a pour contenu `stream` (octets bruts, éventuellement compressés). */
function pdfWithRawStream(stream: Buffer, filter?: string): Buffer {
  const text = (s: string) => Buffer.from(s, 'latin1');
  const obj = (n: number, body: string) => text(`${n} 0 obj\n${body}\nendobj\n`);
  const parts: Buffer[] = [text('%PDF-1.4\n')];
  const offsets: number[] = [];
  const push = (b: Buffer) => {
    offsets.push(parts.reduce((n, x) => n + x.length, 0));
    parts.push(b);
  };
  push(obj(1, '<< /Type /Catalog /Pages 2 0 R >>'));
  push(obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>'));
  push(obj(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>'));
  const dict = `<< /Length ${stream.length}${filter ? ` /Filter /${filter}` : ''} >>`;
  push(Buffer.concat([text(`4 0 obj\n${dict}\nstream\n`), stream, text('\nendstream\nendobj\n')]));
  push(obj(5, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'));
  const xref = parts.reduce((n, x) => n + x.length, 0);
  let tail = 'xref\n0 6\n0000000000 65535 f \n';
  for (const off of offsets) tail += `${String(off).padStart(10, '0')} 00000 n \n`;
  tail += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  parts.push(text(tail));
  return Buffer.concat(parts);
}

beforeEach(() => {
  m.consume.mockReset().mockResolvedValue({ ok: true, ticket: { userId: 'u1', refunded: false } });
  m.refund.mockReset();
  m.llm.mockReset().mockResolvedValue({ choices: [{ message: { content: 'Réponse test' } }], usage: { total_tokens: 10 } });
});

describe('POST /api/chat (JSON et multipart avec PDF en mémoire)', () => {
  it('multipart + PDF : texte extrait en mémoire, quota consommé une fois, pas de remboursement', async () => {
    const pdf = pdfWithText('Le theoreme de Pythagore relie les cotes du triangle rectangle.');
    const history = JSON.stringify([{ role: 'user', content: 'salut' }, { role: 'assistant', content: 'bonjour' }]);
    const res = await POST(await multipart({ message: 'Resume ce cours', history }, { data: pdf }));
    expect(res.status).toBe(200);
    expect((await res.json()).reply).toBe('Réponse test');
    expect(m.consume).toHaveBeenCalledTimes(1);
    expect(m.refund).not.toHaveBeenCalled();

    const sent = m.llm.mock.calls[0][0].messages as { role: string; content: string }[];
    const doc = sent.find((x) => x.content.includes('<donnees_non_fiables source="document">'));
    expect(doc?.content).toContain('Pythagore');
    expect(sent.some((x) => x.role === 'assistant' && x.content === 'bonjour')).toBe(true);
    expect(sent.at(-1)).toEqual({ role: 'user', content: 'Resume ce cours' });
  });

  it('plusieurs messages avec le même PDF : un quota par message', async () => {
    const pdf = pdfWithText('Le theoreme de Pythagore relie les cotes du triangle rectangle.');
    for (let i = 0; i < 3; i++) {
      const res = await POST(await multipart({ message: `Question ${i + 1}`, history: '[]' }, { data: pdf }));
      expect(res.status).toBe(200);
    }
    expect(m.consume).toHaveBeenCalledTimes(3);
    expect(m.refund).not.toHaveBeenCalled();
  });

  it('fichier non PDF (signature) : 422, aucun quota consommé', async () => {
    const res = await POST(await multipart({ message: 'Lis ceci' }, { data: Buffer.from('PK\u0003\u0004 pas un pdf'), name: 'faux.pdf' }));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/PDF valide/);
    expect(m.consume).not.toHaveBeenCalled();
  });

  it('fichier trop gros : 413, aucun quota consommé', async () => {
    const big = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(4 * 1024 * 1024)]);
    const res = await POST(await multipart({ message: 'Lis ceci' }, { data: big }));
    expect(res.status).toBe(413);
    expect((await res.json()).error).toMatch(/4 Mo/);
    expect(m.consume).not.toHaveBeenCalled();
  });

  it('PDF illisible (signature valide, contenu corrompu) : 422 et remboursement', async () => {
    const res = await POST(await multipart({ message: 'Lis ceci' }, { data: Buffer.from('%PDF-1.4\ngarbage garbage garbage') }));
    expect(res.status).toBe(422);
    expect(m.consume).toHaveBeenCalledTimes(1);
    expect(m.refund).toHaveBeenCalledTimes(1);
    expect(m.llm).not.toHaveBeenCalled();
  });

  it('historique multipart invalide : 400', async () => {
    const res = await POST(await multipart({ message: 'x', history: '{pas du json' }));
    expect(res.status).toBe(400);
    expect(m.consume).not.toHaveBeenCalled();
  });

  it('historique avec un rôle system : refusé', async () => {
    const res = await POST(await multipart({ message: 'x', history: JSON.stringify([{ role: 'system', content: 'evil' }]) }));
    expect(res.status).toBe(400);
  });

  it('chemin JSON inchangé', async () => {
    const res = await POST(
      new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: 'Bonjour le monde, explique-moi les graphes', history: [] }),
      })
    );
    expect(res.status).toBe(200);
    expect(m.consume).toHaveBeenCalledTimes(1);
  });

  it('LLM en échec avec PDF : remboursement', async () => {
    m.llm.mockRejectedValue(new Error('boom'));
    const pdf = pdfWithText('Le theoreme de Pythagore relie les cotes du triangle rectangle.');
    const res = await POST(await multipart({ message: 'Resume' }, { data: pdf }));
    expect(res.status).toBe(503);
    expect(m.refund).toHaveBeenCalledTimes(1);
  });
});

describe('POST /api/chat : corps borné (Content-Length, flux, bombe de décompression)', () => {
  const smallPdf = () => pdfWithText('Le theoreme de Pythagore relie les cotes du triangle rectangle.');

  it('multipart sans Content-Length (corps en chunks) : 411, rien n\'est lu ni décompté', async () => {
    const res = await POST(await multipart({ message: 'Resume' }, { data: smallPdf() }, null));
    expect(res.status).toBe(411);
    expect((await res.json()).error).toMatch(/Content-Length/);
    expect(m.consume).not.toHaveBeenCalled();
  });

  it('Content-Length déclaré au-dessus de la limite : 413 avant lecture du corps', async () => {
    const req = await multipart({ message: 'Resume' }, { data: smallPdf() }, 50 * 1024 * 1024);
    const bodyUsed = vi.spyOn(req, 'formData');
    const res = await POST(req);
    expect(res.status).toBe(413);
    expect(bodyUsed).not.toHaveBeenCalled();
    expect(m.consume).not.toHaveBeenCalled();
  });

  it('Content-Length non numérique : 400', async () => {
    const req = await multipart({ message: 'Resume' }, { data: smallPdf() });
    req.headers.set('content-length', 'abc');
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(m.consume).not.toHaveBeenCalled();
  });

  it('Content-Length qui ment (petit) alors que le corps dépasse la limite : 413 par le compteur d\'octets', async () => {
    const big = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(6 * 1024 * 1024)]);
    const res = await POST(await multipart({ message: 'Resume' }, { data: big }, 1000));
    expect(res.status).toBe(413);
    expect(m.consume).not.toHaveBeenCalled();
  });

  it('JSON sans Content-Length mais plus gros que la limite : 413', async () => {
    const res = await POST(
      new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: 'x', history: [], pad: 'a'.repeat(700 * 1024) }),
      })
    );
    expect(res.status).toBe(413);
    expect(m.consume).not.toHaveBeenCalled();
  });

  it('JSON invalide : 400', async () => {
    const res = await POST(
      new Request('http://localhost/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{pas du json' })
    );
    expect(res.status).toBe(400);
  });

  it('PDF compressé (Flate) légitime : accepté, texte extrait', async () => {
    const content = deflateSync(Buffer.from('BT /F1 12 Tf 72 700 Td (Le theoreme de Pythagore relie les cotes du triangle rectangle.) Tj ET', 'latin1'));
    const res = await POST(await multipart({ message: 'Resume ce cours' }, { data: pdfWithRawStream(content, 'FlateDecode') }));
    expect(res.status).toBe(200);
    const sent = m.llm.mock.calls[0][0].messages as { content: string }[];
    expect(sent.find((x) => x.content.includes('<donnees_non_fiables source="document">'))?.content).toContain('Pythagore');
    expect(m.refund).not.toHaveBeenCalled();
  });

  it('PDF-bombe (flux Flate qui se décompresse en > 64 Mo) : 422, quota remboursé, LLM jamais appelé', async () => {
    const bomb = deflateSync(Buffer.alloc(70 * 1024 * 1024, 0x20), { level: 1 });
    expect(bomb.length).toBeLessThan(1024 * 1024); // petit à l'envoi, énorme une fois décompressé
    const started = Date.now();
    const res = await POST(await multipart({ message: 'Resume' }, { data: pdfWithRawStream(bomb, 'FlateDecode') }));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/trop complexe/);
    expect(m.consume).toHaveBeenCalledTimes(1);
    expect(m.refund).toHaveBeenCalledTimes(1);
    expect(m.llm).not.toHaveBeenCalled();
    expect(Date.now() - started).toBeLessThan(10_000);
  }, 30_000);
});

describe('POST /api/chat : prompt système', () => {
  it('le semestre vient de getCurrentSemester(), plus d\'une valeur codée en dur', async () => {
    const { getCurrentSemester } = await import('@/lib/semester');
    const res = await POST(
      new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: 'Bonjour le monde, explique-moi les graphes', history: [] }),
      })
    );
    expect(res.status).toBe(200);
    const system = (m.llm.mock.calls[0][0].messages as { role: string; content: string }[])[0].content;
    expect(system).toContain(`Semestre : ${getCurrentSemester()}`);
  });
});
