import { describe, expect, it } from 'vitest';
import {
  ALLOWED_EXTENSIONS,
  ALLOWED_MIME_TYPES,
  MAX_FORM_FILE_BYTES,
  MAX_UPLOAD_BYTES,
  canonicalMimeFor,
  classifyFile,
  findFileKind,
  isDeclaredMimeAllowed,
  isVercelBlobUrl,
  matchesSignature,
  sanitizeFileName,
  validateFormFile,
  validateUploadFileName,
  validateUploadPathname,
} from '@/lib/uploadValidation';

const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));

/** Début de fichier synthétique : octets donnés à l'offset indiqué, complété par des zéros. */
function head(bytes: number[], offset = 0, length = 64): Uint8Array {
  const data = new Uint8Array(Math.max(length, offset + bytes.length));
  data.set(bytes, offset);
  return data;
}

const SAMPLES: Record<string, Uint8Array> = {
  pdf: head(ascii('%PDF-1.7')),
  doc: head([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
  docx: head([0x50, 0x4b, 0x03, 0x04]),
  xls: head([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
  xlsx: head([0x50, 0x4b, 0x03, 0x04]),
  jpg: head([0xff, 0xd8, 0xff, 0xe0]),
  jpeg: head([0xff, 0xd8, 0xff, 0xe1]),
  png: head([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  mp4: head(ascii('ftypisom'), 4),
  m4a: head(ascii('ftypM4A '), 4),
  webm: head([0x1a, 0x45, 0xdf, 0xa3]),
  mp3: head(ascii('ID3')),
  ogg: head(ascii('OggS')),
  wav: (() => {
    const data = head(ascii('RIFF'));
    data.set(ascii('WAVE'), 8);
    return data;
  })(),
};

describe('liste blanche', () => {
  it('couvre les documents, images, vidéos et audios attendus', () => {
    expect([...ALLOWED_EXTENSIONS].sort()).toEqual(
      ['doc', 'docx', 'jpeg', 'jpg', 'm4a', 'mp3', 'mp4', 'ogg', 'pdf', 'png', 'wav', 'webm', 'xls', 'xlsx'].sort()
    );
  });

  it('chaque extension a un type MIME canonique présent dans la liste du jeton', () => {
    for (const ext of ALLOWED_EXTENSIONS) {
      const mime = canonicalMimeFor(`cours.${ext}`);
      expect(mime).toBeTruthy();
      expect(ALLOWED_MIME_TYPES).toContain(mime);
    }
    expect(new Set(ALLOWED_MIME_TYPES).size).toBe(ALLOWED_MIME_TYPES.length);
  });

  it('attribue le bon type de ressource', () => {
    expect(findFileKind('cours.pdf')?.resourceType).toBe('PDF');
    expect(findFileKind('film.mp4')?.resourceType).toBe('VIDEO');
    expect(findFileKind('film.webm')?.resourceType).toBe('VIDEO');
    for (const ext of ['mp3', 'm4a', 'ogg', 'wav']) {
      expect(findFileKind(`son.${ext}`)?.resourceType).toBe('AUDIO');
    }
    for (const ext of ['doc', 'docx', 'xls', 'xlsx', 'jpg', 'png']) {
      expect(findFileKind(`fichier.${ext}`)?.resourceType).toBe('OTHER');
    }
  });

  it("est insensible à la casse de l'extension et refuse les formats inconnus", () => {
    expect(findFileKind('COURS.PDF')?.ext).toBe('pdf');
    for (const name of ['script.exe', 'page.html', 'image.svg', 'archive.zip', 'sans-extension', 'cours.pdf.exe', 'x.']) {
      expect(findFileKind(name)).toBeNull();
    }
  });
});

describe('signatures binaires', () => {
  it('accepte chaque format avec sa signature', () => {
    for (const ext of ALLOWED_EXTENSIONS) {
      const kind = findFileKind(`fichier.${ext}`)!;
      expect(matchesSignature(SAMPLES[ext], kind), ext).toBe(true);
    }
  });

  it('refuse un contenu qui ne correspond pas à l’extension', () => {
    const html = head(ascii('<html><script>alert(1)</script>'));
    for (const ext of ALLOWED_EXTENSIONS) {
      expect(matchesSignature(html, findFileKind(`fichier.${ext}`)!), ext).toBe(false);
    }
    expect(matchesSignature(SAMPLES.png, findFileKind('a.pdf')!)).toBe(false);
    expect(matchesSignature(SAMPLES.mp3, findFileKind('a.wav')!)).toBe(false);
    expect(matchesSignature(SAMPLES.webm, findFileKind('a.mp4')!)).toBe(false);
  });

  it('tolère quelques octets avant %PDF- (premier Ko)', () => {
    expect(matchesSignature(head(ascii('%PDF-1.4'), 200), findFileKind('a.pdf')!)).toBe(true);
    expect(matchesSignature(head(ascii('%PDF-1.4'), 2000, 3000).subarray(0, 1024), findFileKind('a.pdf')!)).toBe(false);
  });

  it('mp4 et m4a : « ftyp » doit être à l’offset 4', () => {
    expect(matchesSignature(head(ascii('ftyp'), 0), findFileKind('a.mp4')!)).toBe(false);
    expect(matchesSignature(head(ascii('ftyp'), 8), findFileKind('a.m4a')!)).toBe(false);
    expect(matchesSignature(head(ascii('ftyp'), 4), findFileKind('a.m4a')!)).toBe(true);
  });

  it('mp3 : balise ID3 ou trame MPEG (0xFF 0xEx / 0xFx)', () => {
    const kind = findFileKind('a.mp3')!;
    expect(matchesSignature(head(ascii('ID3')), kind)).toBe(true);
    expect(matchesSignature(head([0xff, 0xfb, 0x90]), kind)).toBe(true);
    expect(matchesSignature(head([0xff, 0xe3]), kind)).toBe(true);
    expect(matchesSignature(head([0xff, 0xc0]), kind)).toBe(false);
    expect(matchesSignature(head([0xfe, 0xfb]), kind)).toBe(false);
  });

  it('wav : RIFF puis WAVE à l’offset 8 (un avi RIFF est refusé)', () => {
    const kind = findFileKind('a.wav')!;
    const avi = head(ascii('RIFF'));
    avi.set(ascii('AVI '), 8);
    expect(matchesSignature(avi, kind)).toBe(false);
    expect(matchesSignature(SAMPLES.wav, kind)).toBe(true);
  });

  it('refuse un fichier trop court', () => {
    for (const ext of ALLOWED_EXTENSIONS) {
      expect(matchesSignature(new Uint8Array(0), findFileKind(`a.${ext}`)!), ext).toBe(false);
      expect(matchesSignature(new Uint8Array([0xff]), findFileKind(`a.${ext}`)!), ext).toBe(false);
    }
  });
});

describe('type MIME déclaré', () => {
  const mp3 = findFileKind('a.mp3')!;
  const pdf = findFileKind('a.pdf')!;

  it('accepte le type canonique, les alias, le vide et octet-stream', () => {
    expect(isDeclaredMimeAllowed(mp3, 'audio/mpeg')).toBe(true);
    expect(isDeclaredMimeAllowed(mp3, 'audio/mp3')).toBe(true);
    expect(isDeclaredMimeAllowed(mp3, 'Audio/MPEG; charset=binary')).toBe(true);
    expect(isDeclaredMimeAllowed(mp3, '')).toBe(true);
    expect(isDeclaredMimeAllowed(mp3, undefined)).toBe(true);
    expect(isDeclaredMimeAllowed(mp3, 'application/octet-stream')).toBe(true);
    expect(isDeclaredMimeAllowed(findFileKind('a.wav')!, 'audio/x-wav')).toBe(true);
    expect(isDeclaredMimeAllowed(findFileKind('a.m4a')!, 'audio/x-m4a')).toBe(true);
  });

  it('refuse un autre type', () => {
    expect(isDeclaredMimeAllowed(pdf, 'text/html')).toBe(false);
    expect(isDeclaredMimeAllowed(pdf, 'image/png')).toBe(false);
    expect(isDeclaredMimeAllowed(mp3, 'video/mp4')).toBe(false);
  });
});

describe('noms de fichier', () => {
  it('validateUploadPathname accepte un chemin sûr avec extension autorisée', () => {
    for (const pathname of ['resources/3f2a-cours_algo.pdf', 'resources/abc-video.MP4', 'a.png', 'resources/x-son.m4a']) {
      expect(validateUploadPathname(pathname).ok, pathname).toBe(true);
    }
  });

  it('validateUploadPathname refuse les chemins dangereux ou les extensions inconnues', () => {
    for (const pathname of ['../etc/passwd.pdf', 'resources/../x.pdf', 'resources/a b.pdf', '/abs/x.pdf', 'resources/x.exe', 'resources/x', '']) {
      expect(validateUploadPathname(pathname).ok, pathname).toBe(false);
    }
    const refused = validateUploadPathname('resources/x.exe');
    expect(refused.ok === false && refused.status).toBe(400);
    expect(refused.ok === false && refused.error).toContain('MP4');
  });

  it('validateUploadFileName refuse les noms vides, trop longs ou à caractères de contrôle', () => {
    expect(validateUploadFileName('Cours Algo (v2).pdf').ok).toBe(true);
    expect(validateUploadFileName('').ok).toBe(false);
    expect(validateUploadFileName(`${'a'.repeat(260)}.pdf`).ok).toBe(false);
    expect(validateUploadFileName('cours\u0000.pdf').ok).toBe(false);
    expect(validateUploadFileName('cours.exe').ok).toBe(false);
  });

  it('sanitizeFileName ne garde que des caractères sûrs et conserve l’extension', () => {
    expect(sanitizeFileName('Cours é/algo (1).pdf')).toBe('Cours___algo__1_.pdf');
    expect(sanitizeFileName('../../x.pdf')).toBe('.._.._x.pdf');
    const long = sanitizeFileName(`${'a'.repeat(300)}.mp3`);
    expect(long.length).toBe(100);
    expect(long.endsWith('.mp3')).toBe(true);
    expect(sanitizeFileName('')).toBe('fichier');
  });
});

describe('classifyFile (pré-contrôle navigateur)', () => {
  it('renvoie le type de ressource et le type MIME canonique', () => {
    expect(classifyFile({ name: 'cours.pdf', size: 1000, type: 'application/pdf' })).toEqual({
      ok: true,
      resourceType: 'PDF',
      mime: 'application/pdf',
    });
    expect(classifyFile({ name: 'cours.m4a', size: 1000, type: '' })).toEqual({
      ok: true,
      resourceType: 'AUDIO',
      mime: 'audio/mp4',
    });
  });

  it('refuse format inconnu, fichier vide, trop gros ou type incohérent', () => {
    expect(classifyFile({ name: 'x.exe', size: 10, type: '' }).ok).toBe(false);
    expect(classifyFile({ name: 'x.pdf', size: 0, type: 'application/pdf' }).ok).toBe(false);
    const big = classifyFile({ name: 'x.mp4', size: MAX_UPLOAD_BYTES + 1, type: 'video/mp4' });
    expect(big.ok === false && big.error).toContain('50 Mo');
    expect(classifyFile({ name: 'x.pdf', size: 10, type: 'text/html' }).ok).toBe(false);
    expect(classifyFile({ name: 'x.mp4', size: MAX_UPLOAD_BYTES, type: 'video/mp4' }).ok).toBe(true);
  });
});

describe('validateFormFile (envoi classique)', () => {
  const pdf = (overrides: Partial<{ name: string; size: number; type: string }> = {}) => ({
    name: 'cours.pdf',
    size: 1000,
    type: 'application/pdf',
    ...overrides,
  });

  it('accepte un fichier valide', () => {
    const result = validateFormFile(pdf(), SAMPLES.pdf);
    expect(result.ok).toBe(true);
    expect(result.ok && result.kind.resourceType).toBe('PDF');
  });

  it('accepte audio et vidéo avec leur signature', () => {
    expect(validateFormFile({ name: 'a.mp3', size: 10, type: 'audio/mpeg' }, SAMPLES.mp3).ok).toBe(true);
    expect(validateFormFile({ name: 'a.mp4', size: 10, type: 'video/mp4' }, SAMPLES.mp4).ok).toBe(true);
    expect(validateFormFile({ name: 'a.webm', size: 10, type: '' }, SAMPLES.webm).ok).toBe(true);
  });

  it('refuse un fichier vide (400)', () => {
    const result = validateFormFile(pdf({ size: 0 }), SAMPLES.pdf);
    expect(result).toMatchObject({ ok: false, status: 400 });
  });

  it('refuse au-delà de 4,4 Mo avec un 413 et un message exact', () => {
    const result = validateFormFile(pdf({ size: MAX_FORM_FILE_BYTES + 1 }), SAMPLES.pdf);
    expect(result).toMatchObject({ ok: false, status: 413 });
    if (!result.ok) {
      expect(result.error).toContain('4,4 Mo');
      expect(result.error).toContain('50 Mo');
      expect(result.error).not.toContain('4,5');
    }
    expect(validateFormFile(pdf({ size: MAX_FORM_FILE_BYTES }), SAMPLES.pdf).ok).toBe(true);
  });

  it('refuse une extension non autorisée', () => {
    expect(validateFormFile(pdf({ name: 'virus.exe' }), SAMPLES.pdf)).toMatchObject({ ok: false, status: 400 });
    expect(validateFormFile(pdf({ name: 'page.html', type: 'text/html' }), head(ascii('<html>')))).toMatchObject({
      ok: false,
      status: 400,
    });
  });

  it('refuse un type MIME incohérent avec l’extension', () => {
    expect(validateFormFile(pdf({ type: 'text/html' }), SAMPLES.pdf)).toMatchObject({ ok: false, status: 400 });
  });

  it('refuse une mauvaise signature (extension usurpée)', () => {
    expect(validateFormFile(pdf(), head(ascii('<html><script>')))).toMatchObject({ ok: false, status: 400 });
    expect(validateFormFile({ name: 'a.mp3', size: 10, type: 'audio/mpeg' }, SAMPLES.png)).toMatchObject({
      ok: false,
      status: 400,
    });
  });
});

describe('isVercelBlobUrl', () => {
  const HOST = 'abc123.public.blob.vercel-storage.com';

  it('accepte uniquement https sur le domaine Blob public', () => {
    expect(isVercelBlobUrl(`https://${HOST}/resources/x.pdf`)).toBe(true);
    expect(isVercelBlobUrl(`https://${HOST}/resources/x.pdf?download=1#p2`)).toBe(true);
    expect(isVercelBlobUrl(`https://${HOST.toUpperCase()}/x.pdf`)).toBe(true);
    expect(isVercelBlobUrl(`http://${HOST}/x.pdf`)).toBe(false);
    expect(isVercelBlobUrl('https://evil.example.com/abc.public.blob.vercel-storage.com')).toBe(false);
    expect(isVercelBlobUrl('https://public.blob.vercel-storage.com.evil.com/x.pdf')).toBe(false);
    expect(isVercelBlobUrl('pas une url')).toBe(false);
    expect(isVercelBlobUrl('')).toBe(false);
  });

  it('refuse les identifiants dans l\'URL (user:pw@)', () => {
    expect(isVercelBlobUrl(`https://user:pw@${HOST}/x.pdf`)).toBe(false);
    expect(isVercelBlobUrl(`https://user@${HOST}/x.pdf`)).toBe(false);
    expect(isVercelBlobUrl(`https://:pw@${HOST}/x.pdf`)).toBe(false);
    expect(isVercelBlobUrl(`https://${HOST}@evil.com/x.pdf`)).toBe(false);
    expect(isVercelBlobUrl(`https://${HOST}:pw@evil.com/x.pdf`)).toBe(false);
  });

  it('refuse tout port, même le port par défaut écrit explicitement', () => {
    expect(isVercelBlobUrl(`https://${HOST}:8443/x.pdf`)).toBe(false);
    expect(isVercelBlobUrl(`https://${HOST}:443/x.pdf`)).toBe(false);
    expect(isVercelBlobUrl(`https://${HOST}:/x.pdf`)).toBe(false);
  });

  it('exige l\'hôte exact <magasin>.public.blob.vercel-storage.com', () => {
    expect(isVercelBlobUrl('https://public.blob.vercel-storage.com/x.pdf')).toBe(false);
    expect(isVercelBlobUrl('https://a.b.public.blob.vercel-storage.com/x.pdf')).toBe(false);
    expect(isVercelBlobUrl('https://.public.blob.vercel-storage.com/x.pdf')).toBe(false);
    expect(isVercelBlobUrl(`https://${HOST}./x.pdf`)).toBe(false);
    expect(isVercelBlobUrl(`https://x_y.public.blob.vercel-storage.com/x.pdf`)).toBe(false);
    expect(isVercelBlobUrl('https://abc.blob.vercel-storage.com/x.pdf')).toBe(false);
    expect(isVercelBlobUrl('https://abc.vercel-storage.com/x.pdf')).toBe(false);
  });

  it('refuse les écritures tordues, barres obliques inverses et caractères de contrôle', () => {
    expect(isVercelBlobUrl(`https:/${HOST}/x.pdf`)).toBe(false);
    expect(isVercelBlobUrl(`https:${HOST}/x.pdf`)).toBe(false);
    expect(isVercelBlobUrl(`https:\\\\${HOST}\\x.pdf`)).toBe(false);
    expect(isVercelBlobUrl(`https://${HOST}\\@evil.com/x.pdf`)).toBe(false);
    expect(isVercelBlobUrl(`https://${HOST}/x.pdf\n`)).toBe(false);
    expect(isVercelBlobUrl(`https://${HOST}/\tx.pdf`)).toBe(false);
    expect(isVercelBlobUrl(`javascript:alert(1)//${HOST}`)).toBe(false);
  });
});
