import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from "@/../auth";

export async function PATCH(req: Request) {
  try {
    const session = await auth();
    if (!session || !session.user?.email) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const { oldPassword, newPassword } = await req.json();

    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (!user || user.password !== oldPassword) {
      return NextResponse.json({ error: 'L\'ancien mot de passe est incorrect' }, { status: 400 });
    }

    await prisma.user.update({
      where: { email: session.user.email },
      data: { password: newPassword }
    });

    return NextResponse.json({ success: true, message: 'Mot de passe mis à jour' });
  } catch (error) {
    console.error('Erreur password:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
