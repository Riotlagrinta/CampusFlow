/** Valeur d'un paramètre de route (expo-router renvoie string | string[]). */
export function paramToString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&#x27;': "'",
  '&apos;': "'",
};

/**
 * Texte du forum prêt à afficher. Le serveur stocke du texte brut/Markdown (les balises
 * éventuelles, ex. List<String>, sont du contenu : on n'en retire aucune). Les anciennes
 * questions, enregistrées avant ce changement, peuvent contenir des entités HTML : on les décode.
 */
export function plainText(input: string | null | undefined): string {
  if (!input) return '';
  return input
    .replace(/&(?:amp|lt|gt|quot|apos|#39|#x27);/g, (entity) => ENTITIES[entity] ?? entity)
    .trim();
}

interface NameParts {
  firstName?: string | null;
  lastName?: string | null;
}

/** « Prénom Nom » ou le texte de repli. */
export function fullName(person: NameParts | null | undefined, fallback = 'Étudiant'): string {
  const name = [person?.firstName, person?.lastName].filter(Boolean).join(' ').trim();
  return name || fallback;
}

export function initials(person: NameParts | null | undefined): string {
  const first = person?.firstName?.trim().charAt(0) ?? '';
  const last = person?.lastName?.trim().charAt(0) ?? '';
  return (first + last).toUpperCase() || '?';
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/** Taille UTF-8 en octets (le serveur limite le mot de passe à 72 octets, limite de bcrypt). */
export function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_BYTES = 72;

/** Même règle que le serveur (8 caractères minimum, 72 octets maximum). */
export function validatePassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`;
  }
  if (utf8ByteLength(password) > MAX_PASSWORD_BYTES) {
    return 'Le mot de passe est trop long (72 octets maximum).';
  }
  return null;
}

/** Les listes API sont des tableaux ; tolère aussi { items } / { data } (pagination). */
export function toList<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === 'object') {
    const body = payload as { items?: unknown; data?: unknown };
    if (Array.isArray(body.items)) return body.items as T[];
    if (Array.isArray(body.data)) return body.data as T[];
  }
  return [];
}
