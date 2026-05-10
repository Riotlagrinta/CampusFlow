import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/mail';
import bcrypt from "bcryptjs"; // Importez bcryptjs

import { sendWhatsAppMessage } from '@/lib/whatsapp';

export async function POST(req: Request) {
  try {
    const { email, phone, firstName, lastName, password, fieldId, levelId, referralCode } = await req.json();

    if (!email || !phone || !firstName || !lastName || !password || !fieldId || !levelId) {
      return NextResponse.json({ error: 'Tous les champs sont requis' }, { status: 400 });
    }

    // Vérifier si l'utilisateur existe déjà
    const existingUser = await prisma.user.findFirst({
      where: { OR: [{ email }, { phone }] }
    });

    if (existingUser) {
      const fieldUsed = existingUser.email === email ? 'Cet email' : 'Ce numéro de téléphone';
      return NextResponse.json({ error: `${fieldUsed} est déjà utilisé` }, { status: 400 });
    }

    // ... (hachage et parrainage inchangés) ...
    const hashedPassword = await bcrypt.hash(password, 10);
    let referredById = null;
    let initialBonus = 0;

    if (referralCode) {
      const referrer = await prisma.user.findUnique({ where: { referralCode } });
      if (referrer) {
        referredById = referrer.id;
        initialBonus = 5;
        await prisma.user.update({
          where: { id: referrer.id },
          data: { aiBonusRequests: { increment: 5 } }
        });
      }
    }

    const [field, level] = await Promise.all([
      prisma.field.findUnique({ where: { id: fieldId } }),
      prisma.level.findUnique({ where: { id: levelId } })
    ]);

    // HIGH FIX: Math.random() est prédictible — on utilise crypto.randomInt()
    const { randomInt, randomBytes } = await import('crypto');
    const otpCode = randomInt(100000, 999999).toString();
    const otpCodeExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const newReferralCode = (firstName?.substring(0, 3) || 'DEFI').toUpperCase() + '-' + randomBytes(4).toString('hex').toUpperCase();

    const user = await prisma.user.create({
      data: {
        email,
        phone,
        firstName,
        lastName,
        password: hashedPassword,
        fieldId,
        academicLevelId: levelId,
        referredById,
        aiBonusRequests: initialBonus,
        referralCode: newReferralCode,
        isActive: false,
        otpCode,
        otpCodeExpires,
        xp: 0,
        level: 1,
        streak: 1
      }
    });

    // --- ENVOI DES CODES (WhatsApp + Email) ---
    
    // 1. WhatsApp (Priorité car plus direct au Togo)
    const whatsappMsg = `*DefiTech Student Hub* 🚀\n\nBonjour ${firstName} ! Voici votre code de validation : *${otpCode}*\n\nUtilisez-le pour activer votre compte. Bienvenue parmi nous !`;
    await sendWhatsAppMessage(phone, whatsappMsg);

    // 2. Email (Roue de secours)
    try {
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
          </div>
        `
      });
    } catch (e) {}

    // 2. Mail pour l'administrateur (Notification)
    try {
      await sendEmail({
        to: process.env.ADMIN_NOTIFICATION_EMAIL || '',
        subject: '🚀 Nouvelle pré-inscription sur le Hub',
        html: `
          <p><strong>${firstName} ${lastName}</strong> (${email}) s'est inscrit en <strong>${field?.name}</strong>.</p>
          <p>En attente de validation OTP.</p>
        `
      });
      console.log('✅ Notification admin envoyée.');
    } catch (adminMailError) {
      console.error('⚠️ ÉCHEC envoi notification admin:', adminMailError);
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
