import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { put } from '@vercel/blob';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { awardActionXP } from '@/lib/xp';
import { getAuthUser } from '@/lib/session';
import {
  MAX_SEMESTER,
  MIN_SEMESTER,
  getCurrentSemester,
  pageArgs,
  pagedResponse,
  parseIntParam,
  parseListParams,
  resolveFieldScope,
} from '@/lib/contentListing';
import {
  SIGNATURE_PROBE_BYTES,
  findFileKind,
  isVercelBlobUrl,
  sanitizeFileName,
  validateFormFile,
} from '@/lib/uploadValidation';

export const dynamic = 'force-dynamic';

const RESOURCE_TYPES = ['PDF', 'VIDEO', 'AUDIO', 'FOLDER', 'OTHER'] as const;

const emptyToNull = z.preprocess(
  (v) => (v === '' || v === undefined ? null : v),
  z.string().max(100).nullable()
);

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

// Schéma de validation pour la création de ressources
const resourceSchema = z.object({
  title: z.string().trim().min(2, 'Le titre est trop court').max(200, 'Le titre est trop long'),
  type: z.enum(RESOURCE_TYPES, { error: 'Type de ressource invalide' }),
  semester: z.coerce
    .number({ error: 'Semestre invalide' })
    .int('Semestre invalide')
    .min(MIN_SEMESTER, 'Semestre invalide')
    .max(MAX_SEMESTER, 'Semestre invalide')
    .default(() => getCurrentSemester()),
  fieldId: emptyToNull,
  levelId: emptyToNull,
  parentId: emptyToNull,
  url: z.string().trim().max(2048).refine(isHttpsUrl, "L'URL doit commencer par https://").optional(),
  size: z.string().trim().max(30).optional(),
});

export async function GET(req: Request) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const { searchParams } = new URL(req.url);

    const list = parseListParams(searchParams);
    if ('error' in list) return NextResponse.json({ error: list.error }, { status: 400 });

    // Sans paramètre semester, tous les semestres sont renvoyés.
    const semester = parseIntParam(searchParams.get('semester'), MIN_SEMESTER, MAX_SEMESTER);
    if (semester === null) return NextResponse.json({ error: 'Semestre invalide' }, { status: 400 });

    const rawParent = searchParams.get('parentId');
    const parentId = !rawParent || rawParent === 'null' || rawParent === 'undefined' ? null : rawParent;
    if (parentId && parentId.length > 100) return NextResponse.json({ error: 'Dossier invalide' }, { status: 400 });

    const rawType = searchParams.get('type');
    if (rawType && !(RESOURCE_TYPES as readonly string[]).includes(rawType)) {
      return NextResponse.json({ error: 'Type de ressource invalide' }, { status: 400 });
    }

    // flat=1 : tous les fichiers (hors dossiers) du périmètre, quel que soit leur dossier parent.
    // `parentId` est alors ignoré ; `type` (ex. PDF) et `semester` restent des filtres optionnels.
    const flat = searchParams.get('flat') === '1';
    if (flat && rawType === 'FOLDER') {
      return NextResponse.json({ error: 'Le mode flat ne renvoie pas les dossiers' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: { fieldId: true, academicLevelId: true },
    });
    if (!user) return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 });

    // Isolation par filière/niveau (tronc commun GL/RIT inclus), sauf pour les admins
    const fieldScope = authUser.role === 'ADMIN' ? null : await resolveFieldScope(user.fieldId);

    const resources = await prisma.resource.findMany({
      where: {
        ...(flat ? {} : { parentId }),
        ...(semester !== undefined ? { semester } : {}),
        ...(rawType ? { type: rawType } : flat ? { type: { not: 'FOLDER' } } : {}),
        ...(authUser.role === 'ADMIN'
          ? {}
          : {
              OR: [
                { fieldId: fieldScope, levelId: user.academicLevelId },
                { fieldId: null, levelId: null }, // Ressources publiques/tronc commun global
              ],
            }),
      },
      select: {
        id: true,
        title: true,
        description: true,
        type: true,
        url: true,
        size: true,
        subjectName: true,
        subjectId: true,
        fieldId: true,
        levelId: true,
        semester: true,
        parentId: true,
        createdAt: true,
        author: { select: { firstName: true, lastName: true, level: true } },
        subject: { select: { name: true, code: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      ...pageArgs(list),
    });

    // Mode plat : pas de dossiers, donc ordre de la requête (récent d'abord, curseur stable)
    if (flat) return pagedResponse(resources, list.limit);

    // Dossiers en premier au sein de la page (tri stable)
    return pagedResponse(resources, list.limit, (page) =>
      [...page].sort((a, b) => Number(b.type === 'FOLDER') - Number(a.type === 'FOLDER'))
    );
  } catch (error) {
    console.error('Error GET Resources:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ error: 'Session expirée' }, { status: 401 });
    if (user.role !== 'ADMIN') return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });

    const contentType = req.headers.get('content-type') || '';
    let uploadData: Record<string, unknown> = {};
    let isJson = false;

    try {
      if (contentType.includes('application/json')) {
        const body = await req.json();
        if (typeof body !== 'object' || body === null || Array.isArray(body)) {
          return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 });
        }
        uploadData = body as Record<string, unknown>;
        isJson = true;
      } else {
        const formData = await req.formData();
        uploadData = Object.fromEntries(formData);
      }
    } catch {
      return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 });
    }

    // Validation Zod
    const validation = resourceSchema.safeParse(uploadData);
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.issues[0]?.message ?? 'Données invalides' },
        { status: 400 }
      );
    }
    const { title, type, parentId, url, size } = validation.data;
    let { fieldId, levelId, semester } = validation.data;

    // Un élément placé dans un dossier hérite de sa filière, de son niveau et de son semestre
    if (parentId) {
      const parent = await prisma.resource.findUnique({
        where: { id: parentId },
        select: { type: true, fieldId: true, levelId: true, semester: true },
      });
      if (!parent || parent.type !== 'FOLDER') {
        return NextResponse.json({ error: 'Dossier parent introuvable' }, { status: 400 });
      }
      fieldId = parent.fieldId;
      levelId = parent.levelId;
      semester = parent.semester;
    } else {
      const [field, level] = await Promise.all([
        fieldId ? prisma.field.findUnique({ where: { id: fieldId }, select: { id: true } }) : true,
        levelId ? prisma.level.findUnique({ where: { id: levelId }, select: { id: true } }) : true,
      ]);
      if (!field) return NextResponse.json({ error: 'Filière introuvable' }, { status: 400 });
      if (!level) return NextResponse.json({ error: 'Niveau introuvable' }, { status: 400 });
    }

    // Création de DOSSIER
    if (type === 'FOLDER') {
      const folder = await prisma.resource.create({
        data: { title, type: 'FOLDER', url: '#', authorId: user.id, semester, fieldId, levelId, parentId },
      });
      return NextResponse.json(folder, { status: 201 });
    }

    // Gestion FICHIER
    let fileUrl = url || '';
    let sizeStr = size || '0 MB';

    const file = uploadData.file;
    if (!isJson && file instanceof File) {
      // Mêmes règles que l'envoi direct (/api/upload) : taille, nom, type MIME, signature binaire.
      const head = new Uint8Array(await file.slice(0, SIGNATURE_PROBE_BYTES).arrayBuffer());
      const checked = validateFormFile(file, head);
      if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: checked.status });
      if (type !== checked.kind.resourceType) {
        return NextResponse.json(
          { error: `Le type choisi (${type}) ne correspond pas au fichier (${checked.kind.resourceType})` },
          { status: 400 }
        );
      }

      sizeStr = `${(file.size / (1024 * 1024)).toFixed(2)} MB`;
      const storedName = `${randomUUID()}-${sanitizeFileName(file.name)}`;

      if (process.env.BLOB_READ_WRITE_TOKEN) {
        const blob = await put(`resources/${storedName}`, file, {
          access: 'public',
          contentType: checked.kind.mime,
        });
        fileUrl = blob.url;
      } else if (process.env.NODE_ENV === 'development') {
        const uploadDir = path.join(process.cwd(), 'public', 'uploads');
        await mkdir(uploadDir, { recursive: true });
        await writeFile(path.join(uploadDir, storedName), Buffer.from(await file.arrayBuffer()));
        fileUrl = `/uploads/${storedName}`;
      } else {
        return NextResponse.json({ error: 'Stockage de fichiers non configuré' }, { status: 500 });
      }
    }

    if (!fileUrl) return NextResponse.json({ error: 'URL ou fichier manquant' }, { status: 400 });

    // Fichier envoyé en direct vers Vercel Blob : son extension doit être en liste blanche et
    // correspondre au type choisi. Les liens externes (autre hôte) ne sont pas concernés.
    if (isVercelBlobUrl(fileUrl)) {
      const kind = findFileKind(new URL(fileUrl).pathname);
      if (!kind) return NextResponse.json({ error: 'Type de fichier non autorisé' }, { status: 400 });
      if (type !== kind.resourceType) {
        return NextResponse.json(
          { error: `Le type choisi (${type}) ne correspond pas au fichier (${kind.resourceType})` },
          { status: 400 }
        );
      }
    }

    const resource = await prisma.resource.create({
      data: { title, type, url: fileUrl, size: sizeStr, authorId: user.id, semester, fieldId, levelId, parentId },
    });

    // L'XP est un bonus : son échec ne doit pas faire échouer l'ajout déjà enregistré
    try {
      await awardActionXP(user.id, 'resource');
    } catch (xpError) {
      console.error('Erreur XP après ajout de ressource:', xpError);
    }

    return NextResponse.json(resource, { status: 201 });
  } catch (error) {
    console.error('Crash API Resources:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
