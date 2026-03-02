import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { addXP } from '@/lib/xp';
import { auth } from "@/../auth";
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { put } from '@vercel/blob';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

// Schéma de validation pour la création de ressources
const resourceSchema = z.object({
    title: z.string().min(3, "Le titre est trop court"),
    type: z.enum(["PDF", "VIDEO", "AUDIO", "FOLDER", "OTHER"]),
    semester: z.string().or(z.number()).transform(v => parseInt(v.toString())),
    fieldId: z.string().nullable().optional(),
    levelId: z.string().nullable().optional(),
    parentId: z.string().nullable().optional(),
    url: z.string().optional(),
    size: z.string().optional(),
});

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    let parentId = searchParams.get('parentId');
    const semester = parseInt(searchParams.get('semester') || '1');
    if (parentId === 'null' || parentId === 'undefined' || !parentId) parentId = null;

    const session = await auth();
    if (!session || !session.user?.email) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { fieldId: true, academicLevelId: true, role: true }
    });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // Isolation dynamique au lieu d'IDs en dur
    let fieldFilter: any = user.fieldId;
    
    // Si l'utilisateur est en GL ou RIT, il partage certaines ressources (tronc commun)
    if (user.fieldId) {
        const userField = await prisma.field.findUnique({ where: { id: user.fieldId } });
        if (userField?.code === 'GL' || userField?.code === 'RIT') {
            const sharedFields = await prisma.field.findMany({
                where: { code: { in: ['GL', 'RIT'] } },
                select: { id: true }
            });
            fieldFilter = { in: sharedFields.map(f => f.id) };
        }
    }

    const resources = await prisma.resource.findMany({
      where: {
        parentId: parentId,
        semester,
        ...(user.role === 'ADMIN' ? {} : {
          fieldId: fieldFilter,
          levelId: user.academicLevelId
        })
      },
      include: {
        author: { select: { firstName: true, lastName: true, level: true } },
        subject: { select: { name: true, code: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json(resources.sort((a, b) => (a.type === 'FOLDER' ? -1 : 1)));
  } catch (error) {
    console.error('Error GET Resources:', error);
    return NextResponse.json({ error: 'Server Error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session || !session.user?.email) return NextResponse.json({ error: 'Session expirée' }, { status: 401 });

    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user || user.role !== 'ADMIN') return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });

    const contentType = req.headers.get("content-type") || "";
    let data: any = {};
    let isJson = false;

    if (contentType.includes("application/json")) {
        data = await req.json();
        isJson = true;
    } else {
        const formData = await req.formData();
        data = Object.fromEntries(formData);
        data.file = formData.get('file');
    }

    // Validation Zod
    const validation = resourceSchema.safeParse(data);
    if (!validation.success) {
        return NextResponse.json({ error: "Données invalides", details: validation.error.format() }, { status: 400 });
    }
    const validatedData = validation.data;

    // Création de DOSSIER
    if (validatedData.type === 'FOLDER') {
         const folder = await prisma.resource.create({
            data: {
                title: validatedData.title,
                type: 'FOLDER',
                url: '#',
                authorId: user.id,
                semester: validatedData.semester,
                fieldId: validatedData.fieldId || null,
                levelId: validatedData.levelId || null,
                parentId: validatedData.parentId || null,
            }
         });
         return NextResponse.json(folder);
    }

    // Gestion FICHIER
    let fileUrl = validatedData.url || '';
    let sizeStr = validatedData.size || '0 MB';

    if (!isJson && data.file && typeof data.file !== 'string') {
        const file = data.file as File;
        sizeStr = `${(file.size / (1024 * 1024)).toFixed(2)} MB`;
        
        if (process.env.BLOB_READ_WRITE_TOKEN) {
            const blob = await put(`resources/${Date.now()}-${file.name}`, file, { access: 'public' });
            fileUrl = blob.url;
        } else if (process.env.NODE_ENV === 'development') {
            const uploadDir = path.join(process.cwd(), 'public', 'uploads');
            await mkdir(uploadDir, { recursive: true }).catch(() => {}); 
            const fileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
            await writeFile(path.join(uploadDir, fileName), Buffer.from(await file.arrayBuffer()));
            fileUrl = `/uploads/${fileName}`;
        }
    }

    if (!fileUrl) return NextResponse.json({ error: "URL ou fichier manquant" }, { status: 400 });

    const resource = await prisma.resource.create({
      data: {
        title: validatedData.title,
        type: validatedData.type,
        url: fileUrl,
        size: sizeStr,
        authorId: user.id,
        semester: validatedData.semester,
        fieldId: validatedData.fieldId || null,
        levelId: validatedData.levelId || null,
        parentId: validatedData.parentId || null,
      }
    });

    await addXP(user.id, 30);
    return NextResponse.json(resource);
  } catch (error: any) {
    console.error('Crash API Resources:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
