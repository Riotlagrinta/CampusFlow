import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/session';

const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);

/**
 * Activation manuelle d'un compte : seul contournement lorsque l'OTP n'arrive pas.
 * Idempotent. Aucun bonus de parrainage ni badge ici : ils ne sont versés que par la
 * vérification OTP (verify-otp), qui prouve la possession de l'email ou du téléphone.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await getAuthUser(req);
    if (!admin) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    if (admin.role !== 'ADMIN') return NextResponse.json({ error: 'Accès interdit' }, { status: 403 });

    const parsedId = idSchema.safeParse((await params).id);
    if (!parsedId.success) return NextResponse.json({ error: 'Identifiant utilisateur invalide' }, { status: 400 });
    const userId = parsedId.data;

    const result = await prisma.user.updateMany({
      where: { id: userId },
      data: { isActive: true, otpCode: null, otpCodeExpires: null, otpAttempts: 0 },
    });
    if (result.count === 0) return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 });

    // Journal sans donnée personnelle
    console.info('[admin-activate]', JSON.stringify({ adminId: admin.id, userId }));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erreur activation manuelle:', error);
    return NextResponse.json({ error: 'Erreur lors de l\'activation' }, { status: 500 });
  }
}
