import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from "@/../auth";

export async function GET() {
  try {
    const session = await auth();
    if (!session || (session.user as any).role !== 'ADMIN') {
      return NextResponse.json({ error: 'Accès interdit' }, { status: 403 });
    }
    const levels = await prisma.level.findMany({
      include: { _count: { select: { users: true } } },
      orderBy: { name: 'asc' }
    });
    return NextResponse.json(levels);
  } catch (error) {
    return NextResponse.json({ error: 'Server Error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session || (session.user as any).role !== 'ADMIN') {
      return NextResponse.json({ error: 'Accès interdit' }, { status: 403 });
    }
    const { name } = await req.json();
    const level = await prisma.level.create({
      data: { name }
    });
    return NextResponse.json(level);
  } catch (error) {
    return NextResponse.json({ error: 'Erreur lors de la création' }, { status: 500 });
  }
}
