import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { verifyPassword } from '@/lib/authHelpers';
import { beginEnrollment, MfaConfigError } from '@/lib/mfa/service';
import { guardMfaRoute, limitMfaAttempts } from '@/lib/mfa/routeGuard';

const bodySchema = z.object({ password: z.string().min(1).max(200) });

/**
 * Démarre l'activation du second facteur d'un ADMIN. Le mot de passe est redemandé : un cookie de
 * session volé ne suffit pas à enregistrer l'authentificateur de l'attaquant. Renvoie le secret à
 * saisir dans l'application (une seule fois) ; le second facteur n'est actif qu'après /confirm.
 */
export async function POST(req: Request) {
  try {
    const guarded = await guardMfaRoute(req);
    if ('response' in guarded) return guarded.response;
    const { ctx } = guarded;

    if (ctx.user.mfaEnabledAt) {
      return NextResponse.json(
        { error: 'Le second facteur est déjà activé sur ce compte.', code: 'already_enrolled' },
        { status: 409 }
      );
    }

    const limited = await limitMfaAttempts(req, ctx.user.id);
    if (limited) return limited;

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Mot de passe requis' }, { status: 400 });

    const row = await prisma.user.findUnique({ where: { id: ctx.user.id }, select: { password: true } });
    if (!(await verifyPassword(parsed.data.password, row?.password))) {
      return NextResponse.json({ error: 'Mot de passe incorrect' }, { status: 401 });
    }

    const started = await beginEnrollment(ctx.user.id, ctx.user.email);
    if (started === 'already_enrolled') {
      return NextResponse.json(
        { error: 'Le second facteur est déjà activé sur ce compte.', code: 'already_enrolled' },
        { status: 409 }
      );
    }

    const response = NextResponse.json({ secret: started.secretDisplay, otpauthUrl: started.otpauthUrl });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    if (error instanceof MfaConfigError) {
      console.error('MFA : MFA_ENCRYPTION_KEY absente ou invalide');
      return NextResponse.json({ error: 'Double authentification mal configurée.', code: 'mfa_misconfigured' }, { status: 500 });
    }
    console.error('Erreur MFA setup:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
