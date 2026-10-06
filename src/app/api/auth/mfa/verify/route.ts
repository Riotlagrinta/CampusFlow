import { NextResponse, after } from 'next/server';
import { z } from 'zod';
import { MfaConfigError, verifySecondFactor } from '@/lib/mfa/service';
import { notifyMfaEvent } from '@/lib/mfa/notify';
import { guardMfaRoute, limitMfaAttempts, respondWithProof } from '@/lib/mfa/routeGuard';

const bodySchema = z.object({ code: z.string().min(1).max(32) });

/**
 * Valide le second facteur après la connexion : code à 6 chiffres de l'authentificateur, ou code de
 * secours (usage unique). Succès : la preuve est posée dans un cookie lié à CETTE session.
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

    const result = await verifySecondFactor(ctx.user.id, parsed.data.code);
    if (!result.ok) {
      if (result.reason === 'not_enrolled') {
        return NextResponse.json(
          { error: "Le second facteur n'est pas encore activé sur ce compte.", code: 'not_enrolled' },
          { status: 409 }
        );
      }
      if (result.reason === 'unreadable') {
        console.error('MFA : secret illisible (clé de chiffrement changée ?) pour un compte administrateur');
        return NextResponse.json(
          { error: 'Le secret enregistré est illisible. Voir la procédure de secours du README.', code: 'unreadable' },
          { status: 500 }
        );
      }
      // Même réponse pour tout code faux.
      return NextResponse.json({ error: 'Code incorrect.', code: 'invalid_code' }, { status: 401 });
    }

    // Un code de secours ne devrait servir qu'en cas de perte du téléphone : alerte au titulaire.
    if (result.usedRecovery) {
      const accountEmail = ctx.user.email;
      const remaining = result.recoveryLeft;
      after(() => notifyMfaEvent(accountEmail, { kind: 'recovery-used', remaining }));
    }

    const response = await respondWithProof(
      { success: true, usedRecovery: result.usedRecovery, recoveryLeft: result.recoveryLeft },
      ctx,
      result.enabledAt
    );
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    if (error instanceof MfaConfigError) {
      return NextResponse.json({ error: 'Double authentification mal configurée.', code: 'mfa_misconfigured' }, { status: 500 });
    }
    console.error('Erreur MFA verify:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
