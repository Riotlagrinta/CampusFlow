import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from "@/../auth";
import { sendEmail } from '@/lib/mail';

function sanitizeHtml(text: string): string {
  // Supprime les balises script
  return text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  // Pour une désinfection plus robuste, une bibliothèque dédiée serait préférable (ex: DOMPurify ou xss)
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session || !session.user?.email) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const { type, content } = await req.json();
    if (!content) return NextResponse.json({ error: 'Contenu manquant' }, { status: 400 });

    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const sanitizedContent = sanitizeHtml(content);

    const report = await prisma.bugReport.create({
      data: {
        userId: user.id,
        type: type || 'BUG',
        content: sanitizedContent
      }
    });

    // Envoi d'une notification email à l'admin
    console.log(`ℹ️ Signalement [${type}] reçu. Tentative de notification admin...`);
    try {
      await sendEmail({
        to: process.env.ADMIN_NOTIFICATION_EMAIL || 'djkeda82@gmail.com',
        subject: `⚠️ Nouveau Signalement [${type}] - StudentHub`,
        html: `
                <div style="font-family: sans-serif; padding: 20px;">
                    <h2>Nouveau rapport de ${user.firstName} ${user.lastName}</h2>
                    <p><strong>Type :</strong> ${type}</p>
                    <p><strong>Message :</strong></p>
                    <div style="background: #f3f4f6; padding: 15px; border-radius: 8px;">
                        ${sanitizedContent}
                    </div>
                    <p style="font-size: 12px; color: #666; margin-top: 20px;">Utilisateur : ${user.email}</p>
                </div>
            `
      });
      console.log('✅ Notification admin envoyée pour le signalement.');
    } catch (e: any) {
      console.error('⚠️ ÉCHEC notification admin support:', e.message);
    }

    return NextResponse.json({ success: true, report });
  } catch (error) {
    return NextResponse.json({ error: 'Server Error' }, { status: 500 });
  }
}
