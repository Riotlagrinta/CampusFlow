import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/session';
import { escapeHtml, sendEmail } from '@/lib/mail';
import {
  BCRYPT_COST,
  checkLimits,
  clientIp,
  firstIssue,
  passwordSchema,
  rateKey,
  tooManyRequests,
  verifyPassword,
} from '@/lib/authHelpers';

const passwordChangeSchema = z.object({
  oldPassword: z.string({ error: 'Ancien mot de passe requis' }).min(1, 'Ancien mot de passe requis').max(200),
  newPassword: passwordSchema,
});

export async function PATCH(req: Request) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const parsed = passwordChangeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: firstIssue(parsed.error, 'Le nouveau mot de passe doit contenir au moins 8 caractères') }, { status: 400 });
    }
    const { oldPassword, newPassword } = parsed.data;

    // Une session volée ne doit pas permettre de deviner l'ancien mot de passe.
    const limit = await checkLimits([
      { key: rateKey('pwd:user', authUser.id), limit: 5, windowMs: 15 * 60 * 1000 },
      { key: rateKey('pwd:ip', clientIp(req)), limit: 20, windowMs: 15 * 60 * 1000 },
    ]);
    if (!limit.allowed) return tooManyRequests(limit.retryAfterMs);

    const user = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: { id: true, email: true, firstName: true, password: true },
    });
    if (!user) {
      return NextResponse.json({ error: 'Utilisateur non trouvé' }, { status: 404 });
    }

    if (!(await verifyPassword(oldPassword, user.password))) {
      return NextResponse.json({ error: 'L\'ancien mot de passe est incorrect' }, { status: 400 });
    }

    if (oldPassword === newPassword) {
      return NextResponse.json({ error: 'Le nouveau mot de passe doit être différent de l\'ancien' }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_COST);

    // Conditionné à l'ancien hash : deux changements simultanés ne s'écrasent pas.
    // `passwordChangedAt` révoque toutes les sessions ouvertes avant ce changement, y compris
    // celle de l'appelant (voir getAuthUser et `reauthenticate` ci-dessous).
    const updated = await prisma.user.updateMany({
      where: { id: user.id, password: user.password },
      data: { password: hashedPassword, passwordChangedAt: new Date() },
    });
    if (updated.count !== 1) {
      return NextResponse.json({ error: 'Le mot de passe vient d\'être modifié. Réessayez.' }, { status: 409 });
    }

    // Confirmation de sécurité : un échec d'envoi ne bloque pas la modification.
    await sendEmail({
      to: user.email,
      subject: '🔐 Votre mot de passe a été modifié - DefiTech Hub',
      html: `
        <div style="font-family: sans-serif; padding: 24px; max-width: 480px; margin: auto; color: #333;">
          <h2 style="color: #2563eb;">Changement de mot de passe</h2>
          <p>Bonjour <strong>${escapeHtml(user.firstName)}</strong>,</p>
          <p>Votre mot de passe a été modifié avec succès le <strong>${new Date().toLocaleString('fr-FR')}</strong>.</p>
          <div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 12px 16px; border-radius: 6px; margin: 20px 0;">
            <p style="margin: 0; font-size: 14px; color: #b91c1c;">⚠️ Si vous n'êtes pas à l'origine de cette modification, contactez immédiatement un administrateur.</p>
          </div>
          <p style="font-size: 12px; color: #9ca3af; margin-top: 24px;">DefiTech Student Hub</p>
        </div>
      `,
    });

    // La session courante est révoquée avec les autres : le client doit se reconnecter.
    return NextResponse.json({ success: true, reauthenticate: true, message: 'Mot de passe mis à jour. Reconnectez-vous.' });
  } catch (error) {
    console.error('Erreur password:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
