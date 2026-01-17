import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { addXP } from '@/lib/xp';
import { auth } from "@/../auth";

export async function GET() {
  try {
    const resources = await prisma.resource.findMany({
      include: {
        author: { select: { firstName: true, lastName: true, level: true } }
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
    const subject = formData.get('subject') as string;

    if (!file || !title || !type) {
      return NextResponse.json({ error: 'Champs manquants' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // Sécurité : Seul l'ADMIN peut uploader
    if (user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    // Upload vers Vercel Blob au lieu du disque local
    const blob = await put(`resources/${Date.now()}-${file.name}`, file, {
      access: 'public',
    });

    // Calcul de la taille lisible
    const sizeInMB = (file.size / (1024 * 1024)).toFixed(2);
    const sizeStr = `${sizeInMB} MB`;

    const resource = await prisma.resource.create({
      data: {
        title,
        type,
        subject: subject || 'Général',
        url: blob.url,
        size: sizeStr,
        authorId: user.id
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
