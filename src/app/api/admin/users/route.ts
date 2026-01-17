import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from "@/../auth";

export async function GET(req: Request) {
  try {
    const session = await auth();

    // Vérification de sécurité via la session serveur
    if (!session || (session.user as any).role !== 'ADMIN') {
      return NextResponse.json({ error: 'Accès interdit' }, { status: 403 });
    }

    const users = await prisma.user.findMany({
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        lastActive: true,
        level: true,
        xp: true,
        role: true,
        badges: {
          include: {
            badge: true
          }
        }
      },
      orderBy: { lastActive: 'desc' }
    });

    return NextResponse.json(users);
  } catch (error) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
