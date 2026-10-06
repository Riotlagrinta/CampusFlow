import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";
import {
  UNTRUSTED_DATA_NOTICE,
  aiFailureResponse,
  canAccessResource,
  chatCompletionWithRotation,
  completionText,
  inlineValue,
  parseLlmJson,
  readResourceText,
  remainingBudgetMs,
  resolveResourceSource,
  wrapUntrusted,
} from "@/lib/ai";
import {
  consumeAiRequest,
  enforceRateLimit,
  quotaExceededResponse,
  recordAiTokens,
  refundAiRequest,
} from "@/lib/quota";

export const maxDuration = 60;

const DOCUMENT_CHARS = 16_000;
const MAX_QUESTIONS = 30;
const MIN_VALID_QUESTIONS = 3;

// Corps optionnel : ID d'un fichier choisi dans un dossier Google Drive (format validé plus loin).
const bodySchema = z.object({ driveFileId: z.string().max(100).nullish() });

// Sortie du LLM : jamais utilisée sans validation. `answer` = index de la bonne option.
const questionSchema = z
  .object({
    question: z.string().trim().min(3).max(600),
    options: z.array(z.string().trim().min(1).max(300)).min(2).max(6),
    answer: z.coerce.number().int().min(0),
  })
  .refine((q) => q.answer < q.options.length, { message: "answer hors des options" });

const quizHeaderSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(1000).optional(),
});

function normalizeQuiz(parsed: unknown) {
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  if (!Array.isArray(obj.questions)) return null;

  const questions: z.infer<typeof questionSchema>[] = [];
  for (const item of obj.questions) {
    const q = questionSchema.safeParse(item);
    if (q.success) questions.push(q.data);
    if (questions.length >= MAX_QUESTIONS) break;
  }
  if (questions.length < MIN_VALID_QUESTIONS) return null;

  const header = quizHeaderSchema.safeParse(obj);
  return {
    title: header.success ? header.data.title : undefined,
    description: header.success ? header.data.description : undefined,
    questions,
  };
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const startedAt = Date.now();

  try {
    const authUser = await getAuthUser(req);
    if (!authUser) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const limited = await enforceRateLimit(req, authUser.id, "ai-quiz", { perUser: 4, perIp: 15 });
    if (limited) return limited;

    const body = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!body.success) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
    const driveFileId = body.data.driveFileId || null;

    const { id } = await params;

    const user = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: { fieldId: true, academicLevelId: true },
    });
    if (!user) return NextResponse.json({ error: "Utilisateur introuvable." }, { status: 404 });

    const resource = await prisma.resource.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        type: true,
        url: true,
        fieldId: true,
        levelId: true,
        subjectName: true,
        subjectId: true,
      },
    });
    if (!resource) {
      return NextResponse.json({ error: "Ressource non trouvée" }, { status: 404 });
    }

    // Isolation par filière/niveau (comme GET /api/resources) ; les ADMIN passent toujours.
    if (!(await canAccessResource({ ...user, role: authUser.role }, resource))) {
      return NextResponse.json({ error: "Accès refusé à cette ressource." }, { status: 403 });
    }

    // Vérifications rapides AVANT de consommer du quota.
    const resolved = resolveResourceSource(resource, driveFileId);
    if (!resolved.ok) {
      // Un dossier Drive n'est pas une erreur : le client doit proposer un fichier du dossier.
      return NextResponse.json(
        resolved.isFolder ? { isFolder: true, error: resolved.error } : { error: resolved.error },
        { status: resolved.status }
      );
    }

    // Quota atomique AVANT le téléchargement et l'appel LLM, remboursé si aucun quiz n'est créé.
    const quota = await consumeAiRequest(authUser.id, "quiz");
    if (!quota.ok) return quotaExceededResponse();
    const { ticket } = quota;

    try {
      const fullText = await readResourceText(resolved.source, DOCUMENT_CHARS);

      const completion = await chatCompletionWithRotation({
        messages: [
          {
            role: "system",
            content:
              "Tu es un enseignant. Tu réponds UNIQUEMENT par un objet JSON valide, sans texte autour. " +
              UNTRUSTED_DATA_NOTICE,
          },
          {
            role: "user",
            content:
              `Texte de cours :\n${wrapUntrusted("document", fullText)}\n\n` +
              `Génère un quiz pédagogique de 15 questions à choix multiples (4 options chacune) à partir de ce texte, dans sa langue.\n` +
              `Format exact : {"title":"...","description":"...","questions":[{"question":"...","options":["...","...","...","..."],"answer":0}]}\n` +
              `"answer" est l'index (à partir de 0) de la bonne option.`,
          },
        ],
        temperature: 0.3,
        maxTokens: 3500,
        response_format: { type: "json_object" },
        totalTimeoutMs: remainingBudgetMs(startedAt),
      });

      await recordAiTokens(ticket, completion.usage?.total_tokens);

      const quizData = normalizeQuiz(parseLlmJson(completionText(completion)));
      if (!quizData) {
        await refundAiRequest(ticket);
        return NextResponse.json(
          { error: "L'IA n'a pas produit de quiz exploitable. Votre requête n'a pas été décomptée, réessayez." },
          { status: 502 }
        );
      }

      const quiz = await prisma.quiz.create({
        data: {
          title: quizData.title || `Quiz : ${inlineValue(resource.title, 150)}`,
          description: quizData.description || null,
          subjectName: resource.subjectName || "Général",
          subjectId: resource.subjectId,
          resourceId: resource.id,
          questions: {
            create: quizData.questions.map((q) => ({
              question: q.question,
              options: JSON.stringify(q.options),
              answer: q.answer,
            })),
          },
        },
        select: { id: true },
      });

      return NextResponse.json({ success: true, quizId: quiz.id });
    } catch (error) {
      await refundAiRequest(ticket);
      return aiFailureResponse(error, "generate-quiz");
    }
  } catch (error) {
    console.error("[generate-quiz] erreur inattendue:", error instanceof Error ? error.name : "erreur inconnue");
    return NextResponse.json({ error: "Échec de la génération" }, { status: 500 });
  }
}
