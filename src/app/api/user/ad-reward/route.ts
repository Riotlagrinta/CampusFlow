import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from "@/../auth";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session || !session.user?.email) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    // Mise à jour réelle : 2 jetons par pub regardée
    await prisma.user.update({
      where: { email: session.user.email },
      data: {
        aiBonusRequests: { increment: 2 } 
      }
    });

    return NextResponse.json({ success: true, message: '2 requêtes bonus ajoutées !' });
  } catch (error) {
    return NextResponse.json({ error: 'Server Error' }, { status: 500 });
  }
}
