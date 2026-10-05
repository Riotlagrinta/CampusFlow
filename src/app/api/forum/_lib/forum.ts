import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { AI_TUTOR_EMAIL } from '@/lib/xp';

export const QUESTION_TITLE_MIN = 5;
export const QUESTION_TITLE_MAX = 150;
export const QUESTION_CONTENT_MIN = 10;
export const QUESTION_CONTENT_MAX = 5000;
export const ANSWER_MIN = 2;
export const ANSWER_MAX = 5000;
/** Longueur minimale d'une réponse pour qu'elle rapporte de l'XP. */
export const ANSWER_XP_MIN_LENGTH = 30;

export const PAGE_SIZE_DEFAULT = 20;
export const PAGE_SIZE_MAX = 50;

// Éléments à contenu actif : supprimés (avec leur contenu pour les paires ouvrantes/fermantes).
const ACTIVE_BLOCK = /<(script|style|iframe|object|embed|noscript|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const ACTIVE_TAG = /<\/?(?:script|style|iframe|object|embed|noscript|template|link|meta|base|form|frame|frameset|applet)\b[^>]*>/gi;
// Gestionnaires d'événements (onerror=...) et URL javascript: dans les balises restantes.
const EVENT_HANDLER = /(<[a-zA-Z][^<>]*?)\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi;
const SCRIPT_URL = /(<[a-zA-Z][^<>]*?\s(?:href|src|action|formaction|xlink:href)\s*=\s*["']?)\s*(?:javascript|vbscript|data\s*:\s*text\/html)\s*:/gi;

/**
 * Nettoyage unique du texte saisi par les utilisateurs (questions, réponses, tags, réponse IA).
 * Le forum stocke du texte brut/Markdown. Les éléments actifs (script, iframe, gestionnaires
 * onXxx=, URL javascript:...) et les caractères de contrôle sont retirés à l'enregistrement ;
 * le reste est conservé tel quel, car c'est un forum de code (`List<String>`, `<div>`...).
 * La vraie protection est l'affichage : les pages rendent ce texte échappé (React) ou via
 * react-markdown SANS HTML brut. Ne jamais l'injecter avec dangerouslySetInnerHTML.
 */
export function sanitizeUserText(input: string): string {
  let text = input.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');

  // Boucle jusqu'à stabilité pour neutraliser les constructions imbriquées (<scr<script>ipt>).
  let previous: string;
  do {
    previous = text;
    text = text
      .replace(ACTIVE_BLOCK, '')
      .replace(ACTIVE_TAG, '')
      .replace(EVENT_HANDLER, '$1')
      .replace(SCRIPT_URL, '$1#');
  } while (text !== previous);

  return text.trim();
}

function normalizeTags(raw: string | string[] | null | undefined): string | null {
  if (!raw) return null;
  const parts = Array.isArray(raw) ? raw : raw.split(',');
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const part of parts) {
    const tag = sanitizeUserText(part).replace(/\s+/g, ' ').slice(0, 20).trim();
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length === 5) break;
  }
  return tags.length ? tags.join(',') : null;
}

// Limite brute avant nettoyage (évite de traiter des charges énormes), puis bornes sur le texte nettoyé.
const cleanText = (min: number, max: number, label: string) =>
  z
    .string({ error: `${label} requis` })
    .max(max * 2, `${label} trop long (${max} caractères maximum)`)
    .transform(sanitizeUserText)
    .pipe(
      z
        .string()
        .min(min, `${label} trop court (${min} caractères minimum)`)
        .max(max, `${label} trop long (${max} caractères maximum)`)
    );

export const questionSchema = z.object({
  title: cleanText(QUESTION_TITLE_MIN, QUESTION_TITLE_MAX, 'Titre'),
  content: cleanText(QUESTION_CONTENT_MIN, QUESTION_CONTENT_MAX, 'Contenu'),
  tags: z
    .union([z.string().max(300), z.array(z.string().max(60)).max(20)])
    .nullish()
    .transform(normalizeTags),
  // Pris en compte uniquement pour un administrateur.
  fieldId: z.string().max(64).nullish(),
  levelId: z.string().max(64).nullish(),
});

export const answerSchema = z.object({
  content: cleanText(ANSWER_MIN, ANSWER_MAX, 'Réponse'),
});

export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).default(PAGE_SIZE_DEFAULT),
  cursor: z.string().max(64).optional(),
  q: z.string().trim().max(100).optional(),
});

export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Données invalides';
}

/**
 * Compte système du tuteur IA. Jamais ADMIN, jamais activé, mot de passe aléatoire
 * inutilisable. Un compte existant qui ne respecte pas cette règle (ancienne version du code
 * qui le créait en ADMIN) est corrigé au passage : rôle, activation, mot de passe et codes.
 */
export async function getAiTutorId(): Promise<string> {
  const existing = await prisma.user.findUnique({
    where: { email: AI_TUTOR_EMAIL },
    select: { id: true, role: true, isActive: true },
  });

  if (existing) {
    if (existing.role !== 'STUDENT' || existing.isActive) {
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          role: 'STUDENT',
          isActive: false,
          password: await unusablePasswordHash(),
          otpCode: null,
          otpCodeExpires: null,
          resetCode: null,
          resetCodeExpires: null,
        },
      });
    }
    return existing.id;
  }

  try {
    const created = await prisma.user.create({
      data: {
        email: AI_TUTOR_EMAIL,
        firstName: 'IA',
        lastName: 'Tutor',
        password: await unusablePasswordHash(),
        role: 'STUDENT',
        isActive: false,
        image: 'https://cdn-icons-png.flaticon.com/512/4712/4712035.png',
      },
      select: { id: true },
    });
    return created.id;
  } catch (e) {
    // Création concurrente : on reprend le compte créé par l'autre requête.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const user = await prisma.user.findUnique({ where: { email: AI_TUTOR_EMAIL }, select: { id: true } });
      if (user) return user.id;
    }
    throw e;
  }
}

async function unusablePasswordHash(): Promise<string> {
  // 64 caractères hexadécimaux (< 72 octets, limite de bcrypt), jamais communiqués.
  return bcrypt.hash(randomBytes(32).toString('hex'), 10);
}
