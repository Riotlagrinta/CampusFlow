// Garde-fous communs aux scripts d'administration (scripts/*.ts et prisma/seed.ts).
// Ces scripts écrivent dans la base désignée par DATABASE_URL : on veut qu'ils ne puissent
// jamais partir "par accident", et qu'ils ne laissent aucune donnée personnelle dans la console.

export function isProductionEnvironment(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
}

export type ParsedArgs = {
  flags: Set<string>;
  positional: string[];
};

/** `--yes --autre valeur1 valeur2` -> flags {--yes, --autre}, positional [valeur1, valeur2]. */
export function parseArgs(argv: string[] = process.argv.slice(2)): ParsedArgs {
  const flags = new Set<string>();
  const positional: string[] = [];
  for (const arg of argv) {
    if (arg.startsWith('--')) flags.add(arg);
    else positional.push(arg);
  }
  return { flags, positional };
}

/** Hôte et nom de base visés, sans identifiants ni mot de passe. */
export function describeDatabaseTarget(): string {
  const raw = process.env.DATABASE_URL;
  if (!raw) return '(DATABASE_URL non défini)';
  try {
    const url = new URL(raw);
    return `${url.hostname}${url.pathname}`;
  } catch {
    return '(DATABASE_URL illisible)';
  }
}

/** a***@d***.com : permet de reconnaître une adresse sans l'afficher en clair. */
export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  const [host = '', ...tld] = domain.split('.');
  const hide = (value: string) => `${value.charAt(0)}***`;
  return `${hide(local)}@${hide(host)}${tld.length ? `.${tld.join('.')}` : ''}`;
}

/**
 * Refuse de continuer en production et sans `--yes`. Affiche la base ciblée pour que
 * l'opérateur vérifie qu'il ne vise pas la mauvaise (ex. la base Neon de production).
 * Termine le processus (code 1) en cas de refus : rien n'a été lu ni écrit à ce stade.
 */
export function assertSafeToRun(scriptName: string, args: ParsedArgs, description: string): void {
  if (isProductionEnvironment()) {
    console.error(`[${scriptName}] Refusé : ce script ne s'exécute pas avec NODE_ENV=production.`);
    process.exit(1);
  }

  console.log(`[${scriptName}] ${description}`);
  console.log(`[${scriptName}] Base ciblée : ${describeDatabaseTarget()}`);

  if (!args.flags.has('--yes')) {
    console.error(`[${scriptName}] Confirmation requise : relancez avec --yes pour exécuter.`);
    process.exit(1);
  }
}
