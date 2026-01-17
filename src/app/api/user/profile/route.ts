import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from "@/../auth";

export async function PATCH(req: Request) {
  try {
    const { put } = require('@vercel/blob');
    const session = await auth();
    if (!session || !session.user?.email) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const formData = await req.formData();
    const firstName = formData.get('firstName') as string;
    const lastName = formData.get('lastName') as string;
    const bio = formData.get('bio') as string;
    const file = formData.get('image') as File | null;

    let imageUrl = undefined;

    // Si une nouvelle image est fournie, on l'uploade sur Vercel Blob
    if (file && file.size > 0) {
      const blob = await put(`avatars/${session.user.id}-${Date.now()}`, file, {
        access: 'public',
      });
      imageUrl = blob.url;
    }

    const updatedUser = await prisma.user.update({
      where: { email: session.user.email },
      data: {
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        bio: bio !== null ? bio : undefined,
        image: imageUrl || undefined
      }
    });

    return NextResponse.json({ success: true, user: updatedUser });
  } catch (error) {
    console.error('Erreur mise à jour profil:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
