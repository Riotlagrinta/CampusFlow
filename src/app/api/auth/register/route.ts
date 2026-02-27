import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/mail';

export async function POST(req: Request) {
  try {
    const { email, firstName, lastName, password, fieldId, levelId, referralCode } = await req.json();

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

    // LOGIQUE DE PARRAINAGE
    let referredById = null;
    let initialBonus = 0;

    if (referralCode) {
        const referrer = await prisma.user.findUnique({
            where: { referralCode }
        });

        if (referrer) {
            referredById = referrer.id;
            initialBonus = 5; // On offre 5 jetons au nouvel utilisateur

            // On offre 5 jetons au parrain immédiatement
            await prisma.user.update({
                where: { id: referrer.id },
                data: { aiBonusRequests: { increment: 5 } }
            });
            console.log(`🎁 Parrainage: 5 jetons offerts à ${referrer.email}`);
        }
    }

    // Récupérer les infos de filière/niveau pour le mail
    const [field, level] = await Promise.all([
      prisma.field.findUnique({ where: { id: fieldId } }),
      prisma.level.findUnique({ where: { id: levelId } })
    ]);

    // Générer un code OTP à 6 chiffres
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

    // Générer un nouveau code de parrainage pour cet utilisateur
    const newReferralCode = (firstName?.substring(0, 3) || 'DEFI').toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();

    // Création de l'utilisateur (INACTIF)
    const user = await prisma.user.create({
      data: {
        email,
        firstName,
        lastName,
        password, 
        fieldId,
        academicLevelId: levelId,
        referredById,
        aiBonusRequests: initialBonus,
        referralCode: newReferralCode,
        isActive: false, 
        otpCode,
        xp: 0,
        level: 1,
        streak: 1
      }
    });

    // --- ENVOI DU CODE OTP À L'ÉTUDIANT ---
    try {
      // Mail pour l'étudiant (Code de validation)
      await sendEmail({
        to: email,
        subject: `${otpCode} est votre code de validation DefiTech Hub`,
        html: `
          <div style="font-family: sans-serif; padding: 20px; color: #333; text-align: center;">
            <h1 style="color: #2563eb;">Bienvenue chez DefiTech !</h1>
            <p>Voici votre code de validation pour activer votre compte :</p>
            <div style="font-size: 32px; font-weight: bold; letter-spacing: 5px; padding: 20px; background: #f3f4f6; border-radius: 10px; display: inline-block; margin: 20px 0;">
              ${otpCode}
            </div>
            <p style="font-size: 14px; color: #666;">Ce code expirera bientôt. Ne le partagez avec personne.</p>
          </div>
        `
      });

      // Mail pour l'administrateur (Notification simple)
      await sendEmail({
        to: 'djkeda82@gmail.com',
        subject: '🚀 Nouvelle pré-inscription sur le Hub',
        html: `
          <p><strong>${firstName} ${lastName}</strong> (${email}) s'est inscrit en <strong>${field?.name}</strong>.</p>
          <p>En attente de validation OTP.</p>
        `
      });
    } catch (mailError) {
      console.error('Erreur envoi mail OTP:', mailError);
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
