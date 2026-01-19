import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/../auth';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || (session.user as any).role !== 'ADMIN') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  const { id } = await params;

  try {
    await prisma.user.update({
      where: { id },
      data: { isActive: true, otpCode: null }
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Erreur lors de l\'activation' }, { status: 500 });
  }
}
