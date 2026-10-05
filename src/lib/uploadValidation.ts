// Validation des fichiers de ressources, partagée par les trois points d'entrée :
//  - /api/upload : génération du jeton d'envoi direct vers Vercel Blob (nom + type) ;
//  - /api/upload : vérification de fin d'envoi (signature binaire du fichier stocké) ;
//  - /api/resources : envoi classique FormData (nom, taille, type, signature).
// Fonctions pures, sans dépendance serveur : utilisable aussi côté navigateur (pré-contrôle).

export type ResourceFileType = 'PDF' | 'VIDEO' | 'AUDIO' | 'OTHER';

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
// Vercel refuse les corps de requête > 4,5 Mo : marge pour les champs du formulaire.
export const MAX_FORM_FILE_BYTES = 4_400_000;
// Octets lus au début du fichier pour contrôler la signature.
export const SIGNATURE_PROBE_BYTES = 1024;
export const MAX_FILE_NAME_LENGTH = 255;

export const UPLOAD_FORMATS_LABEL = 'PDF, Word, Excel, JPEG, PNG, MP4, WebM, MP3, M4A, OGG ou WAV';
export const MAX_UPLOAD_LABEL = '50 Mo';
export const MAX_FORM_UPLOAD_LABEL = '4,4 Mo';

export type FileKind = {
  ext: string;
  /** Type de ressource attribué à ce fichier (le serveur ne se fie pas au type envoyé par le client). */
  resourceType: ResourceFileType;
  /** Type MIME canonique : celui enregistré sur le stockage et servi au téléchargement. */
  mime: string;
  /** Autres types MIME déclarés par les navigateurs pour la même extension. */
  mimeAliases: readonly string[];
  /** Vrai si le début du fichier a la signature binaire attendue. */
  matches: (head: Uint8Array) => boolean;
};

function bytesAt(head: Uint8Array, offset: number, signature: readonly number[]): boolean {
  if (head.length < offset + signature.length) return false;
  return signature.every((byte, i) => head[offset + i] === byte);
}

const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));

const startsWith = (signature: readonly number[]) => (head: Uint8Array) => bytesAt(head, 0, signature);

// Un PDF peut être précédé de quelques octets parasites : la spécification PDF (note d'implémentation
// d'Adobe pour ISO 32000) tolère « %PDF- » n'importe où dans les 1024 premiers octets, et les lecteurs
// courants l'acceptent. On garde donc cette tolérance (SIGNATURE_PROBE_BYTES = 1024 octets lus, rien de
// plus). Conséquence assumée : un fichier « polyglotte » (début quelconque + %PDF- avant 1 Ko) passe le
// contrôle ; il est stocké et servi avec le type MIME canonique application/pdf (canonicalMimeFor),
// jamais avec le type annoncé par le client, donc il n'est pas interprété comme une page HTML.
function pdfSignature(head: Uint8Array): boolean {
  const signature = ascii('%PDF-');
  for (let offset = 0; offset + signature.length <= head.length; offset++) {
    if (bytesAt(head, offset, signature)) return true;
  }
  return false;
}

const isZip = startsWith([0x50, 0x4b, 0x03, 0x04]); // docx, xlsx
const isOle = startsWith([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]); // doc, xls
const isJpeg = startsWith([0xff, 0xd8, 0xff]);
const isPng = startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
// MP4 / M4A : conteneur ISO BMFF, « ftyp » à l'offset 4.
const isIsoBmff = (head: Uint8Array) => bytesAt(head, 4, ascii('ftyp'));
const isWebm = startsWith([0x1a, 0x45, 0xdf, 0xa3]); // EBML
const isOgg = startsWith(ascii('OggS'));
// MP3 : balise ID3 ou trame MPEG (11 bits de synchronisation : 0xFF puis 0xEx).
const isMp3 = (head: Uint8Array) =>
  bytesAt(head, 0, ascii('ID3')) || (head.length >= 2 && head[0] === 0xff && (head[1] & 0xe0) === 0xe0);
// WAV : « RIFF », 4 octets de taille, « WAVE ».
const isWav = (head: Uint8Array) => bytesAt(head, 0, ascii('RIFF')) && bytesAt(head, 8, ascii('WAVE'));

// Liste blanche : extension -> type de ressource, type MIME et signature binaire attendus.
const KINDS: readonly FileKind[] = [
  { ext: 'pdf', resourceType: 'PDF', mime: 'application/pdf', mimeAliases: [], matches: pdfSignature },
  { ext: 'doc', resourceType: 'OTHER', mime: 'application/msword', mimeAliases: [], matches: isOle },
  {
    ext: 'docx',
    resourceType: 'OTHER',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    mimeAliases: [],
    matches: isZip,
  },
  { ext: 'xls', resourceType: 'OTHER', mime: 'application/vnd.ms-excel', mimeAliases: [], matches: isOle },
  {
    ext: 'xlsx',
    resourceType: 'OTHER',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    mimeAliases: [],
    matches: isZip,
  },
  { ext: 'jpg', resourceType: 'OTHER', mime: 'image/jpeg', mimeAliases: [], matches: isJpeg },
  { ext: 'jpeg', resourceType: 'OTHER', mime: 'image/jpeg', mimeAliases: [], matches: isJpeg },
  { ext: 'png', resourceType: 'OTHER', mime: 'image/png', mimeAliases: [], matches: isPng },
  { ext: 'mp4', resourceType: 'VIDEO', mime: 'video/mp4', mimeAliases: [], matches: isIsoBmff },
  { ext: 'webm', resourceType: 'VIDEO', mime: 'video/webm', mimeAliases: ['audio/webm'], matches: isWebm },
  { ext: 'mp3', resourceType: 'AUDIO', mime: 'audio/mpeg', mimeAliases: ['audio/mp3'], matches: isMp3 },
  {
    ext: 'm4a',
    resourceType: 'AUDIO',
    mime: 'audio/mp4',
    mimeAliases: ['audio/x-m4a', 'audio/m4a'],
    matches: isIsoBmff,
  },
  { ext: 'ogg', resourceType: 'AUDIO', mime: 'audio/ogg', mimeAliases: ['application/ogg'], matches: isOgg },
  {
    ext: 'wav',
    resourceType: 'AUDIO',
    mime: 'audio/wav',
    mimeAliases: ['audio/x-wav', 'audio/wave', 'audio/vnd.wave'],
    matches: isWav,
  },
];

const KIND_BY_EXT = new Map(KINDS.map((kind) => [kind.ext, kind]));

export const ALLOWED_EXTENSIONS: readonly string[] = KINDS.map((kind) => kind.ext);

/** Tous les types MIME acceptés (canoniques et alias), sans doublon : liste du jeton Vercel Blob. */
export const ALLOWED_MIME_TYPES: readonly string[] = [
  ...new Set(KINDS.flatMap((kind) => [kind.mime, ...kind.mimeAliases])),
];

// Même règle que isVercelBlobUrl de src/lib/ai.ts (qui, lui, importe des modules serveur : ce fichier
// reste utilisable côté navigateur).
const BLOB_HOST_PATTERN = /^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/i;

/**
 * Vrai pour une URL https hébergée sur le stockage Vercel Blob public : hôte exact
 * `<store>.public.blob.vercel-storage.com`, sans identifiants (`user:pw@`), sans port (même « :443 »,
 * que l'analyse d'URL supprime : l'autorité est donc relue dans le texte brut), sans barre oblique
 * inverse ni caractère de contrôle.
 */
export function isVercelBlobUrl(value: string): boolean {
  if (typeof value !== 'string' || hasControlChars(value) || value.includes('\\')) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.port !== '' || url.username !== '' || url.password !== '') return false;
    if (!BLOB_HOST_PATTERN.test(url.hostname)) return false;
    // L'autorité écrite dans le texte brut doit être exactement l'hôte : refuse « user@ », « :443 »,
    // et les écritures tordues que l'analyse d'URL « corrige » (« https:/hote », « https:hote »).
    const authority = /^https:\/\/([^/?#]*)/i.exec(value.trim())?.[1];
    return authority !== undefined && authority.toLowerCase() === url.hostname;
  } catch {
    return false;
  }
}

export function extensionOf(name: string): string | null {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? null : name.slice(dot + 1).toLowerCase();
}

/** Type de fichier autorisé d'après l'extension du nom, ou `null`. */
export function findFileKind(name: string): FileKind | null {
  const ext = extensionOf(name);
  return (ext && KIND_BY_EXT.get(ext)) || null;
}

/** Type MIME canonique d'une extension autorisée (à passer au stockage plutôt que `file.type`). */
export function canonicalMimeFor(name: string): string | null {
  return findFileKind(name)?.mime ?? null;
}

export function matchesSignature(head: Uint8Array, kind: FileKind): boolean {
  return kind.matches(head);
}

/**
 * Le type MIME déclaré par le client est-il compatible ? Les navigateurs renvoient parfois une
 * chaîne vide ou `application/octet-stream` pour des formats audio/vidéo : la signature binaire
 * fait alors foi.
 */
export function isDeclaredMimeAllowed(kind: FileKind, declared: string | null | undefined): boolean {
  const mime = (declared ?? '').split(';')[0].trim().toLowerCase();
  if (mime === '' || mime === 'application/octet-stream') return true;
  return mime === kind.mime || kind.mimeAliases.includes(mime);
}

// Dossiers optionnels puis nom de fichier : lettres, chiffres, point, tiret, underscore uniquement.
const PATHNAME_PATTERN = /^(?:[A-Za-z0-9_-]{1,50}\/){0,3}[A-Za-z0-9][A-Za-z0-9._-]{0,280}$/;

export type Validation<T = FileKind> = { ok: true; kind: T } | { ok: false; status: number; error: string };

function hasControlChars(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) < 0x20) return true;
  }
  return false;
}

const unsupportedType: Validation = {
  ok: false,
  status: 400,
  error: `Type de fichier non autorisé (${UPLOAD_FORMATS_LABEL})`,
};

/** Chemin choisi par le client pour l'envoi direct : caractères sûrs et extension en liste blanche. */
export function validateUploadPathname(pathname: string): Validation {
  if (!PATHNAME_PATTERN.test(pathname) || pathname.includes('..')) {
    return { ok: false, status: 400, error: 'Nom de fichier invalide' };
  }
  const kind = findFileKind(pathname);
  return kind ? { ok: true, kind } : unsupportedType;
}

/** Nom d'un fichier envoyé par FormData : non vide, longueur raisonnable, extension en liste blanche. */
export function validateUploadFileName(name: string): Validation {
  if (!name || name.length > MAX_FILE_NAME_LENGTH || hasControlChars(name)) {
    return { ok: false, status: 400, error: 'Nom de fichier invalide' };
  }
  const kind = findFileKind(name);
  return kind ? { ok: true, kind } : unsupportedType;
}

/** Nom de stockage assaini : caractères sûrs uniquement, 100 derniers caractères (extension conservée). */
export function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100) || 'fichier';
}

/**
 * Pré-contrôle d'un fichier choisi par l'utilisateur (nom, type, taille) avec le même jeu de
 * règles que le serveur. Renvoie le type de ressource à enregistrer, ou un message d'erreur.
 */
export function classifyFile(file: {
  name: string;
  size: number;
  type?: string;
}): { ok: true; resourceType: ResourceFileType; mime: string } | { ok: false; error: string } {
  const named = validateUploadFileName(file.name);
  if (!named.ok) return { ok: false, error: named.error };
  if (file.size === 0) return { ok: false, error: 'Le fichier est vide' };
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, error: `Fichier trop volumineux (${MAX_UPLOAD_LABEL} maximum)` };
  }
  if (!isDeclaredMimeAllowed(named.kind, file.type)) {
    return { ok: false, error: `Le type du fichier ne correspond pas à son extension (.${named.kind.ext})` };
  }
  return { ok: true, resourceType: named.kind.resourceType, mime: named.kind.mime };
}

/**
 * Contrôle d'un fichier reçu par FormData : taille (limite de la fonction serverless), nom,
 * type MIME déclaré, puis signature binaire sur le début du fichier déjà lu.
 */
export function validateFormFile(
  file: { name: string; size: number; type?: string },
  head: Uint8Array
): Validation {
  if (file.size === 0) return { ok: false, status: 400, error: 'Le fichier est vide' };
  if (file.size > MAX_FORM_FILE_BYTES) {
    return {
      ok: false,
      status: 413,
      error:
        `Fichier trop volumineux pour l'envoi classique (${MAX_FORM_UPLOAD_LABEL} maximum). ` +
        `L'envoi direct, qui accepte jusqu'à ${MAX_UPLOAD_LABEL}, n'a pas abouti : réessayez.`,
    };
  }

  const named = validateUploadFileName(file.name);
  if (!named.ok) return named;
  if (!isDeclaredMimeAllowed(named.kind, file.type)) {
    return { ok: false, status: 400, error: 'Le type du fichier ne correspond pas à son extension' };
  }
  if (!matchesSignature(head, named.kind)) {
    return { ok: false, status: 400, error: 'Le contenu du fichier ne correspond pas à son extension' };
  }
  return named;
}
