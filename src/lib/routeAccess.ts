// Règles d'accès aux PAGES, partagées par src/proxy.ts (serveur) et SubscriptionGuard.tsx
// (navigateur) : une seule liste, donc jamais de divergence entre les deux.
// Aucune dépendance serveur ici (ni Prisma ni next/server) : importable depuis un composant client.

// Pages accessibles sans session. Chaque entrée couvre aussi ses sous-chemins.
// /shop/success est publique : le navigateur intégré d'une app mobile revient du paiement sans
// cookie, donc aucune redirection ici ; la page affiche elle-même l'état « connexion requise ».
// Le paramètre `tx` ne survit à la connexion que par le `callbackUrl` du lien « Se connecter »
// de la page.
export const PUBLIC_PAGES = ["/", "/login", "/register", "/legal", "/about", "/subscribe", "/shop/success"];

// Décode les séquences %XX qui correspondent à un caractère ASCII (les seuls qui comptent pour
// reconnaître nos chemins), sans jamais lever d'erreur sur un encodage invalide. Répété pour
// couvrir le double encodage (%2561dmin -> %61dmin -> admin).
function decodeAscii(value: string): string {
  let current = value;
  for (let i = 0; i < 4; i++) {
    const next = current.replace(/%([0-9a-f]{2})/gi, (match, hex: string) => {
      const code = parseInt(hex, 16);
      return code < 0x80 ? String.fromCharCode(code) : match;
    });
    if (next === current) break;
    current = next;
  }
  return current;
}

/**
 * Forme canonique d'un chemin pour les contrôles d'accès : décodé, en minuscules, sans
 * caractère de contrôle, avec « \ » traité comme « / », sans slash doublé ni final et avec les
 * segments « . » et « .. » résolus. `/%61dmin`, `//admin`, `/Admin/` et `/x/../admin` donnent
 * tous `/admin`. À n'utiliser que pour décider de l'accès, jamais pour construire une URL.
 */
export function normalizePath(pathname: string): string {
  const cleaned = decodeAscii(pathname)
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\\/g, "/")
    .toLowerCase();

  const segments: string[] = [];
  for (const segment of cleaned.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") segments.pop();
    else segments.push(segment);
  }
  return `/${segments.join("/")}`;
}

export function isPublicPage(pathname: string): boolean {
  const path = normalizePath(pathname);
  return PUBLIC_PAGES.some((route) =>
    route === "/" ? path === "/" : path === route || path.startsWith(`${route}/`)
  );
}

export function isAdminPage(pathname: string): boolean {
  const path = normalizePath(pathname);
  return path === "/admin" || path.startsWith("/admin/");
}

export function isApiPath(pathname: string): boolean {
  const path = normalizePath(pathname);
  return path === "/api" || path.startsWith("/api/");
}

// Pages de paiement : la boutique (/shop et tous ses sous-chemins, dont /shop/checkout et
// /shop/success) et les abonnements (/subscribe). Fermées quand l'interrupteur des paiements
// (src/lib/payments.ts) est désactivé.
const PAYMENTS_PAGES = ["/shop", "/subscribe"];

export function isPaymentsPage(pathname: string): boolean {
  const path = normalizePath(pathname);
  return PAYMENTS_PAGES.some((route) => path === route || path.startsWith(`${route}/`));
}

/**
 * Vrai si la requête de page doit être redirigée vers « / » parce que les paiements sont
 * désactivés. Décision pure, évaluée AVANT les règles de pages publiques/protégées : même
 * /shop/success (publique) et /subscribe (publique) sont fermées, sans session comme avec.
 */
export function shouldRedirectPaymentsPage(pathname: string, paymentsEnabled: boolean): boolean {
  return !paymentsEnabled && isPaymentsPage(pathname);
}
