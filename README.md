# DefiTech Student Hub (StudentHub)

Plateforme éducative de l'école **DEFITECH** : ressources de cours par filière et niveau, forum d'entraide, quiz et classement (XP), assistant IA (chat, flashcards, génération de quiz), planning, devoirs, et (désactivés par défaut, voir [Interrupteur des paiements](#interrupteur-des-paiements)) boutique de jetons IA et abonnements (Genius Pay ou paiement manuel Mobile Money). Une application mobile Expo (dossier `mobile/`) consomme la même API.

## Pile technique

| Domaine | Technologie |
|---|---|
| Web | Next.js 16 (App Router, build `--webpack`), React 19, Tailwind CSS 4, framer-motion, Three.js |
| Authentification | NextAuth v5 (cookie de session JWT chiffré) pour le web, JWT Bearer signé avec `jose` pour le mobile |
| Base de données | PostgreSQL (Neon) via Prisma 6 |
| IA | Groq (rotation de modèles), Tavily (recherche web), Google Drive API (lecture de PDF publics) |
| Paiement | Genius Pay (callback signé) et demandes manuelles validées par un administrateur |
| Fichiers | Vercel Blob |
| Messagerie | Gmail (nodemailer) pour les codes de vérification (OTP) et les alertes ; UltraMsg (WhatsApp) optionnel, désactivé par défaut |
| Mobile | Expo SDK 54, expo-router, NativeWind |
| Qualité | TypeScript strict, ESLint, Vitest, GitHub Actions |

## Prérequis

- Node.js 22 LTS recommandé (Next.js 16 exige au minimum Node 20.9) et npm.
- Une base PostgreSQL : un projet [Neon](https://neon.tech) (gratuit) ou un PostgreSQL local.
- **Un compte Gmail avec mot de passe d'application** : indispensable, car c'est le seul canal d'envoi des codes de vérification (voir [Envoi des codes de vérification](#envoi-des-codes-de-vérification)).
- Facultatif selon les fonctionnalités testées : comptes Groq, Tavily, Genius Pay, Vercel Blob et UltraMsg (WhatsApp, désactivé par défaut).

## Installation

```bash
git clone <url-du-depot> studenthub
cd studenthub
npm install            # lance aussi `prisma generate` (postinstall) ; ne touche à aucune base
cp .env.example .env.local
```

1. Renseigner `.env.local` (voir [Variables d'environnement](#variables-denvironnement)). Au minimum `DATABASE_URL` et `AUTH_SECRET` (`openssl rand -base64 32`).
2. **Prisma ne lit que `.env`, pas `.env.local`** : pour les commandes `prisma ...` et `npm run db:*`, mettre aussi `DATABASE_URL` dans un fichier `.env` (ignoré par git), ou l'exporter dans le terminal.
3. Créer le schéma de la base (voir [Base de données et migrations](#base-de-données-et-migrations)).
4. Facultatif, développement uniquement : `npm run db:seed` (badges, quiz et comptes de démonstration si les variables `SEED_*` sont définies).
5. `npm run dev` puis ouvrir <http://localhost:3000>.

Les filières et niveaux (Génie Logiciel, Licence 1 à 3, etc.) s'initialisent avec `npx tsx scripts/setup-defitech-data.ts` (idempotent).

## Variables d'environnement

`.env.example` est la référence complète (criticité et rôle de chaque variable). Ne jamais committer de vraies valeurs : `.env*` est ignoré par git, sauf `.env.example`.

| Variable | Criticité | Rôle |
|---|---|---|
| `DATABASE_URL` | critique | URL PostgreSQL (Neon : URL « pooled » en production) |
| `AUTH_SECRET` | critique | Signature des sessions NextAuth et des JWT mobiles, sans valeur de repli |
| `NEXT_PUBLIC_APP_URL` | critique | Domaine canonique : CORS de `/api/*` (nécessaire même paiements désactivés), URL de retour de paiement (503 sans elle), liens |
| `NEXT_PUBLIC_PAYMENTS_ENABLED` | importante | **Interrupteur des paiements, désactivé par défaut** : ouvert seulement si la valeur est exactement `true` (voir [ci-dessous](#interrupteur-des-paiements)) |
| `NEXTAUTH_URL` | optionnelle | Ancien nom de l'URL du site, plus lue par le code (conservée par compatibilité) |
| `GROQ_API_KEY` | importante | Assistant IA, flashcards, quiz, explications |
| `AI_MODELS` | optionnelle | Modèles Groq essayés dans l'ordre (liste par défaut dans `src/lib/ai.ts`) |
| `NEXT_PUBLIC_CURRENT_SEMESTER` | optionnelle | Force le semestre en cours (1 ou 2) côté web et API (valeur intégrée au build) ; sinon déduit de la date (S1 de septembre à janvier) |
| `CURRENT_SEMESTER` | optionnelle | Même effet, côté serveur seulement (invisible du navigateur) |
| `GENIUS_PAY_PUBLIC_KEY`, `GENIUS_PAY_SECRET_KEY` | importantes si les paiements sont activés | Paiement en ligne et vérification de signature du callback ; peuvent rester absentes tant que les paiements sont désactivés |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | **critiques** | Seul canal d'envoi des codes (inscription, mot de passe oublié) et des alertes par email : **sans elles, personne ne peut s'inscrire** (voir [Envoi des codes de vérification](#envoi-des-codes-de-vérification)) |
| `WHATSAPP_INSTANCE_ID`, `WHATSAPP_TOKEN` | optionnelles | UltraMsg (WhatsApp), **désactivé par défaut** : s'il manque l'une des deux, aucun appel WhatsApp n'est fait. Les définir toutes deux réactive l'envoi des codes par WhatsApp en plus de l'email |
| `BLOB_READ_WRITE_TOKEN` | importante | Stockage des ressources et avatars (Vercel Blob) |
| `GOOGLE_API_KEY` | optionnelle | Lecture de dossiers/fichiers Google Drive publics |
| `TAVILY_API_KEY` | optionnelle | Recherche web de l'assistant |
| `ADMIN_NOTIFICATION_EMAIL` | optionnelle | Adresse qui reçoit les alertes admin par email |
| `ADMIN_WHATSAPP_PHONE` | optionnelle | Numéro qui reçoit les alertes admin par WhatsApp ; sans effet tant que `WHATSAPP_INSTANCE_ID` et `WHATSAPP_TOKEN` ne sont pas définis |
| `NEXT_PUBLIC_ADMIN_WHATSAPP` | optionnelle | Numéro WhatsApp affiché (boutique, support, à propos) ; exposé au navigateur ; peut rester absente tant que les paiements sont désactivés |
| `NEXT_PUBLIC_TMONEY_NUMBER`, `NEXT_PUBLIC_FLOOZ_NUMBER` | optionnelles | Numéros du paiement manuel affichés au checkout (section masquée si absents) ; peuvent rester absentes tant que les paiements sont désactivés |
| `CSP_ENFORCE` | optionnelle | `true` pour appliquer la Content-Security-Policy complète (voir [Sécurité](#sécurité)) |
| `SEED_*` | optionnelles | Comptes de démonstration du seed (développement uniquement) |

### Envoi des codes de vérification

Mode par défaut : **codes par email seulement**. Le code d'activation à l'inscription et le code de réinitialisation du mot de passe sont envoyés uniquement à l'adresse email du compte (Gmail, nodemailer). Les pages web, l'application mobile et les messages de l'API annoncent « par email » et rappellent de vérifier les courriers indésirables (spams).

- **`GMAIL_USER` et `GMAIL_APP_PASSWORD` sont critiques** : sans elles, aucun code ne part. L'inscription est alors refusée (502 « Impossible d'envoyer le code par email… ») et la réinitialisation du mot de passe ne livre rien. Le mot de passe d'application se crée sur <https://myaccount.google.com/apppasswords> (validation en deux étapes requise).
- **Limite d'envoi Gmail** : un compte Gmail gratuit plafonne à environ 500 messages par jour (environ 2000 avec Google Workspace). Au-delà, Gmail bloque l'envoi pour 24 h et les inscriptions échouent. Chaque inscription ou « Renvoyer le code » consomme un message. Prévoir un service d'envoi dédié (Resend, Brevo, SES...) si l'affluence augmente.
- **Risque de spam** : les emails envoyés depuis un compte Gmail personnel sont parfois classés en courriers indésirables. Les étudiants sont invités à les vérifier ; un expéditeur sur un domaine propre (SPF/DKIM) améliorerait la délivrabilité.
- **Le numéro de téléphone** reste obligatoire à l'inscription : il sert d'identifiant de connexion unique (et d'usage futur), mais aucun message n'y est envoyé tant que WhatsApp n'est pas configuré.
- **Réactiver WhatsApp** : définir `WHATSAPP_INSTANCE_ID` et `WHATSAPP_TOKEN` (UltraMsg) suffit, sans modifier le code. Les codes partent alors par WhatsApp **et** par email, et les messages de l'API deviennent « par WhatsApp et par email ». L'inscription n'est refusée que si aucun canal ne livre le code. Les alertes admin et les notifications de paiement par WhatsApp utilisent les mêmes variables (`ADMIN_WHATSAPP_PHONE` pour l'administrateur).

### Interrupteur des paiements

L'application fonctionne pour l'instant en **freemium** : **aucun paiement n'est accepté**. Un interrupteur unique, **désactivé par défaut**, ouvre ou ferme tout ce qui touche au paiement :

| Plateforme | Variable | Ouverture |
|---|---|---|
| Web et serveur | `NEXT_PUBLIC_PAYMENTS_ENABLED` | seulement si la valeur est exactement `true` |
| Mobile | `EXPO_PUBLIC_PAYMENTS_ENABLED` | seulement si la valeur est exactement `true` |

Toute autre valeur (absente, vide, `false`, `TRUE`, `1`) laisse les paiements fermés. Ces variables sont intégrées au build (navigateur et serveur pour `NEXT_PUBLIC_*`, application pour `EXPO_PUBLIC_*`) : **redéployer / refaire un build après modification**, et garder les deux cohérentes.

**Paiements fermés (défaut)**

- `/shop`, `/shop/checkout`, `/shop/success` et `/subscribe` redirigent vers `/` (`src/proxy.ts`, avant toute règle d'accès) ; sur mobile, l'écran boutique renvoie à l'accueil.
- Aucun lien, bouton, prix, badge Premium ni bloc d'abonnement n'est affiché (navigation, tableau de bord, assistant IA, profil, page « À propos »). Le quota IA quotidien gratuit et les jetons bonus gagnés gratuitement (publicité récompensée, parrainage) restent affichés ; un quota épuisé invite à réessayer demain.
- `POST /api/payment/genius/create`, `POST /api/payment/manual-request` et l'action serveur `createGeniusPayment` répondent `503 { error: "Les paiements ne sont pas encore disponibles.", code: "payments_disabled" }` **avant** toute écriture en base et toute lecture de clé.
- Restent actifs : le callback et la vérification Genius Pay, ainsi que l'espace admin (approbation d'une transaction déjà existante).
- Variables **non nécessaires** : `GENIUS_PAY_PUBLIC_KEY`, `GENIUS_PAY_SECRET_KEY`, `NEXT_PUBLIC_ADMIN_WHATSAPP`, `NEXT_PUBLIC_TMONEY_NUMBER` et `NEXT_PUBLIC_FLOOZ_NUMBER` peuvent rester absentes (le build n'en dépend pas). `NEXT_PUBLIC_APP_URL` reste **nécessaire** (CORS de l'API).

**Réouvrir les paiements** : définir `NEXT_PUBLIC_PAYMENTS_ENABLED=true` (et `EXPO_PUBLIC_PAYMENTS_ENABLED=true` pour le mobile), renseigner les variables Genius Pay et d'affichage ci-dessus, puis redéployer. Le code d'achat n'a pas été supprimé, aucune autre modification n'est requise.

## Base de données et migrations

Le schéma est dans `prisma/schema.prisma`. Le script `postinstall` ne fait **que** `prisma generate` : l'installation ne modifie plus jamais une base (elle exécutait auparavant `prisma db push --accept-data-loss`, destructeur sur la production).

**Règles**

- Ne jamais exécuter `prisma db push` contre la base de production, et jamais avec `--accept-data-loss`.
- En production, les changements de schéma passent par des migrations versionnées : `npm run db:migrate:deploy` (`prisma migrate deploy`).
- `prisma/schema.prisma` ne doit pas être modifié sans migration associée.

**Base locale neuve (développement)** : tant que les migrations ne sont pas versionnées dans le dépôt, `npx prisma db push` sur une base locale jetable crée le schéma.

**Mise en place des migrations sur la base de production existante** (une seule fois, par le propriétaire, depuis Git Bash : PowerShell 5 encode mal les redirections). La production a été créée par `db push` : il faut d'abord déclarer son état actuel comme « baseline », puis appliquer les évolutions (champs OTP/pub/série, table `RateLimit`, index) :

```bash
# 1. Schéma tel qu'il était en production avant ces évolutions
git show 0f1ad38:prisma/schema.prisma > prod-schema.prisma

# 2. Migration de baseline et migration des évolutions (lecture seule, aucune base modifiée)
npx prisma migrate diff --from-empty --to-schema-datamodel prod-schema.prisma --script -o prisma/migrations/0_init/migration.sql
npx prisma migrate diff --from-schema-datamodel prod-schema.prisma --to-schema-datamodel prisma/schema.prisma --script -o prisma/migrations/1_securite_index/migration.sql

# 3. Vérifier que la baseline correspond bien à la production (code de sortie 0 attendu)
npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prod-schema.prisma --exit-code

# 4. Déclarer la baseline comme déjà appliquée, puis appliquer la suite
npx prisma migrate resolve --applied 0_init
npm run db:migrate:deploy
```

Faire une sauvegarde (branche Neon ou export) avant l'étape 4. Committer ensuite `prisma/migrations/`.

## Scripts

### npm

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur de développement (webpack) |
| `npm run build` / `npm start` | Build et serveur de production |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Tests unitaires Vitest (logique pure, sans base) |
| `npm run db:migrate:deploy` | Applique les migrations Prisma en attente |
| `npm run db:seed` | Données de démonstration (refusé en production) |

### Scripts d'administration (`scripts/`)

Exécutés avec `tsx` contre la base désignée par `DATABASE_URL`. Ils affichent la base visée, exigent `--yes` et refusent de tourner avec `NODE_ENV=production`. Ils n'affichent ni emails ni hash. Pour charger `.env.local` : `npx tsx --env-file=.env.local scripts/<script>.ts ...`.

| Script | Rôle |
|---|---|
| `scripts/activate-users.ts --yes <email> [...]` | Active les comptes listés (jamais de masse) |
| `scripts/check-users.ts --yes` | Compteurs de comptes (lecture seule) |
| `scripts/generate-referral-codes.ts --yes` | Codes de parrainage manquants |
| `scripts/setup-defitech-data.ts` | Filières, niveaux et matières de base (idempotent) |
| `scripts/bulk-import.ts --yes` | Import local depuis `bulk_import/Filière/Niveau/Matière/` (développement) |

## Tests et intégration continue

`npm test` exécute Vitest sur `src/**/*.test.ts` et `scripts/**/*.test.ts` : rate limit, comparaison en temps constant, catalogue d'offres, abonnement (`isPremium`), schémas d'identifiant, interrupteur des paiements et redirection des pages de paiement. Aucun test ne touche à une base ou au réseau (Prisma est simulé).

Le workflow `.github/workflows/ci.yml` exécute sur chaque push vers `main` et chaque pull request : `npm ci`, `prisma validate` et `generate`, `tsc --noEmit`, `eslint`, `vitest run`, `next build --webpack`, avec des variables factices.

## Déploiement sur Vercel

1. Importer le dépôt dans Vercel (framework Next.js ; commande de build : `npm run build`).
2. Saisir les variables de `.env.example` pour Production et Preview (rotation des clés si elles ont été exposées). `NEXT_PUBLIC_APP_URL` doit être le domaine canonique unique. Tant que les paiements sont désactivés (`NEXT_PUBLIC_PAYMENTS_ENABLED` absent ou différent de `true`), les clés Genius Pay et les numéros de paiement peuvent être omis.
3. Lier un Blob store au projet (crée `BLOB_READ_WRITE_TOKEN`).
4. Appliquer les migrations avant de déployer une évolution du schéma : `npm run db:migrate:deploy` avec la `DATABASE_URL` de production (depuis un poste de confiance), ou en commande de build `npm run db:migrate:deploy && npm run build`.
5. Si les paiements sont activés, configurer le webhook Genius Pay (voir ci-dessous).
6. Après un déploiement, ouvrir la console du navigateur sur les pages principales : aucune violation `Content-Security-Policy-Report-Only` ne doit apparaître avant d'activer `CSP_ENFORCE=true`.

### Webhook Genius Pay

Sans objet tant que les paiements sont désactivés (voir [Interrupteur des paiements](#interrupteur-des-paiements)).

- **URL du webhook** : `<NEXT_PUBLIC_APP_URL>/api/payment/genius/callback` (ex. `https://mon-domaine.vercel.app/api/payment/genius/callback`).
- **Signature** : le serveur exige l'en-tête `x-genius-signature`, un HMAC-SHA256 hexadécimal du **corps brut** de la requête calculé avec `GENIUS_PAY_SECRET_KEY`. Une requête sans signature valide est rejetée (401) et aucun crédit n'est accordé. Le nom de l'en-tête et l'algorithme sont à **confirmer auprès de la documentation Genius Pay** avant la mise en production ; un paiement test doit être crédité de bout en bout.
- `NEXT_PUBLIC_APP_URL` est **obligatoire** pour les paiements Genius : il n'y a plus de domaine de repli, et sans elle la création d'un paiement renvoie une erreur 503.
- Les paiements manuels (T-Money / Flooz) sont validés par un administrateur ; leurs numéros d'affichage viennent de `NEXT_PUBLIC_TMONEY_NUMBER` et `NEXT_PUBLIC_FLOOZ_NUMBER` (section masquée si absents).

## Application mobile

```bash
cd mobile
npm install
cp .env.example .env     # si présent ; définir EXPO_PUBLIC_API_URL (https://<domaine>/api)
npx expo start
```

L'application s'authentifie avec `POST /api/auth/login` (`{ identifier, password }`) et envoie le JWT reçu en `Authorization: Bearer`. Le serveur relit rôle et état du compte en base à chaque requête : une désactivation est immédiate. Les paiements y sont fermés par défaut (`EXPO_PUBLIC_PAYMENTS_ENABLED`, voir [Interrupteur des paiements](#interrupteur-des-paiements)). Builds : `eas build --profile preview` (voir `mobile/eas.json`).

## Architecture

```
auth.ts                     Configuration NextAuth (identifiant email ou téléphone + mot de passe)
src/proxy.ts                Proxy Next 16 : redirige vers /login les pages protégées (API non concernée)
src/app/                    Pages (App Router) et routes API (src/app/api/**)
src/components/             Composants partagés (Sidebar, AIChat, Mermaid, Scene3D...)
src/lib/session.ts          getAuthUser / requireAdmin : cookie NextAuth OU Bearer mobile, rôle relu en base
src/lib/selects.ts          Sélections Prisma sûres (jamais de hash ni de code OTP dans une réponse)
src/lib/rateLimit.ts        Limitation de débit persistante (table RateLimit) et comparaison en temps constant
src/lib/subscription.ts     isPremium : abonnement valide seulement si non expiré
src/lib/packs.ts            Source unique des offres (prix, jetons, durées)
src/lib/fulfillment.ts      Crédit idempotent d'une transaction (callback et approbation admin)
src/lib/quota.ts            Quota IA quotidien atomique (consommation avant l'appel au modèle)
src/lib/ai.ts               Appels Groq avec rotation de modèles
prisma/schema.prisma        Modèle de données ; prisma/seed.ts : données de démonstration
scripts/                    Scripts d'administration (garde --yes, interdits en production)
mobile/                     Application Expo
```

Principes : l'authentification est vérifiée route par route avec `getAuthUser` (jamais d'en-tête d'identité fourni par le client) ; toute séquence lire-tester-écrire sur un quota, un solde ou un statut est une écriture conditionnelle atomique ou une transaction ; les erreurs d'API ont la forme `{ "error": "message" }`.

## Sécurité

- **Secrets** : jamais dans le dépôt. `AUTH_SECRET` est obligatoire (aucun repli). En cas de fuite d'une clé, la faire tourner puis mettre à jour Vercel.
- **Comptes** : mots de passe bcrypt, OTP à usage unique avec compteur d'essais, limitation de débit persistante par identifiant et par IP.
- **Paiement** : le callback Genius Pay est vérifié (signature, montant, statut) et le crédit est idempotent ; les prix viennent uniquement de `src/lib/packs.ts`, jamais du client.
- **En-têtes** (`next.config.ts`) : `X-Content-Type-Options`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy`, `Permissions-Policy`, CORS restreint à `NEXT_PUBLIC_APP_URL`. La politique `Content-Security-Policy` complète est d'abord émise en **Report-Only** (violations journalisées dans la console, rien n'est bloqué) car elle n'a pas encore été validée dans un navigateur (Three.js, Mermaid, aperçu PDF, upload Blob) ; seul un socle (`frame-ancestors`, `base-uri`, `form-action`) est appliqué. `CSP_ENFORCE=true` applique la politique complète.
- **Scripts** : refus en production, confirmation `--yes`, aucune donnée personnelle affichée.
- **Points ouverts (décision du propriétaire)** : `public/sw.js` (régénéré par next-pwa au build) charge un script publicitaire tiers ; la preuve de visionnage d'une publicité-récompense n'est pas vérifiée côté serveur (le serveur ne fait que plafonner et ralentir les récompenses).

Signaler une vulnérabilité : écrire au contact indiqué dans [LEGAL.md](./LEGAL.md), sans divulgation publique préalable.

## Confidentialité et droits d'auteur

Ce projet est une propriété intellectuelle exclusive de l'agence **Kelvix** (fondée par **KARABOKA Kelvyn** et **DJATOZ Stephane**).

Toute reproduction, copie du code source, ou distribution non autorisée du logiciel **DefiTech Student Hub** est strictement interdite par la loi. Le code source est confidentiel et réservé à l'usage interne de l'école DEFITECH et de Kelvix Digital Solutions.

Pour toute information légale, consultez le fichier [LEGAL.md](./LEGAL.md).

---
© 2026 Kelvix Digital Solutions. Tous droits réservés.
