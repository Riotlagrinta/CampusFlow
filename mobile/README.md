# StudentHub — application mobile (Expo)

Application React Native (Expo SDK 54, expo-router, NativeWind) qui consomme l'API du site
StudentHub (`/api/*`). L'authentification utilise un jeton JWT (Bearer) stocké dans le
stockage sécurisé de l'appareil (`expo-secure-store`).

## Démarrage

```bash
cd mobile
npm install
cp .env.example .env     # puis renseigner les variables utiles (voir ci-dessous)
npx expo start -c        # -c : vide le cache Metro (nécessaire après un changement de tailwind.config.js)
```

Autres commandes : `npm run lint`, `npm run typecheck`, `npm run android`, `npm run ios`.

## Configuration (`.env`)

Les variables `EXPO_PUBLIC_*` sont embarquées dans l'application : jamais de secret.
Pour un build EAS, voir la section « Variables d'environnement et builds EAS » ci-dessous.

| Variable | Rôle |
|---|---|
| `EXPO_PUBLIC_API_URL` | URL de l'API (se termine par `/api`). Par défaut : `https://studenthub-mu.vercel.app/api`. HTTPS obligatoire en production. |
| `EXPO_PUBLIC_PAYMENTS_ENABLED` | **Interrupteur des paiements, désactivé par défaut** : boutique, achat de jetons et abonnements ne s'ouvrent que si la valeur est exactement `true`. Voir ci-dessous. |
| `EXPO_PUBLIC_ADMIN_WHATSAPP` | Numéro WhatsApp de l'administrateur (format international, sans `+`). Inutile tant que les paiements sont désactivés. |
| `EXPO_PUBLIC_TMONEY_NUMBER` / `EXPO_PUBLIC_FLOOZ_NUMBER` | Numéros de réception du paiement manuel. Sans ces valeurs, le paiement manuel est masqué dans le checkout (le paiement automatique Genius Pay reste disponible). Inutiles tant que les paiements sont désactivés. |

### Interrupteur des paiements

L'application est en **freemium** : tant que `EXPO_PUBLIC_PAYMENTS_ENABLED` n'est pas exactement `true`
(absente, vide ou `false` : cas par défaut), les paiements sont fermés :

- aucun onglet, bouton ni lien ne mène à la boutique ; l'écran `app/shop/**` atteint par navigation
  directe renvoie immédiatement à l'accueil ;
- aucun prix, badge ni état d'abonnement n'est affiché ; les jetons bonus gagnés gratuitement et le quota
  quotidien restent visibles ; un quota épuisé invite à réessayer demain (plus de renvoi vers la boutique) ;
- si le serveur répond `503` avec `code: "payments_disabled"`, le message « Les paiements ne sont pas
  encore disponibles. » est affiché au lieu d'une erreur générique.

Le serveur a le même interrupteur (`NEXT_PUBLIC_PAYMENTS_ENABLED`) : les garder cohérents. La valeur est
embarquée au build : refaire un build après modification. Pour rouvrir les paiements, passer les deux à `true`
(et renseigner les numéros de paiement manuel si besoin), sans autre changement de code.

## Variables d'environnement et builds EAS

Le fichier `mobile/.env` n'est lu qu'en local : il n'est pas envoyé aux builds EAS. Et `mobile/eas.json`
n'a **pas** de section `env`. Pour les builds `preview` et `production`, les variables suivantes doivent
donc être définies dans le projet EAS (tableau de bord, rubrique des variables d'environnement, ou
`eas env:create`), pour l'environnement correspondant au profil de build :

- `EXPO_PUBLIC_API_URL`
- `EXPO_PUBLIC_PAYMENTS_ENABLED` (facultative : absente = paiements fermés)
- `EXPO_PUBLIC_ADMIN_WHATSAPP`
- `EXPO_PUBLIC_TMONEY_NUMBER`
- `EXPO_PUBLIC_FLOOZ_NUMBER`

Ces valeurs sont lues au moment du build et embarquées dans l'application (jamais de secret).

- Si `EXPO_PUBLIC_ADMIN_WHATSAPP` ou les numéros T-Money / Flooz manquent dans le build, le paiement
  manuel est désactivé dans le checkout (seul le paiement automatique Genius Pay reste proposé).
- Sans `EXPO_PUBLIC_API_URL`, l'application utilise l'URL par défaut de `src/config.ts`. Elle doit
  coïncider avec le domaine canonique du backend (`NEXT_PUBLIC_APP_URL` côté site) ; si le domaine
  change, mettre à jour cette valeur par défaut ou définir `EXPO_PUBLIC_API_URL` dans EAS.

## Structure

- `app/` : écrans (expo-router). `index.tsx` = garde d'authentification / onboarding ;
  `auth/` = connexion, inscription, validation du code (OTP), mot de passe oublié ;
  `(tabs)/` = accueil et profil ; puis planning, ressources, quiz, forum, assistant IA, boutique (fermée par défaut, voir « Interrupteur des paiements »).
- `src/context/AuthContext.tsx` : session (connexion, déconnexion, validation du jeton au démarrage,
  déconnexion automatique sur 401).
- `src/services/` : client API (`api.ts`), cache hors-ligne par utilisateur (`cache.ts`),
  gestion des erreurs, pagination, notifications push.
- `src/config.ts` : URL de l'API, interrupteur des paiements (`PAYMENTS_ENABLED`) et coordonnées de paiement lues depuis l'environnement.
- `src/packs.ts` : offres de jetons affichées (copie de `src/lib/packs.ts` du site : à tenir à jour).
- `components/`, `hooks/` : composants et hooks partagés (thème clair/sombre via classes `dark:`).

## Notes

- Les codes de vérification (activation du compte à l'inscription, mot de passe oublié) sont envoyés **par e-mail** : l'application l'annonce et rappelle de vérifier les courriers indésirables. Le numéro de téléphone reste obligatoire à l'inscription (identifiant de connexion unique) mais ne reçoit aucun message ; l'envoi WhatsApp est un canal optionnel côté serveur (voir le `README.md` à la racine). `EXPO_PUBLIC_ADMIN_WHATSAPP` ne concerne que la preuve de paiement manuel, pas ces codes.
- Le mode sombre suit le réglage du téléphone.
- Les données consultées sont mises en cache sur l'appareil (par compte) pour le mode hors-ligne ;
  le cache est supprimé à la déconnexion.
- Les listes paginées par le serveur (planning, ressources) sont lues page par page (50 éléments).
