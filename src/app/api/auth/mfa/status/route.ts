import { NextResponse } from 'next/server';
import { effectiveMfaMode, hasValidMfaProof, resolveSession } from '@/lib/session';

/**
 * État du second facteur pour l'appelant connecté. Ne révèle rien aux non-administrateurs.
 * { mode, isAdmin, enrolled, verified, required, webOnly } :
 *  - required : l'administrateur doit encore passer par /mfa (activation ou saisie du code).
 */
export async function GET(req: Request) {
  const ctx = await resolveSession(req);
  if (!ctx) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const mode = effectiveMfaMode(ctx);
  const isAdmin = ctx.user.role === 'ADMIN';
  if (!isAdmin || mode === 'off') {
    return NextResponse.json({ mode: isAdmin ? mode : 'off', isAdmin, required: false });
  }

  const verified = mode === 'on' && (await hasValidMfaProof(ctx, req));
  return NextResponse.json({
    mode,
    isAdmin: true,
    enrolled: ctx.user.mfaEnabledAt !== null,
    verified,
    // Clé mal formée : refus total, la page /mfa l'explique ; sinon il manque la preuve de cette session.
    required: !verified,
    webOnly: ctx.source !== 'cookie',
  });
}
