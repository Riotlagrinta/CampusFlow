-- StudentHub : évolutions de schéma de la correction de sécurité (octobre 2026).
--
-- PUREMENT ADDITIF : 7 colonnes sur "User", 1 table "RateLimit", 30 index.
-- Aucun DROP, aucun changement de type, aucune contrainte UNIQUE, aucune donnée modifiée.
-- REJOUABLE : chaque instruction est protégée par IF NOT EXISTS, une 2e exécution ne change rien.
-- COMPATIBLE avec l'ancien code : ces ajouts ne gênent pas l'application tant que le nouveau
-- code n'est pas déployé. À appliquer AVANT le déploiement du nouveau code.
--
-- Application : console Neon > SQL Editor, d'abord sur la branche de sauvegarde, puis sur la
-- branche de production. Voir README.md (section Base de données et migrations).

BEGIN;

-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "adRewardCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "adRewardDay" TEXT,
ADD COLUMN IF NOT EXISTS "lastAdRewardAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "lastStreakAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "otpAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "passwordChangedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "resetAttempts" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE IF NOT EXISTS "RateLimit" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "resetAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RateLimit_resetAt_idx" ON "RateLimit"("resetAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "User_fieldId_academicLevelId_idx" ON "User"("fieldId", "academicLevelId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "User_referredById_idx" ON "User"("referredById");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "User_xp_idx" ON "User"("xp");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BugReport_userId_idx" ON "BugReport"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FlashcardSet_userId_idx" ON "FlashcardSet"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FlashcardSet_subjectId_idx" ON "FlashcardSet"("subjectId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Flashcard_setId_idx" ON "Flashcard"("setId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Bookmark_resourceId_idx" ON "Bookmark"("resourceId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Subject_fieldId_levelId_semester_idx" ON "Subject"("fieldId", "levelId", "semester");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Assignment_fieldId_levelId_semester_idx" ON "Assignment"("fieldId", "levelId", "semester");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Assignment_subjectId_idx" ON "Assignment"("subjectId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "UserBadge_badgeId_idx" ON "UserBadge"("badgeId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Quiz_subjectId_idx" ON "Quiz"("subjectId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Quiz_resourceId_idx" ON "Quiz"("resourceId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "QuizQuestion_quizId_idx" ON "QuizQuestion"("quizId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "QuizAttempt_userId_quizId_idx" ON "QuizAttempt"("userId", "quizId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "QuizAttempt_quizId_idx" ON "QuizAttempt"("quizId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Question_fieldId_createdAt_idx" ON "Question"("fieldId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Question_authorId_idx" ON "Question"("authorId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Answer_questionId_idx" ON "Answer"("questionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Answer_authorId_idx" ON "Answer"("authorId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Resource_fieldId_levelId_semester_parentId_idx" ON "Resource"("fieldId", "levelId", "semester", "parentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Resource_parentId_idx" ON "Resource"("parentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Resource_authorId_idx" ON "Resource"("authorId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Resource_subjectId_idx" ON "Resource"("subjectId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PersonalSchedule_userId_idx" ON "PersonalSchedule"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PersonalSchedule_fieldId_levelId_semester_isAcademic_idx" ON "PersonalSchedule"("fieldId", "levelId", "semester", "isAcademic");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Transaction_userId_status_idx" ON "Transaction"("userId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Transaction_status_createdAt_idx" ON "Transaction"("status", "createdAt");


COMMIT;
