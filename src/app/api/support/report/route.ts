import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/session';
import { checkRateLimitDb, getRateLimitKey } from '@/lib/rateLimit';
import { escapeHtml } from '@/lib/contentListing';
import { sendEmail } from '@/lib/mail';
import DOMPurify from 'isomorphic-dompurify';

const ALLOWED_TYPES = ['BUG', 'FEATURE', 'OTHER'] as const;

const HOUR_MS = 60 * 60 * 1000;
const MAX_REPORTS_PER_USER_PER_HOUR = 5;
const MAX_REPORTS_PER_IP_PER_HOUR = 15;

const reportSchema = z.object({
  type: z.string().optional(),
  content: z
    .string({ error: 'Contenu manquant' })
    .trim()
    .min(1, 'Contenu manquant')
    .max(2000, 'Message trop long (max 2000 caractères)'),
});

export async function POST(req: Request) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    // Limites persistantes par utilisateur ET par adresse IP : le formulaire écrit en base et envoie un e-mail
    const [byUser, byIp] = await Promise.all([
      checkRateLimitDb(`support-report:user:${authUser.id}`, MAX_REPORTS_PER_USER_PER_HOUR, HOUR_MS),
      checkRateLimitDb(`support-report:ip:${getRateLimitKey(req)}`, MAX_REPORTS_PER_IP_PER_HOUR, HOUR_MS),
    ]);
    if (!byUser.allowed || !byIp.allowed) {
      const retryAfterMs = Math.max(byUser.retryAfterMs, byIp.retryAfterMs);
      return NextResponse.json(
        { error: 'Trop de signalements envoyés. Réessayez plus tard.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } }
      );
    }

    const body = await req.json().catch(() => null);
    const parsed = reportSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Données invalides' }, { status: 400 });
    }
    const { type, content } = parsed.data;

    // DOMPurify (isomorphic) plutôt qu'un regex maison : couvre <svg onload=...>, onerror=, etc.
    const sanitizedContent = DOMPurify.sanitize(content, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }).trim();
    if (!sanitizedContent) return NextResponse.json({ error: 'Contenu manquant' }, { status: 400 });

    // Valider le type pour éviter les injections de données arbitraires
    const sanitizedType = (ALLOWED_TYPES as readonly string[]).includes(type ?? '') ? (type as string) : 'OTHER';

    const user = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: { id: true, email: true, firstName: true, lastName: true },
    });
    if (!user) return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 });

    const report = await prisma.bugReport.create({
      data: { userId: user.id, type: sanitizedType, content: sanitizedContent },
      select: { id: true },
    });

    const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL;
    if (adminEmail) {
      try {
        // Le contenu est déjà débarrassé de tout balisage ; le nom et l'e-mail viennent de l'utilisateur : on les échappe.
        const fullName = escapeHtml(`${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || 'un utilisateur');
        await sendEmail({
          to: adminEmail,
          subject: `⚠️ Nouveau Signalement [${sanitizedType}] - StudentHub`,
          html: `
            <div style="font-family: sans-serif; padding: 20px;">
              <h2>Nouveau rapport de ${fullName}</h2>
              <p><strong>Type :</strong> ${sanitizedType}</p>
              <p><strong>Message :</strong></p>
              <div style="background: #f3f4f6; padding: 15px; border-radius: 8px;">
                ${sanitizedContent}
              </div>
              <p style="font-size: 12px; color: #666; margin-top: 20px;">Utilisateur : ${escapeHtml(user.email)}</p>
            </div>
          `
        });
      } catch (e) {
        console.error('Échec notification admin support:', e);
      }
    }

    return NextResponse.json({ success: true, id: report.id });
  } catch (error) {
    console.error('Erreur support/report:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
