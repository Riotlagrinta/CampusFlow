import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from "@/../auth";
import { sendEmail } from '@/lib/mail';
import DOMPurify from 'isomorphic-dompurify';

const ALLOWED_TYPES = ['BUG', 'FEATURE', 'OTHER'];

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session || !session.user?.email) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const { type, content } = await req.json();
    if (!content || typeof content !== 'string') return NextResponse.json({ error: 'Contenu manquant' }, { status: 400 });
    if (content.length > 2000) return NextResponse.json({ error: 'Message trop long (max 2000 caractères)' }, { status: 400 });

    // MEDIUM FIX: utilisation de DOMPurify (isomorphic) au lieu d'un regex maison
    // qui ne couvrait pas les vecteurs XSS comme <svg onload=...>, onerror=, etc.
    const sanitizedContent = DOMPurify.sanitize(content, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });

    // Valider le type pour éviter les injections de données arbitraires
    const sanitizedType = ALLOWED_TYPES.includes(type) ? type : 'OTHER';

    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const report = await prisma.bugReport.create({
      data: { userId: user.id, type: sanitizedType, content: sanitizedContent }
    });

    const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL;
    if (adminEmail) {
      try {
        await sendEmail({
          to: adminEmail,
          subject: `⚠️ Nouveau Signalement [${sanitizedType}] - StudentHub`,
          html: `
            <div style="font-family: sans-serif; padding: 20px;">
              <h2>Nouveau rapport de ${user.firstName} ${user.lastName}</h2>
              <p><strong>Type :</strong> ${sanitizedType}</p>
              <p><strong>Message :</strong></p>
              <div style="background: #f3f4f6; padding: 15px; border-radius: 8px;">
                ${sanitizedContent}
              </div>
              <p style="font-size: 12px; color: #666; margin-top: 20px;">Utilisateur : ${user.email}</p>
            </div>
          `
        });
      } catch (e) {
        console.error('Échec notification admin support:', e);
      }
    }

    return NextResponse.json({ success: true, report });
  } catch (error) {
    return NextResponse.json({ error: 'Server Error' }, { status: 500 });
  }
}
