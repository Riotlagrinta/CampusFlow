import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { addXP } from '@/lib/xp';
import { auth } from "@/../auth";
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    let parentId = searchParams.get('parentId');
    
    // Normalisation du parentId
    if (parentId === 'null' || parentId === 'undefined' || !parentId) {
        parentId = null;
    }

    const session = await auth();
    if (!session || !session.user?.email) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { fieldId: true, academicLevelId: true, role: true }
    });

    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // Si on cherche dans un dossier, on ignore les filtres de filière pour être sûr de tout voir
    // Si on est à la racine, on filtre par filière pour les étudiants
    const resources = await prisma.resource.findMany({
      where: parentId ? { parentId } : {
        parentId: null,
        ...(user.role === 'ADMIN' ? {} : {
          fieldId: user.fieldId,
          levelId: user.academicLevelId
        })
      },
      include: {
        author: { select: { firstName: true, lastName: true, level: true } },
        subject: { select: { name: true, code: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Tri : Dossiers en premier
    const sortedResources = resources.sort((a, b) => {
        if (a.type === 'FOLDER' && b.type !== 'FOLDER') return -1;
        if (a.type !== 'FOLDER' && b.type === 'FOLDER') return 1;
        return 0;
    });

    return NextResponse.json(sortedResources);
  } catch (error) {
    console.error('Erreur GET resources:', error);
    return NextResponse.json({ error: 'Server Error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session || !session.user?.email) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const title = formData.get('title') as string;
    const type = formData.get('type') as string;
    const fieldId = formData.get('fieldId') as string;
    const levelId = formData.get('levelId') as string;
    const subjectNameInput = formData.get('subjectName') as string;
    let parentId = formData.get('parentId') as string | null;

    // Normalisation du parentId pour éviter le texte "null"
    if (parentId === 'null' || parentId === 'undefined' || !parentId) {
        parentId = null;
    }

    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    // Cas création de dossier
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
                subjectName: subjectNameInput || null,
            }
         });
         return NextResponse.json(folder);
    }

    // Cas import de fichier
    if (!file && !formData.get('externalUrl')) {
      return NextResponse.json({ error: 'Fichier requis' }, { status: 400 });
    }

    let fileUrl = formData.get('externalUrl') as string || '';
    let sizeStr = 'Lien Externe';

    if (file) {
        const uploadDir = path.join(process.cwd(), 'public', 'uploads');
        await mkdir(uploadDir, { recursive: true });
        const fileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
        await writeFile(path.join(uploadDir, fileName), Buffer.from(await file.arrayBuffer()));
        fileUrl = `/uploads/${fileName}`;
        sizeStr = `${(file.size / (1024 * 1024)).toFixed(2)} MB`;
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
        subjectName: subjectNameInput || null
      }
    });

    await addXP(user.id, 30);
    return NextResponse.json(resource);
  } catch (error) {
    console.error('Erreur POST resources:', error);
    return NextResponse.json({ error: 'Échec de l\'opération' }, { status: 500 });
  }
}
