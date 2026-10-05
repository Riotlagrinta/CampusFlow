import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { del } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthUser } from '@/lib/session';
import {
  ALLOWED_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_LABEL,
  SIGNATURE_PROBE_BYTES,
  extensionOf,
  findFileKind,
  matchesSignature,
  validateUploadPathname,
} from '@/lib/uploadValidation';

/**
 * Envoi direct vers Vercel Blob (le fichier ne transite jamais par cette route) :
 *  - génération du jeton client réservée aux administrateurs ;
 *  - le jeton limite la taille (50 Mo), les types MIME et ajoute un suffixe aléatoire au nom ;
 *  - le nom (pathname) choisi par le client est validé : caractères sûrs, extension en liste blanche ;
 *  - à la fin de l'envoi, Vercel rappelle cette route (signature vérifiée par le SDK) : on contrôle
 *    alors la signature binaire (magic bytes) du fichier et on le supprime s'il ne correspond pas
 *    à son extension. Le rappel n'a pas lieu en développement local (pas d'URL publique).
 * Les règles (formats, signatures, taille) sont dans `@/lib/uploadValidation`, partagées avec
 * l'envoi classique de /api/resources.
 * Aucun écrit sur le disque : le repli local de développement est dans /api/resources.
 */

// Corps JSON de la négociation : quelques centaines d'octets en pratique.
const MAX_BODY_BYTES = 16 * 1024;

const BLOB_HOST_SUFFIX = '.public.blob.vercel-storage.com';

class UploadError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

// Corps de la négociation. Validation seulement : le SDK reçoit l'objet JSON d'origine, car
// la signature du rappel est calculée sur sa sérialisation exacte.
const bodySchema = z.discriminatedUnion('type', [
  z.looseObject({
    type: z.literal('blob.generate-client-token'),
    payload: z.looseObject({
      pathname: z.string().min(1).max(300),
      clientPayload: z.string().max(2000).nullish(),
      multipart: z.boolean().optional(),
    }),
  }),
  z.looseObject({
    type: z.literal('blob.upload-completed'),
    payload: z.looseObject({
      blob: z.looseObject({ url: z.string().max(2048), pathname: z.string().max(400) }),
      tokenPayload: z.string().max(2000).nullish(),
    }),
  }),
]);

// Taille annoncée par le client (clientPayload JSON `{ "size": <octets> }`) : refus anticipé avec un 413
// clair. La limite réelle est imposée par le jeton (maximumSizeInBytes), côté Vercel Blob.
function assertDeclaredSize(clientPayload: string | null | undefined) {
  if (!clientPayload) return;
  try {
    const declared: unknown = JSON.parse(clientPayload);
    const size = declared && typeof declared === 'object' ? (declared as { size?: unknown }).size : undefined;
    if (typeof size === 'number' && size > MAX_UPLOAD_BYTES) {
      throw new UploadError(413, `Fichier trop volumineux (${MAX_UPLOAD_LABEL} maximum)`);
    }
  } catch (error) {
    if (error instanceof UploadError) throw error;
    // clientPayload non JSON : ignoré
  }
}

// Lit uniquement le début du fichier (jamais le fichier entier en mémoire).
async function readFileHead(url: string): Promise<Uint8Array> {
  const res = await fetch(url, {
    headers: { Range: `bytes=0-${SIGNATURE_PROBE_BYTES - 1}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok || !res.body) throw new Error(`Lecture impossible (${res.status})`);

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < SIGNATURE_PROBE_BYTES) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      total += value.length;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }

  const head = new Uint8Array(Math.min(total, SIGNATURE_PROBE_BYTES));
  let written = 0;
  for (const chunk of chunks) {
    const part = chunk.subarray(0, head.length - written);
    head.set(part, written);
    written += part.length;
    if (written >= head.length) break;
  }
  return head;
}

function adminIdFrom(tokenPayload: string | null | undefined): string | null {
  try {
    const parsed: unknown = JSON.parse(tokenPayload ?? '');
    const userId = parsed && typeof parsed === 'object' ? (parsed as { userId?: unknown }).userId : undefined;
    return typeof userId === 'string' ? userId : null;
  } catch {
    return null;
  }
}

async function verifyUploadedFile(blob: { url: string; pathname: string }, tokenPayload: string | null | undefined) {
  const adminId = adminIdFrom(tokenPayload);
  const ext = extensionOf(blob.pathname);
  const kind = findFileKind(blob.pathname);

  let hostname = '';
  try {
    hostname = new URL(blob.url).hostname;
  } catch {
    // URL invalide : traitée comme un hôte non autorisé
  }
  if (!hostname.endsWith(BLOB_HOST_SUFFIX)) {
    console.warn('[upload]', JSON.stringify({ adminId, event: 'unexpected-host' }));
    return;
  }

  let valid = false;
  if (kind) {
    try {
      valid = matchesSignature(await readFileHead(blob.url), kind);
    } catch (error) {
      // Lecture impossible (réseau) : on ne supprime pas sur une erreur d'infrastructure.
      console.error('[upload] vérification de signature impossible:', error instanceof Error ? error.message : error);
      return;
    }
  }

  if (!valid) {
    try {
      await del(blob.url);
    } catch (error) {
      console.error('[upload] suppression du fichier refusé impossible:', error instanceof Error ? error.message : error);
    }
    console.warn('[upload]', JSON.stringify({ adminId, event: 'rejected', ext }));
    return;
  }

  console.info('[upload]', JSON.stringify({ adminId, event: 'completed', ext }));
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const declaredLength = Number(request.headers.get('content-length') ?? 0);
    if (declaredLength > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'Requête trop volumineuse' }, { status: 413 });
    }
    const rawText = await request.text();
    if (rawText.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'Requête trop volumineuse' }, { status: 413 });
    }

    let raw: unknown;
    try {
      raw = JSON.parse(rawText);
    } catch {
      return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 });
    }
    if (!bodySchema.safeParse(raw).success) {
      return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 });
    }
    const body = raw as HandleUploadBody;

    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const user = await getAuthUser(request);
        if (!user) throw new UploadError(401, 'Non authentifié');
        if (user.role !== 'ADMIN') throw new UploadError(403, 'Accès refusé : seuls les admins peuvent uploader.');

        const checked = validateUploadPathname(pathname);
        if (!checked.ok) throw new UploadError(checked.status, checked.error);
        assertDeclaredSize(clientPayload);

        return {
          allowedContentTypes: [...ALLOWED_MIME_TYPES],
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          addRandomSuffix: true,
          allowOverwrite: false,
          tokenPayload: JSON.stringify({ userId: user.id }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // Ne jamais lever d'exception ici : Vercel rejouerait le rappel.
        try {
          await verifyUploadedFile(blob, tokenPayload);
        } catch (error) {
          console.error('[upload] erreur après envoi:', error instanceof Error ? error.message : error);
        }
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    if (error instanceof UploadError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[upload] erreur:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Envoi refusé' }, { status: 400 });
  }
}
