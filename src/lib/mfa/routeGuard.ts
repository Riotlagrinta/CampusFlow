import { NextResponse } from 'next/server';
import { checkLimits, clientIp, rateKey, tooManyRequests } from '@/lib/authHelpers';
import { resolveSession, type SessionContext } from '@/lib/session';
import { mfaCookieSettings, mfaMode, signMfaProof } from '@/lib/mfa/proof';

// Garde commune des routes /api/auth/mfa/* (hors « status »).

export type MfaGuarded = { ctx: SessionContext } | { response: NextResponse };

/**
 * Exige : fonction active, session WEB valide, compte ADMIN. Le second facteur ne concerne que les
 * administrateurs et que le web : un Bearer mobile n'a pas de cookie où poser la preuve.
 */
export async function guardMfaRoute(req: Request): Promise<MfaGuarded> {
  if (mfaMode() !== 'on') {
    return {
      response: NextResponse.json(
        { error: "La double authentification n'est pas activée sur ce serveur.", code: 'mfa_disabled' },
        { status: 404 }
      ),
    };
  }
  const ctx = await resolveSession(req);
  if (!ctx) return { response: NextResponse.json({ error: 'Non authentifié' }, { status: 401 }) };
  if (ctx.source !== 'cookie') {
    return {
      response: NextResponse.json(
        { error: "La double authentification se fait depuis le site web.", code: 'mfa_web_only' },
        { status: 400 }
      ),
    };
  }
  if (ctx.user.role !== 'ADMIN') {
    return { response: NextResponse.json({ error: 'Accès interdit' }, { status: 403 }) };
  }
  if (typeof ctx.authTime !== 'number') {
    // Session antérieure à ce champ : la preuve ne pourrait pas lui être liée.
    return {
      response: NextResponse.json({ error: 'Session trop ancienne : reconnectez-vous.', code: 'relogin' }, { status: 401 }),
    };
  }
  return { ctx };
}

/**
 * Limite les tentatives de code : 5 par 15 min et 10 par jour et par compte (un code à 6 chiffres
 * accepté sur 3 pas : 10 essais par jour laissent environ une chance sur 33 000), plus un plafond
 * par adresse IP. Les essais réussis comptent aussi. Contrepartie assumée : quelqu'un qui connaît le
 * mot de passe peut épuiser ces essais et verrouiller l'administrateur jusqu'à 24 h ; la remise à zéro
 * en SQL (README) lève ce verrou.
 */
export async function limitMfaAttempts(req: Request, userId: string): Promise<NextResponse | null> {
  const limit = await checkLimits([
    { key: rateKey('mfa:user', userId), limit: 5, windowMs: 15 * 60 * 1000 },
    { key: rateKey('mfa:day', userId), limit: 10, windowMs: 24 * 60 * 60 * 1000 },
    { key: rateKey('mfa:ip', clientIp(req)), limit: 40, windowMs: 15 * 60 * 1000 },
  ]);
  return limit.allowed ? null : tooManyRequests(limit.retryAfterMs, 'Trop de tentatives. Réessayez plus tard.');
}

/** Réponse de succès qui pose le cookie de preuve, lié à la session et à l'activation en cours. */
export async function respondWithProof(
  body: Record<string, unknown>,
  ctx: SessionContext,
  enabledAt: Date
): Promise<NextResponse> {
  const secret = process.env.AUTH_SECRET;
  if (!secret || typeof ctx.authTime !== 'number') {
    return NextResponse.json({ error: 'Service d\'authentification indisponible.' }, { status: 500 });
  }
  const token = await signMfaProof(
    { sub: ctx.user.id, at: ctx.authTime, ea: enabledAt.getTime() },
    new TextEncoder().encode(secret)
  );
  const { name, options } = mfaCookieSettings(process.env.NODE_ENV === 'production');
  const response = NextResponse.json(body);
  response.cookies.set(name, token, options);
  return response;
}
