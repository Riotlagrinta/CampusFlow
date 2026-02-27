import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from "@/../auth";

export async function DELETE(
  req: Request, 
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session || !session.user?.email) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const { id: setId } = await params;

    // Vérifier la propriété
    const set = await prisma.flashcardSet.findUnique({ where: { id: setId } });
    if (!set || set.userId !== user.id) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });

    await prisma.flashcardSet.delete({ where: { id: setId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Server Error' }, { status: 500 });
  }
}
