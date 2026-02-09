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

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const title = formData.get('title') as string;
    const type = formData.get('type') as string;
    const fieldId = formData.get('fieldId') as string;
    const levelId = formData.get('levelId') as string;
    let parentId = formData.get('parentId') as string | null;
    if (parentId === 'null' || !parentId) parentId = null;

    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user || user.role !== 'ADMIN') return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });

    if (type === 'FOLDER') {
         const folder = await prisma.resource.create({
            data: {
                title: title || "Nouveau Dossier",
                type: 'FOLDER',
                url: '#',
                authorId: user.id,
                fieldId: fieldId || null,
                levelId: levelId || null,
                parentId: parentId,
            }
         });
         return NextResponse.json(folder);
    }

    let fileUrl = formData.get('externalUrl') as string || '';
    let sizeStr = '0 MB';

    if (file) {
        sizeStr = `${(file.size / (1024 * 1024)).toFixed(2)} MB`;
        
        // PRIORITÉ : Vercel Blob (Production)
        if (process.env.BLOB_READ_WRITE_TOKEN) {
            try {
                const blob = await put(`resources/${Date.now()}-${file.name}`, file, {
                    access: 'public',
                });
                fileUrl = blob.url;
            } catch (e) {
                console.error("Erreur Vercel Blob:", e);
                return NextResponse.json({ error: "Erreur lors de l'upload vers le stockage cloud." }, { status: 500 });
            }
        } 
        // FALLBACK : Local (Si pas de Blob, on stocke en local quel que soit l'env pour éviter les blocages)
        else {
            const uploadDir = path.join(process.cwd(), 'public', 'uploads');
            await mkdir(uploadDir, { recursive: true }).catch(() => {}); 
            const fileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
            await writeFile(path.join(uploadDir, fileName), Buffer.from(await file.arrayBuffer()));
            fileUrl = `/uploads/${fileName}`;
        }
    }

    const resource = await prisma.resource.create({
      data: {
        title: title || (file ? file.name : "Sans titre"),
        type: type || 'PDF',
        url: fileUrl,
        size: sizeStr,
        authorId: user.id,
        fieldId: fieldId || null,
        levelId: levelId || null,
        parentId: parentId,
      }
    });

    await addXP(user.id, 30);
    return NextResponse.json(resource);
  } catch (error: any) {
    console.error('Crash complet API:', error);
    return NextResponse.json({ error: error.message || 'Erreur interne' }, { status: 500 });
  }
}
