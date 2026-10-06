import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";
import { awardActionXP } from "@/lib/xp";
import { sendPushNotification } from "@/lib/notifications";
import { getCurrentSemester } from "@/lib/semester";
import {
  UNTRUSTED_DATA_NOTICE,
  aiFailureResponse,
  canAccessResource,
  chatCompletionWithRotation,
  checkDeclaredLength,
  completionText,
  extractDocumentText,
  hasPdfMagic,
  inlineValue,
  readBodyCapped,
  readResourceText,
  remainingBudgetMs,
  resolveResourceSource,
  wrapUntrusted,
  MAX_UPLOAD_PDF_BYTES,
  type ResourceSource,
} from "@/lib/ai";
import {
  consumeAiRequest,
  enforceRateLimit,
  getAiQuota,
  quotaExceededResponse,
  recordAiTokens,
  refundAiRequest,
} from "@/lib/quota";

export const maxDuration = 60;

const MAX_MESSAGE_CHARS = 4000;
const MAX_HISTORY_MESSAGES = 20;
const HISTORY_WINDOW = 10; // messages d'historique réellement transmis au modèle
const DOCUMENT_CONTEXT_CHARS = 10_000;
// Enveloppe multipart + message + historique : le PDF reste plafonné à MAX_UPLOAD_PDF_BYTES.
// 4 Mo + 512 Ko = 4,5 Mo, la limite de corps de requête de Vercel : rien de plus ne peut arriver.
const MAX_MULTIPART_BYTES = MAX_UPLOAD_PDF_BYTES + 512 * 1024;
// Corps JSON : message (4000 car.) + historique (20 messages) ; très large marge, mais borné.
const MAX_JSON_BYTES = 512 * 1024;
const FILE_TOO_BIG = `Le fichier dépasse la taille maximale (${MAX_UPLOAD_PDF_BYTES / (1024 * 1024)} Mo).`;
const BODY_TOO_BIG = "Requête trop volumineuse.";

const bodySchema = z.object({
  message: z
    .string({ error: "Message invalide." })
    .trim()
    .min(1, "Message vide.")
    .max(MAX_MESSAGE_CHARS, `Message trop long (${MAX_MESSAGE_CHARS} caractères maximum).`),
  resourceId: z.string().max(100).nullish(),
  // Le client ne peut jamais injecter un rôle `system` : seuls user/assistant sont acceptés.
  history: z
    .array(
      z.object(
        {
          role: z.enum(["user", "assistant"], { error: "Historique invalide." }),
          content: z.string({ error: "Historique invalide." }),
        },
        { error: "Historique invalide." }
      ),
      { error: "Historique invalide." }
    )
    .max(MAX_HISTORY_MESSAGES, `Historique trop long (${MAX_HISTORY_MESSAGES} messages maximum).`)
    .optional(),
});

const GREETING_RE = /^(bonjour|salut|hello|hi|hey|ça va|ca va|cc|coucou|merci|thanks|ok|d'accord|dac)$/i;

function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

/* ----- Lecture de la requête (JSON ou multipart) ----------------------------- */

type RawChatRequest = { raw: unknown; file: File | null };

/**
 * Corps de la requête, borné à `maxBytes` : Content-Length validé avant lecture (obligatoire si
 * `required`), puis lecture en flux avec compteur d'octets. Réponse d'erreur sinon.
 */
async function readBoundedBody(
  req: Request,
  maxBytes: number,
  opts: { required: boolean; tooLargeMessage: string }
): Promise<Buffer | NextResponse> {
  const declared = checkDeclaredLength(req.headers.get("content-length"), maxBytes, opts);
  if (!declared.ok) return fail(declared.error, declared.status);

  let body: Buffer | null;
  try {
    body = await readBodyCapped(req.body, maxBytes);
  } catch {
    return fail("Requête invalide.", 400);
  }
  return body ?? fail(opts.tooLargeMessage, 413);
}

/**
 * `application/json` (historique, ressource de la plateforme) ou `multipart/form-data` avec
 * `message`, `history` (chaîne JSON), `resourceId` facultatif et `file` (PDF). Le fichier n'est
 * jamais écrit sur disque : il reste en mémoire le temps de la requête.
 */
async function readChatRequest(req: Request): Promise<RawChatRequest | NextResponse> {
  const contentType = (req.headers.get("content-type") ?? "").toLowerCase();

  if (!contentType.startsWith("multipart/form-data")) {
    // JSON : même plafond en flux, mais un corps sans Content-Length reste accepté (jusqu'au plafond).
    const body = await readBoundedBody(req, MAX_JSON_BYTES, { required: false, tooLargeMessage: BODY_TOO_BIG });
    if (body instanceof NextResponse) return body;
    try {
      return { raw: JSON.parse(new TextDecoder().decode(body)), file: null };
    } catch {
      return fail("Requête invalide.", 400);
    }
  }

  // Défense en profondeur : (1) Content-Length obligatoire et vérifié AVANT toute lecture ;
  // (2) lecture en flux avec compteur d'octets (le corps s'arrête au plafond même si l'en-tête
  // ment) ; (3) seulement ensuite, analyse du multipart à partir de ce tampon borné.
  const body = await readBoundedBody(req, MAX_MULTIPART_BYTES, { required: true, tooLargeMessage: FILE_TOO_BIG });
  if (body instanceof NextResponse) return body;

  let form: FormData;
  try {
    form = await new Response(new Uint8Array(body), {
      headers: { "content-type": req.headers.get("content-type") ?? "" },
    }).formData();
  } catch {
    return fail("Requête invalide.", 400);
  }

  let history: unknown = undefined;
  const historyRaw = form.get("history");
  if (typeof historyRaw === "string" && historyRaw.trim()) {
    try {
      history = JSON.parse(historyRaw);
    } catch {
      return fail("Historique invalide.", 400);
    }
  }

  const resourceId = form.get("resourceId");
  const fileEntry = form.get("file");

  return {
    raw: {
      message: form.get("message"),
      resourceId: typeof resourceId === "string" && resourceId ? resourceId : undefined,
      history,
    },
    file: fileEntry && typeof fileEntry !== "string" ? fileEntry : null,
  };
}

/** Taille et signature `%PDF-` du fichier joint, vérifiées AVANT de consommer du quota. */
async function readUploadedPdf(file: File): Promise<Buffer | NextResponse> {
  if (file.size > MAX_UPLOAD_PDF_BYTES) return fail(FILE_TOO_BIG, 413);
  if (file.size === 0) return fail("Le fichier joint est vide.", 400);

  const data = Buffer.from(await file.arrayBuffer());
  if (data.length > MAX_UPLOAD_PDF_BYTES) return fail(FILE_TOO_BIG, 413);
  // Signature vérifiée sur le contenu : le type MIME déclaré par le client ne prouve rien.
  if (!hasPdfMagic(data)) return fail("Le fichier joint n'est pas un PDF valide.", 422);
  return data;
}

/* ----- Recherche web (Tavily) ---------------------------------------------- */

async function searchWeb(rawQuery: string): Promise<string> {
  // Requête courte : clé de cache unique (index limité en taille) et limite de l'API Tavily.
  const query = rawQuery.slice(0, 300);
  const cleanQuery = query.toLowerCase().trim();

  try {
    const cached = await prisma.searchCache.findUnique({ where: { query: cleanQuery } });
    if (cached && Date.now() - cached.createdAt.getTime() < 24 * 60 * 60 * 1000) return cached.result;

    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) return "";

    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ api_key: apiKey, query, search_depth: "basic", max_results: 3 }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return "";

    const data = (await res.json()) as { results?: { title?: string; content?: string; url?: string }[] };
    if (!data.results?.length) return "";

    const result = data.results
      .map((item) => `Titre: ${item.title ?? ""}\nInfo: ${(item.content ?? "").slice(0, 1200)}\nLien: ${item.url ?? ""}`)
      .join("\n\n");

    await prisma.searchCache.upsert({
      where: { query: cleanQuery },
      update: { result, createdAt: new Date() },
      create: { query: cleanQuery, result },
    });
    return result;
  } catch (error) {
    console.error("[chat] recherche web impossible:", error instanceof Error ? error.name : "erreur inconnue");
    return "";
  }
}

/* ----- Document joint ------------------------------------------------------ */

type DocumentSource = { kind: "upload"; data: Buffer } | { kind: "resource"; source: ResourceSource };

/* ----- Route --------------------------------------------------------------- */

export async function POST(req: Request) {
  const startedAt = Date.now();

  try {
    const authUser = await getAuthUser(req);
    if (!authUser) return fail("Session expirée ou identification requise.", 401);

    const limited = await enforceRateLimit(req, authUser.id, "ai-chat", { perUser: 20, perIp: 60 });
    if (limited) return limited;

    const request = await readChatRequest(req);
    if (request instanceof NextResponse) return request;

    const parsed = bodySchema.safeParse(request.raw);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Requête invalide.", 400);
    const { message, resourceId } = parsed.data;

    // PDF joint : contrôlé tout de suite (taille, signature), traité plus loin une fois le quota pris.
    let uploadedPdf: Buffer | null = null;
    if (request.file) {
      const checked = await readUploadedPdf(request.file);
      if (checked instanceof NextResponse) return checked;
      uploadedPdf = checked;
    }

    // Historique : fenêtre récente uniquement, chaque message tronqué.
    const history = (parsed.data.history ?? [])
      .slice(-HISTORY_WINDOW)
      .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_CHARS) }));

    const user = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: {
        firstName: true,
        fieldId: true,
        academicLevelId: true,
        pushToken: true,
        field: { select: { name: true } },
        academicLevel: { select: { name: true } },
      },
    });
    if (!user) return fail("Utilisateur introuvable.", 404);

    const isGreeting = GREETING_RE.test(message.toLowerCase());

    // --- Document joint : vérifications rapides AVANT de consommer du quota ---
    let documentSource: DocumentSource | null = null;
    if (!isGreeting) {
      // Le PDF envoyé avec le message a priorité sur une ressource de la plateforme.
      if (uploadedPdf) {
        documentSource = { kind: "upload", data: uploadedPdf };
      } else if (resourceId) {
        const resource = await prisma.resource.findUnique({
          where: { id: resourceId },
          select: { type: true, url: true, fieldId: true, levelId: true },
        });
        if (!resource) return fail("Document introuvable.", 404);
        if (!(await canAccessResource({ ...user, role: authUser.role }, resource))) return fail("Accès refusé à cette ressource.", 403);

        const resolved = resolveResourceSource(resource);
        if (!resolved.ok) return fail(resolved.error, resolved.status === 200 ? 400 : resolved.status);
        documentSource = { kind: "resource", source: resolved.source };
      }
    }

    // --- Quota : consommation atomique AVANT tout travail coûteux (PDF, web, LLM) ---
    const quota = await consumeAiRequest(authUser.id, "chat");
    if (!quota.ok) return quotaExceededResponse();
    const { ticket } = quota;

    let reply: string;
    try {
      let documentText = "";
      if (documentSource) {
        documentText =
          documentSource.kind === "upload"
            ? await extractDocumentText(documentSource.data, DOCUMENT_CONTEXT_CHARS)
            : await readResourceText(documentSource.source, DOCUMENT_CONTEXT_CHARS);
      }

      let webContext = "";
      if (!isGreeting && message.length > 10 && !documentText) {
        webContext = await searchWeb(message);
      }

      const firstName = inlineValue(user.firstName, 40) || "Étudiant";
      const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
        {
          role: "system",
          content: `Tu es le Tuteur IA Expert de l'institut DEFITECH (Lomé, Togo).

PROFIL DE L'ÉTUDIANT :
- Prénom : ${firstName}
- Filière : ${inlineValue(user.field?.name) || "Générale"}
- Niveau : ${inlineValue(user.academicLevel?.name) || "L1"}
- Semestre : ${getCurrentSemester()} (session actuelle)

DIRECTIVES PÉDAGOGIQUES :
1. Adresse-toi à l'étudiant par son prénom (${firstName}).
2. Sois concis, précis et académique. Utilise le Markdown.
3. Pour le code, fournis des explications ligne par ligne.
4. Encourage l'étudiant dans sa réussite à DEFITECH.
5. Si un document est fourni, il est prioritaire sur le reste.

SÉCURITÉ : ${UNTRUSTED_DATA_NOTICE}`,
        },
        ...history,
      ];

      if (documentText) {
        messages.push({
          role: "user",
          content: `Document joint par l'étudiant :\n${wrapUntrusted("document", documentText)}`,
        });
      } else if (webContext) {
        messages.push({
          role: "user",
          content: `Résultats de recherche web récents :\n${wrapUntrusted("web", webContext)}`,
        });
      }
      messages.push({ role: "user", content: message });

      const completion = await chatCompletionWithRotation({
        messages,
        temperature: 0.6,
        maxTokens: 2048,
        totalTimeoutMs: remainingBudgetMs(startedAt),
      });

      reply = completionText(completion);
      await recordAiTokens(ticket, completion.usage?.total_tokens);
    } catch (error) {
      await refundAiRequest(ticket);
      return aiFailureResponse(error, "chat");
    }

    // --- Succès : XP plafonné et alerte de quota bas, sans jamais faire échouer la réponse ---
    try {
      await awardActionXP(authUser.id, "ai_chat");

      if (user.pushToken) {
        const { remaining } = await getAiQuota(authUser.id);
        if (remaining === 2) {
          await sendPushNotification(
            user.pushToken,
            "Quota IA presque épuisé",
            "Il ne vous reste plus que 2 requêtes IA. Pensez à recharger !"
          );
        }
      }
    } catch (error) {
      console.error("[chat] post-traitement:", error instanceof Error ? error.name : "erreur inconnue");
    }

    return NextResponse.json({ reply });
  } catch (error) {
    console.error("[chat] erreur inattendue:", error instanceof Error ? error.name : "erreur inconnue");
    return fail("Désolé, mon système rencontre une difficulté technique.", 500);
  }
}
