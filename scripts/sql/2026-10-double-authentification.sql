-- StudentHub - double authentification des administrateurs (TOTP)
-- Migration PUREMENT ADDITIVE et REJOUABLE (IF NOT EXISTS) :
--   * 4 colonnes NULLABLES sur "User" : aucune donnée existante n'est modifiée ;
--   * compatible avec l'ancien code, qui ignore ces colonnes ;
--   * aucun DROP, aucun UPDATE, aucun DELETE, aucune contrainte UNIQUE.
--
-- À appliquer AVANT de déployer le code qui lit ces colonnes (sinon la connexion échoue :
-- Prisma sélectionne les colonnes qui n'existent pas encore).
-- Procédure : console Neon > SQL Editor > branche de PRODUCTION (vérifier le sélecteur de branche).
--
-- Vérification après exécution (doit renvoyer 4) :
--   SELECT count(*) FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='User'
--     AND column_name IN ('mfaSecret','mfaEnabledAt','mfaLastStep','mfaRecovery');

BEGIN;

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "mfaSecret" TEXT,
  ADD COLUMN IF NOT EXISTS "mfaEnabledAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "mfaLastStep" INTEGER,
  ADD COLUMN IF NOT EXISTS "mfaRecovery" TEXT;

COMMIT;

-- ---------------------------------------------------------------------------------------------
-- SECOURS : administrateur qui a perdu son authentificateur ET ses codes de secours.
-- À exécuter à la main, en remplaçant l'adresse. Réinitialise son second facteur, lève le verrou des
-- essais de code (sinon il resterait bloqué jusqu'à 24 h) et révoque ses sessions ouvertes. Il se
-- reconnecte ensuite et réactive le second facteur depuis la page /mfa.
--
--   BEGIN;
--   UPDATE "User"
--   SET "mfaSecret" = NULL, "mfaEnabledAt" = NULL, "mfaLastStep" = NULL, "mfaRecovery" = NULL,
--       "passwordChangedAt" = now()
--   WHERE lower(email) = lower('admin@exemple.com');
--   DELETE FROM "RateLimit" WHERE "key" LIKE 'mfa:%';
--   COMMIT;
--
-- Si l'alerte email « Double authentification activée » n'était PAS attendue (quelqu'un d'autre a pu
-- enregistrer SON authentificateur avec le mot de passe), changer aussi le mot de passe du compte
-- (« Mot de passe oublié ») après cette remise à zéro, et réactiver le second facteur immédiatement.
--
-- Désactiver la fonction VOLONTAIREMENT : exécuter la remise à zéro ci-dessus pour TOUS les
-- administrateurs, puis retirer MFA_ENCRYPTION_KEY de Vercel et redéployer. Retirer la clé SEULE ne
-- désactive pas l'exigence pour un administrateur déjà inscrit : il est refusé (jamais d'accès sur mot
-- de passe seul parce qu'une variable manque).