import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from "@/../auth";

export async function PATCH(req: Request) {
  try {
    const session = await auth();
    if (!session || !session.user?.email) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const contentType = req.headers.get('content-type') || '';
    let updateData: any = {};

    if (contentType.includes('application/json')) {
      const body = await req.json();
      updateData = {
        firstName: body.firstName || undefined,
        lastName: body.lastName || undefined,
        bio: body.bio !== undefined ? body.bio : undefined,
        pushToken: body.pushToken || undefined
      };
    } else {
      const { put } = require('@vercel/blob');
      const formData = await req.formData();
      const firstName = formData.get('firstName') as string;
      const lastName = formData.get('lastName') as string;
      const bio = formData.get('bio') as string;
      const pushToken = formData.get('pushToken') as string;
      const file = formData.get('image') as File | null;

      updateData = {
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        bio: bio !== null ? bio : undefined,
        pushToken: pushToken || undefined
      };

      if (file && file.size > 0) {
        const blob = await put(`avatars/${session.user.id}-${Date.now()}`, file, {
          access: 'public',
        });
        updateData.image = blob.url;
      }
    }

    const updatedUser = await prisma.user.update({
      where: { email: session.user.email },
      data: updateData
    });

    return NextResponse.json({ success: true, user: updatedUser });
  } catch (error) {
    console.error('Erreur mise à jour profil:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
