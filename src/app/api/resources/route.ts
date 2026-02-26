import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { addXP } from '@/lib/xp';
import { auth } from "@/../auth";
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { put } from '@vercel/blob';

export const dynamic = 'force-dynamic';

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

    const GL_ID = "5752636c-824a-44e1-bc75-7e091b22342d";
    const RIT_ID = "137ef97d-2186-43f5-a795-875ca26fb194";
    const isTroncCommun = user.fieldId === GL_ID || user.fieldId === RIT_ID;

    // Si on cherche dans un dossier, on ignore les filtres de filière pour être sûr de tout voir
    // Si on est à la racine, on filtre par filière pour les étudiants (avec partage pour GL/RIT)
    const resources = await prisma.resource.findMany({
      where: parentId ? { parentId } : {
        parentId: null,
        semester,
        ...(user.role === 'ADMIN' ? {} : {
          fieldId: isTroncCommun ? { in: [GL_ID, RIT_ID] } : user.fieldId,
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
    return NextResponse.json({ error: 'Server Error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session || !session.user?.email) return NextResponse.json({ error: 'Session expirée' }, { status: 401 });

    const contentType = req.headers.get("content-type") || "";
    let data: any = {};
    let isJson = false;

    // Gestion JSON (Upload Direct) ou FormData (Ancien système/Petit fichiers)
    if (contentType.includes("application/json")) {
        data = await req.json();
        isJson = true;
    } else {
        const formData = (await req.formData()) as any;
        data = Object.fromEntries(formData);
        data.file = formData.get('file'); // Récupérer le fichier spécifiquement
    }

    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user || user.role !== 'ADMIN') return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });

    // Création de DOSSIER
    if (data.type === 'FOLDER') {
         const folder = await prisma.resource.create({
            data: {
                title: data.title || "Nouveau Dossier",
                type: 'FOLDER',
                url: '#',
                authorId: user.id,
                semester: parseInt(data.semester || '1'),
                fieldId: data.fieldId || null,
                levelId: data.levelId || null,
                parentId: (data.parentId === 'null' || !data.parentId) ? null : data.parentId,
            }
         });
         return NextResponse.json(folder);
    }

    // Gestion FICHIER
    let fileUrl = data.externalUrl || '';
    let sizeStr = '0 MB';

    // CAS 1: Upload Direct (Déjà fait côté client, on reçoit l'URL)
    if (isJson && data.url) {
        fileUrl = data.url;
        sizeStr = data.size || '0 MB';
    }
    // CAS 2: Upload Classique (Via serveur - Limité à 4.5MB sur Vercel)
    else if (data.file && typeof data.file !== 'string') {
        const file = data.file as File;
        sizeStr = `${(file.size / (1024 * 1024)).toFixed(2)} MB`;
        
        if (process.env.BLOB_READ_WRITE_TOKEN) {
            try {
                const blob = await put(`resources/${Date.now()}-${file.name}`, file, { access: 'public' });
                fileUrl = blob.url;
            } catch (e) {
                console.error("Erreur Blob:", e);
                return NextResponse.json({ error: "Erreur stockage cloud." }, { status: 500 });
            }
        } else if (process.env.NODE_ENV === 'development') {
            const uploadDir = path.join(process.cwd(), 'public', 'uploads');
            await mkdir(uploadDir, { recursive: true }).catch(() => {}); 
            const fileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
            await writeFile(path.join(uploadDir, fileName), Buffer.from(await file.arrayBuffer()));
            fileUrl = `/uploads/${fileName}`;
        } else {
            return NextResponse.json({ error: "Stockage non configuré (Blob requis en prod)." }, { status: 500 });
        }
    }

    const resource = await prisma.resource.create({
      data: {
        title: data.title || "Sans titre",
        type: data.type || 'PDF',
        url: fileUrl,
        size: sizeStr,
        authorId: user.id,
        semester: parseInt(data.semester || '1'),
        fieldId: data.fieldId || null,
        levelId: data.levelId || null,
        parentId: (data.parentId === 'null' || !data.parentId) ? null : data.parentId,
      }
    });

    await addXP(user.id, 30);
    return NextResponse.json(resource);
  } catch (error: any) {
    console.error('Crash API:', error);
    return NextResponse.json({ error: error.message || 'Erreur interne' }, { status: 500 });
  }
}
