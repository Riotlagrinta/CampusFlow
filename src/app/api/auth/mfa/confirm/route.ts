import { NextResponse, after } from 'next/server';
import { z } from 'zod';
import { confirmEnrollment, MfaConfigError } from '@/lib/mfa/service';
import { notifyMfaEvent } from '@/lib/mfa/notify';
import { guardMfaRoute, limitMfaAttempts, respondWithProof } from '@/lib/mfa/routeGuard';

const bodySchema = z.object({ code: z.string().min(1).max(32) });

/**
 * Termine l'activation : le code à 6 chiffres prouve que l'authentificateur est bien configuré.
 * Renvoie les codes de secours EN CLAIR, une seule fois (seules leurs empreintes sont stockées) et
 * pose la preuve : l'administrateur est vérifié pour cette session.
 */
export async function POST(req: Request) {
  try {
    const guarded = await guardMfaRoute(req);
    if ('response' in guarded) return guarded.response;
    const { ctx } = guarded;

    const limited = await limitMfaAttempts(req, ctx.user.id);
    if (limited) return limited;

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Code requis' }, { status: 400 });

    const result = await confirmEnrollment(ctx.user.id, parsed.data.code);
    if (!result.ok) {
      if (result.reason === 'no_pending') {
        return NextResponse.json(
          { error: "Aucune activation en cours : recommencez depuis le début.", code: 'no_pending' },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: 'Code incorrect.', code: 'invalid_code' }, { status: 400 });
    }

    // Alerte au titulaire : l'activation se fait avec le seul mot de passe, il doit savoir qu'elle a eu lieu.
    const accountEmail = ctx.user.email;
    after(() => notifyMfaEvent(accountEmail, { kind: 'enrolled' }));

    const response = await respondWithProof({ success: true, recoveryCodes: result.recoveryCodes }, ctx, result.enabledAt);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    if (error instanceof MfaConfigError) {
      return NextResponse.json({ error: 'Double authentification mal configurée.', code: 'mfa_misconfigured' }, { status: 500 });
    }
    console.error('Erreur MFA confirm:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
