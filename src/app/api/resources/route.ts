import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { addXP } from '@/lib/xp';
import { auth } from "@/../auth";
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    console.log("GET /api/resources called");
    const { searchParams } = new URL(req.url);
    const parentId = searchParams.get('parentId');

    const session = await auth();
    if (!session || !session.user?.email) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { fieldId: true, academicLevelId: true, role: true }
    });

    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const resources = await prisma.resource.findMany({
      where: {
        ...(parentId && parentId !== 'null' 
          ? { parentId } 
          : {
              parentId: null,
              ...(user.role === 'ADMIN' ? {} : {
                fieldId: user.fieldId,
                levelId: user.academicLevelId
              })
            }
        )
      },
      include: {
        author: { select: { firstName: true, lastName: true, level: true } },
        subject: { select: { name: true, code: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Sort: Folders first
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
    const { put } = require('@vercel/blob');
    const session = await auth();
    if (!session || !session.user?.email) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const externalUrl = formData.get('externalUrl') as string | null;
    const title = formData.get('title') as string;
    const type = formData.get('type') as string;
    const subjectId = formData.get('subjectId') as string;
    const fieldId = formData.get('fieldId') as string;
    const levelId = formData.get('levelId') as string;
    const parentId = formData.get('parentId') as string;

    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // Sécurité : Seul l'ADMIN peut uploader
    if (user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    // Special case for Folder Creation
    if (type === 'FOLDER') {
         if (!title) return NextResponse.json({ error: 'Le nom du dossier est requis.' }, { status: 400 });
         
         const folder = await prisma.resource.create({
            data: {
                title,
                type: 'FOLDER',
                url: '#', // Placeholder
                size: null,
                authorId: user.id,
                fieldId: fieldId || null,
                levelId: levelId || null,
                parentId: parentId || null,
                subjectName: formData.get('subjectName') as string || null,
            }
         });
         return NextResponse.json(folder);
    }

    // Validation : Soit un fichier, soit une URL externe
    if ((!file && !externalUrl) || !title || !type) {
      return NextResponse.json({ error: 'Fichier ou Lien requis, ainsi que titre et type.' }, { status: 400 });
    }

    let fileUrl = '';
    let sizeStr = 'Lien Externe';

    if (externalUrl) {
        fileUrl = externalUrl;
    } else if (file) {
        // Détection : Local vs Cloud (Vercel Blob)
        if (process.env.BLOB_READ_WRITE_TOKEN) {
          // Mode Cloud (Production)
          const blob = await put(`resources/${Date.now()}-${file.name}`, file, {
            access: 'public',
          });
          fileUrl = blob.url;
        } else {
          // Mode Local (Fallback)
          const uploadDir = path.join(process.cwd(), 'public', 'uploads');
          await mkdir(uploadDir, { recursive: true });
          const fileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
          const filePath = path.join(uploadDir, fileName);
          const bytes = await file.arrayBuffer();
          const buffer = Buffer.from(bytes);
          await writeFile(filePath, buffer);
          fileUrl = `/uploads/${fileName}`;
        }
        const sizeInMB = (file.size / (1024 * 1024)).toFixed(2);
        sizeStr = `${sizeInMB} MB`;
    }

    // Gestion automatique de la matière
    let finalSubjectId = subjectId;
    const subjectNameInput = formData.get('subjectName') as string;
    
    if (!finalSubjectId && subjectNameInput && fieldId && levelId) {
      const existingSubject = await prisma.subject.findFirst({
        where: { 
          name: { equals: subjectNameInput, mode: 'insensitive' },
          fieldId,
          levelId
        }
      });
      if (existingSubject) {
        finalSubjectId = existingSubject.id;
      } else {
        const newSub = await prisma.subject.create({
          data: { name: subjectNameInput, fieldId, levelId }
        });
        finalSubjectId = newSub.id;
      }
    }

    const resource = await prisma.resource.create({
      data: {
        title,
        type,
        subjectId: finalSubjectId || null,
        subjectName: subjectNameInput || null,
        url: fileUrl,
        size: sizeStr,
        authorId: user.id,
        fieldId: fieldId || null,
        levelId: levelId || null,
        parentId: parentId || null
      }
    });

    await addXP(user.id, 30);
    return NextResponse.json(resource);
  } catch (error) {
    console.error('Erreur Upload:', error);
    return NextResponse.json({ error: 'Échec de l\'upload' }, { status: 500 });
  }
}