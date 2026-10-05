import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/session';
import { safeUserSelect } from '@/lib/selects';
import { isPremium } from '@/lib/subscription';
import { checkLimits, firstIssue, personNameSchema, rateKey } from '@/lib/authHelpers';

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

const AVATAR_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

// Le type MIME envoyé par le client n'est pas fiable : on vérifie aussi la signature du fichier.
function matchesImageSignature(type: string, bytes: Uint8Array): boolean {
  const startsWith = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  switch (type) {
    case 'image/jpeg':
      return startsWith(0xff, 0xd8, 0xff);
    case 'image/png':
      return startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    case 'image/gif':
      return startsWith(0x47, 0x49, 0x46, 0x38);
    case 'image/webp':
      return startsWith(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
    default:
      return false;
  }
}

const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

const profileSchema = z.object({
  // Valeur vide = champ ignoré ; valeur fournie = lettres, espaces, apostrophes, tirets (voir personNameSchema).
  firstName: z.preprocess(emptyToUndefined, personNameSchema('Prénom').optional()),
  lastName: z.preprocess(emptyToUndefined, personNameSchema('Nom').optional()),
  // Une bio vide efface la bio.
  bio: z.string().trim().max(500, 'Bio trop longue (500 caractères maximum)').nullish(),
  // `null` efface le jeton (déconnexion d'un appareil) ; une chaîne vide est ignorée.
  pushToken: z.preprocess(emptyToUndefined, z.string().trim().max(255).nullish()),
});

// Les champs d'abonnement exposés tiennent compte de l'expiration.
function toProfile<T extends { isSubscribed: boolean; subscriptionExpiresAt: Date | null }>(user: T): T {
  return { ...user, isSubscribed: isPremium(user) };
}

export async function GET(req: Request) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { id: authUser.id }, select: safeUserSelect });
    if (!user) {
      return NextResponse.json({ error: 'Utilisateur non trouvé' }, { status: 404 });
    }

    return NextResponse.json(toProfile(user));
  } catch (error) {
    console.error('Erreur lecture profil:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const contentType = req.headers.get('content-type') || '';
    let rawFields: Record<string, unknown> = {};
    let file: File | null = null;

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData().catch(() => null);
      if (!formData) {
        return NextResponse.json({ error: 'Formulaire invalide' }, { status: 400 });
      }
      for (const key of ['firstName', 'lastName', 'bio', 'pushToken']) {
        const value = formData.get(key);
        if (typeof value === 'string') rawFields[key] = value;
      }
      const image = formData.get('image');
      if (image instanceof File && image.size > 0) file = image;
    } else {
      const body = await req.json().catch(() => null);
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 });
      }
      rawFields = body as Record<string, unknown>;
    }

    const parsed = profileSchema.safeParse(rawFields);
    if (!parsed.success) {
      return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });
    }
    const { firstName, lastName, bio, pushToken } = parsed.data;

    const updateData: {
      firstName?: string;
      lastName?: string;
      bio?: string | null;
      pushToken?: string | null;
      image?: string;
    } = {};
    if (firstName) updateData.firstName = firstName;
    if (lastName) updateData.lastName = lastName;
    if (bio !== undefined) updateData.bio = bio ? bio : null;
    if (pushToken !== undefined) updateData.pushToken = pushToken ? pushToken : null;

    if (file) {
      const extension = AVATAR_TYPES[file.type];
      if (!extension) {
        return NextResponse.json({ error: 'Format d\'image non supporté (JPEG, PNG, WebP ou GIF).' }, { status: 400 });
      }
      if (file.size > MAX_AVATAR_BYTES) {
        return NextResponse.json({ error: 'Image trop lourde (2 Mo maximum).' }, { status: 400 });
      }

      const limit = await checkLimits([
        { key: rateKey('avatar:user', authUser.id), limit: 10, windowMs: 60 * 60 * 1000 },
      ]);
      if (!limit.allowed) {
        return NextResponse.json({ error: 'Trop de changements de photo. Réessayez plus tard.' }, { status: 429 });
      }

      const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
      if (!matchesImageSignature(file.type, header)) {
        return NextResponse.json({ error: 'Le fichier n\'est pas une image valide.' }, { status: 400 });
      }

      if (!process.env.BLOB_READ_WRITE_TOKEN) {
        console.error('Erreur mise à jour profil : BLOB_READ_WRITE_TOKEN manquant.');
        return NextResponse.json({ error: 'Envoi d\'images indisponible pour le moment.' }, { status: 503 });
      }

      const blob = await put(`avatars/${authUser.id}.${extension}`, file, {
        access: 'public',
        addRandomSuffix: true,
        contentType: file.type,
      });
      updateData.image = blob.url;
    }

    const updatedUser = await prisma.user.update({
      where: { id: authUser.id },
      data: updateData,
      select: safeUserSelect,
    });

    return NextResponse.json({ success: true, user: toProfile(updatedUser) });
  } catch (error) {
    console.error('Erreur mise à jour profil:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
