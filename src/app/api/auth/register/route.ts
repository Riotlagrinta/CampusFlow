import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(req: Request) {
  try {
    const { email, firstName, lastName, password } = await req.json();

    if (!email || !firstName || !lastName || !password) {
      return NextResponse.json({ error: 'Tous les champs sont requis' }, { status: 400 });
    }

    // Vérifier si l'utilisateur existe déjà
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return NextResponse.json({ error: 'Cet email est déjà utilisé' }, { status: 400 });
    }

    // Création de l'utilisateur
    const user = await prisma.user.create({
      data: {
        email,
        firstName,
        lastName,
        password, // Idéalement hacher le mot de passe ici (ex: bcrypt)
        xp: 0,
        level: 1,
        streak: 1
      }
    });

    // On donne le badge "Premiers Pas" automatiquement
    const firstStepBadge = await prisma.badge.findUnique({ where: { slug: 'first-step' } });
    if (firstStepBadge) {
      await prisma.userBadge.create({
        data: {
          userId: user.id,
          badgeId: firstStepBadge.id
        }
      });
    }

    return NextResponse.json({ 
      success: true, 
      user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName } 
    });
  } catch (error) {
    console.error('Erreur inscription:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
