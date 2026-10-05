// Validation d'une adresse de redirection fournie par l'URL (?callbackUrl=...) : uniquement un
// chemin interne du même site. Fonction pure, utilisable côté navigateur comme côté serveur.

const MAX_LENGTH = 2048;
const MAX_DECODE_ROUNDS = 3;

// Caractères refusés : contrôle (dont tabulation et retours à la ligne, que les navigateurs
// SUPPRIMENT dans une URL : « /<TAB>/hote » deviendrait « //hote »), délimiteurs de ligne Unicode,
// et barre oblique inverse (les navigateurs la traitent comme « / » : « /\hote » deviendrait « //hote »).
function hasUnsafeChar(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f) || code === 0x2028 || code === 0x2029 || code === 0x5c) {
      return true;
    }
  }
  return false;
}

// Vrai si le texte, tel quel ou après décodage pourcentage (jusqu'à 3 fois, pour les valeurs
// encodées plusieurs fois : « /%252e//evil.com » -> « /%2e//evil.com » -> « /.//evil.com »), contient un
// caractère dangereux, commence par « // » ou se résout (segments « . » / « .. » supprimés) vers un
// chemin commençant par « // » ou vers un autre site. Un « %252e » littéral n'est pas un point pour un
// navigateur (la cible resterait sur le site) : le refuser est volontairement prudent, aucun chemin
// légitime de l'application ne contient de tels motifs.
function hasUnsafeForm(text: string, base: URL): boolean {
  let current = text;
  for (let round = 0; round <= MAX_DECODE_ROUNDS; round++) {
    if (hasUnsafeChar(current) || current.startsWith('//')) return true;
    if (resolvesOffSite(current, base)) return true;
    let decoded: string;
    try {
      decoded = decodeURIComponent(current);
    } catch {
      return false; // séquence « % » invalide : rien de plus à décoder
    }
    if (decoded === current) return false;
    current = decoded;
  }
  return false;
}

// Résolue contre `base`, l'adresse sort-elle du site ou donne-t-elle un chemin « //... » ?
function resolvesOffSite(text: string, base: URL): boolean {
  try {
    const url = new URL(text, base);
    return url.origin !== base.origin || url.pathname.startsWith('//');
  } catch {
    return true;
  }
}

/**
 * Chemin sûr vers lequel rediriger, ou `fallback`.
 *
 * Refus (repli sur `fallback`) :
 *  - valeur absente, trop longue, ne commençant pas par « / » ;
 *  - caractère de contrôle, tabulation, retour à la ligne ou « \ » dans la valeur brute (même
 *    encodé en %09, %0a, %5c...) ;
 *  - valeur brute ou décodée commençant par « // » (adresse « sans protocole » vers un autre site) ;
 *  - origine résolue différente de `origin` (« https://evil.com », « javascript:... ») ;
 *  - chemin RÉSOLU commençant par « // » ou contenant « \ » : « /.//evil.com », « /..//evil.com »
 *    et « /%2e//evil.com » passent les contrôles sur le texte brut, mais l'analyse d'URL supprime
 *    les segments « . » / « .. » et donne « //evil.com », que le navigateur suivrait vers un
 *    autre site.
 *
 * Seuls `pathname + search + hash` du résultat résolu sont renvoyés (jamais la valeur brute).
 */
export function safeRedirectPath(
  raw: string | null | undefined,
  origin: string,
  fallback = '/'
): string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_LENGTH) return fallback;

  // Contrôles sur la valeur BRUTE, avant tout nettoyage (un espace de bord est ignoré, pas un contrôle).
  if (hasUnsafeChar(raw)) return fallback;
  const target = raw.trim();
  if (!target.startsWith('/')) return fallback;

  let base: URL;
  let resolved: URL;
  try {
    base = new URL(origin);
    resolved = new URL(target, base);
  } catch {
    return fallback;
  }

  if (base.origin === 'null' || resolved.origin !== base.origin) return fallback;
  if (resolved.username || resolved.password) return fallback;
  if (hasUnsafeForm(target, base)) return fallback;
  if (!resolved.pathname.startsWith('/') || hasUnsafeForm(resolved.pathname, base)) return fallback;

  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
}
