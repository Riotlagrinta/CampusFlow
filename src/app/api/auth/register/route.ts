import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Resend } from 'resend';

export async function POST(req: Request) {
  try {
    const { email, firstName, lastName, password, fieldId, levelId } = await req.json();

    if (!email || !firstName || !lastName || !password || !fieldId || !levelId) {
      return NextResponse.json({ error: 'Tous les champs sont requis' }, { status: 400 });
    }

    // Vérifier si l'utilisateur existe déjà
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return NextResponse.json({ error: 'Cet email est déjà utilisé' }, { status: 400 });
    }

    // Récupérer les infos de filière/niveau pour le mail
    const [field, level] = await Promise.all([
      prisma.field.findUnique({ where: { id: fieldId } }),
      prisma.level.findUnique({ where: { id: levelId } })
    ]);

    // Création de l'utilisateur
    const user = await prisma.user.create({
      data: {
        email,
        firstName,
        lastName,
        password, 
        fieldId,
        academicLevelId: levelId,
        xp: 0,
        level: 1,
        streak: 1
      }
    });

    // --- ENVOI DE LA NOTIFICATION MAIL ---
    if (process.env.RESEND_API_KEY) {
      try {
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from: 'StudentHub <onboarding@resend.dev>',
          to: 'djkeda82@gmail.com',
          subject: '🚀 Nouvel étudiant sur le Hub !',
          html: `
            <div style="font-family: sans-serif; padding: 20px; color: #333;">
              <h2 style="color: #2563eb;">Une nouvelle inscription !</h2>
              <p>Un nouvel étudiant vient de rejoindre la plateforme :</p>
              <ul style="list-style: none; padding: 0;">
                <li><strong>Nom :</strong> ${firstName} ${lastName}</li>
                <li><strong>Email :</strong> ${email}</li>
                <li><strong>Filière :</strong> ${field?.name || 'N/A'}</li>
                <li><strong>Niveau :</strong> ${level?.name || 'N/A'}</li>
              </ul>
              <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
              <p style="font-size: 12px; color: #666;">Ce message vous est envoyé automatiquement depuis la console d'administration.</p>
            </div>
          `
        });
      } catch (mailError) {
        console.error('Erreur envoi mail notification:', mailError);
      }
    }

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
