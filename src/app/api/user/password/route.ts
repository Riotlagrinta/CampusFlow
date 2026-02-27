import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from "@/../auth";
import bcrypt from "bcryptjs"; // Importez bcryptjs

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

    const passwordMatch = await bcrypt.compare(oldPassword, user.password);
    if (!user || !passwordMatch) {
      return NextResponse.json({ error: 'L\'ancien mot de passe est incorrect' }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { email: session.user.email },
      data: { password: hashedPassword }
    });

    return NextResponse.json({ success: true, message: 'Mot de passe mis à jour' });
  } catch (error) {
    console.error('Erreur password:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
