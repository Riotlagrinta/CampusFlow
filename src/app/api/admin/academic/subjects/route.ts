import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from "@/../auth";

// GET: Lister toutes les matières (avec filière et niveau)
export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session || (session.user as any).role !== 'ADMIN') {
      return NextResponse.json({ error: 'Accès interdit' }, { status: 403 });
    }
    const { searchParams } = new URL(req.url);
    const fieldId = searchParams.get('fieldId');
    const levelId = searchParams.get('levelId');

    const where: any = {};
    if (fieldId) where.fieldId = fieldId;
    if (levelId) where.levelId = levelId;

    const subjects = await prisma.subject.findMany({
      where,
      include: {
        field: { select: { name: true, code: true } },
        level: { select: { name: true } },
        _count: { select: { resources: true } }
      },
      orderBy: { name: 'asc' }
    });

    return NextResponse.json(subjects);
  } catch (error) {
    console.error('Erreur GET subjects:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// POST: Créer une nouvelle matière
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session || (session.user as any).role !== 'ADMIN') {
      return NextResponse.json({ error: 'Accès interdit' }, { status: 403 });
    }
    const { name, code, fieldId, levelId } = await req.json();

    if (!name || !fieldId || !levelId) {
      return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 });
    }

    const subject = await prisma.subject.create({
      data: {
        name,
        code,
        fieldId,
        levelId
      }
    });

    return NextResponse.json(subject);
  } catch (error) {
    console.error('Erreur POST subject:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
