import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { isAdminPage, isApiPath, isPublicPage, shouldRedirectPaymentsPage } from "@/lib/routeAccess";
import { isPaymentsEnabled } from "@/lib/payments";

/**
 * Proxy Next.js 16 (ex-middleware, runtime Node.js) : première barrière pour les PAGES.
 *
 * - Les pages protégées exigent un cookie de session NextAuth valide, sinon redirection vers /login
 *   (avec `callbackUrl` = chemin ET paramètres d'origine, pour y revenir après connexion).
 * - /admin exige en plus role === "ADMIN" (rôle du JWT ; le contrôle faisant foi reste
 *   `requireAdmin` côté API, qui relit le rôle en base).
 * - /api/* n'est jamais traité ici : chaque route authentifie elle-même via `getAuthUser`
 *   (cookie NextAuth OU Bearer mobile). Le proxy ne lit ni n'écrit aucun en-tête d'identité.
 * - Les contrôles portent sur le chemin NORMALISÉ (décodé, minuscules, sans slash doublé ni « .. »,
 *   voir src/lib/routeAccess.ts) : `/%61dmin`, `//admin` ou `/Admin` ne contournent pas le garde.
 *   La liste des pages publiques est partagée avec SubscriptionGuard.tsx.
 * - Tant que les paiements sont désactivés (src/lib/payments.ts, défaut), /shop/** et /subscribe
 *   redirigent vers « / » avant toute autre règle.
 *
 * On n'importe volontairement pas `auth.ts` (Prisma + bcrypt) : seul le déchiffrement du
 * cookie JWT est nécessaire ici.
 */

// Auth.js préfixe le nom du cookie par "__Secure-" en HTTPS : on essaie les deux noms.
async function getSessionToken(req: NextRequest) {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) return null;

  const httpsFirst = req.nextUrl.protocol === "https:";
  for (const secureCookie of [httpsFirst, !httpsFirst]) {
    const token = await getToken({ req, secret, secureCookie });
    if (token) return token;
  }
  return null;
}

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // Garde-fou : le matcher exclut déjà /api, mais le Bearer mobile ne doit jamais être touché.
  if (isApiPath(pathname)) return NextResponse.next();

  // Paiements désactivés : /shop (et sous-chemins) et /subscribe ne montrent rien, quelle que soit
  // la session. Contrôle placé AVANT les règles publiques/protégées (/shop/success et /subscribe
  // sont publiques). Redirection temporaire (307) : l'interrupteur est réversible.
  if (shouldRedirectPaymentsPage(pathname, isPaymentsEnabled())) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (isPublicPage(pathname)) return NextResponse.next();

  const token = await getSessionToken(req);
  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    // Un seul « / » en tête (le chemin brut peut en contenir plusieurs) ; la page de connexion
    // revalide de toute façon callbackUrl.
    url.searchParams.set("callbackUrl", `/${pathname.replace(/^[/\\]+/, "")}${search}`);
    return NextResponse.redirect(url);
  }

  if (isAdminPage(pathname) && token.role !== "ADMIN") {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

// Exclus : /api, assets Next, et tout chemin contenant un point (sw.js, workbox-*.js,
// manifest.json, logo.svg, favicon.ico, icons/*, uploads/*.pdf...).
export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|.*\\..*).*)"],
};
