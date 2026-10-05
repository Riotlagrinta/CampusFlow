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

const DOCUMENT_CHARS = 15_000;

// Corps optionnel : ID d'un fichier choisi dans un dossier Google Drive (format validé plus loin).
const bodySchema = z.object({ driveFileId: z.string().max(100).nullish() });

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

    const limited = await enforceRateLimit(req, authUser.id, "ai-explain", { perUser: 6, perIp: 20 });
    if (limited) return limited;

    const body = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!body.success) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
    const driveFileId = body.data.driveFileId || null;

    const { id } = await params;

    const user = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: { role: true, fieldId: true, academicLevelId: true },
    });
    if (!user) return NextResponse.json({ error: "Utilisateur introuvable." }, { status: 404 });

    const resource = await prisma.resource.findUnique({
      where: { id },
      select: { title: true, type: true, url: true, fieldId: true, levelId: true },
    });
    if (!resource) {
      return NextResponse.json({ error: "Ressource non trouvée" }, { status: 404 });
    }

    // Isolation par filière/niveau (comme GET /api/resources) ; les ADMIN passent toujours.
    if (!(await canAccessResource(user, resource))) {
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

    // Quota atomique AVANT le téléchargement et l'appel LLM, remboursé en cas d'échec.
    const quota = await consumeAiRequest(authUser.id, "explain");
    if (!quota.ok) return quotaExceededResponse();
    const { ticket } = quota;

    try {
      const fullText = await readResourceText(resolved.source, DOCUMENT_CHARS);

      const completion = await chatCompletionWithRotation({
        messages: [
          {
            role: "system",
            content:
              "Tu es un professeur expert de l'institution DEFITECH. Ton rôle est d'expliquer le contenu du document fourni par l'étudiant de manière claire, pédagogique et structurée. Utilise du Markdown pour la mise en forme (Titres, Listes, Gras). " +
              UNTRUSTED_DATA_NOTICE,
          },
          {
            role: "user",
            content: `Document : ${inlineValue(resource.title, 150)}\n\nContenu :\n${wrapUntrusted("document", fullText)}`,
          },
        ],
        temperature: 0.5,
        maxTokens: 3000,
        totalTimeoutMs: remainingBudgetMs(startedAt),
      });

      await recordAiTokens(ticket, completion.usage?.total_tokens);
      return NextResponse.json({ explanation: completionText(completion) });
    } catch (error) {
      await refundAiRequest(ticket);
      return aiFailureResponse(error, "explain");
    }
  } catch (error) {
    console.error("[explain] erreur inattendue:", error instanceof Error ? error.name : "erreur inconnue");
    return NextResponse.json({ error: "Échec de l'explication" }, { status: 500 });
  }
}
