import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { addXP } from '@/lib/xp';
import { auth } from "@/../auth";

export async function GET() {
  try {
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
      where: user.role === 'ADMIN' ? {} : {
        fieldId: user.fieldId,
        levelId: user.academicLevelId
      },
      include: {
        author: { select: { firstName: true, lastName: true, level: true } },
        subject: { select: { name: true, code: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    return NextResponse.json(resources);
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
    const file = formData.get('file') as File;
    const title = formData.get('title') as string;
    const type = formData.get('type') as string;
    const subjectId = formData.get('subjectId') as string;
    const fieldId = formData.get('fieldId') as string;
    const levelId = formData.get('levelId') as string;

    if (!file || !title || !type) {
      return NextResponse.json({ error: 'Champs manquants' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // Sécurité : Seul l'ADMIN peut uploader
    if (user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    // Upload vers Vercel Blob
    const blob = await put(`resources/${Date.now()}-${file.name}`, file, {
      access: 'public',
    });

    const sizeInMB = (file.size / (1024 * 1024)).toFixed(2);
    const sizeStr = `${sizeInMB} MB`;

    const resource = await prisma.resource.create({
      data: {
        title,
        type,
        subjectId: subjectId || null,
        url: blob.url,
        size: sizeStr,
        authorId: user.id,
        fieldId: fieldId || null,
        levelId: levelId || null
      }
    });

    // Bonus XP automatique (+30 XP)
    await addXP(user.id, 30);

    return NextResponse.json(resource);
  } catch (error) {
    console.error('Erreur Upload:', error);
    return NextResponse.json({ error: 'Échec de l\'upload vers le cloud' }, { status: 500 });
  }
}
