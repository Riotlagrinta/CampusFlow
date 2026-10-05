import Groq from "groq-sdk";
import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { constants as zlibConstants, inflateSync } from "zlib";
import type { PDFParse as PDFParseInstance } from "pdf-parse";
import { prisma } from "@/lib/prisma";

// Isolation des contenus non fiables : module pur (testable sans base), ré-exporté ici.
export { sanitizeUntrusted, wrapUntrusted, UNTRUSTED_DATA_NOTICE } from "@/lib/untrusted";

/* -------------------------------------------------------------------------- */
/*  Modèles                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Modèles essayés dans l'ordre. Les modèles `mixtral-8x7b-32768`, `llama-3.3-70b-versatile` et
 * `llama-3.1-8b-instant` ont été retirés par Groq (404). Liste vérifiée le 05/10/2026 contre
 * GET /openai/v1/models, en chat et en mode JSON. Elle évolue : elle peut être remplacée sans
 * redéploiement de code via la variable d'environnement AI_MODELS (identifiants séparés par des
 * virgules). Les modèles retirés/introuvables sont mis de côté 10 minutes pour ne pas être
 * réessayés à chaque requête.
 */
export const DEFAULT_AI_MODELS = [
  "openai/gpt-oss-120b",
  "qwen/qwen3.8-27b",
  "openai/gpt-oss-20b",
];

const MODEL_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{1,79}$/;
const DEAD_MODEL_TTL_MS = 10 * 60 * 1000;
const deadModels = new Map<string, number>();

export function getAiModels(): string[] {
  const configured = (process.env.AI_MODELS || "")
    .split(",")
    .map((m) => m.trim())
    .filter((m) => MODEL_ID_RE.test(m));
  return configured.length > 0 ? configured : DEFAULT_AI_MODELS;
}

/* -------------------------------------------------------------------------- */
/*  Appel LLM avec rotation                                                    */
/* -------------------------------------------------------------------------- */

export type AiErrorKind = "config" | "unavailable" | "bad_request";

export class AiError extends Error {
  constructor(public readonly kind: AiErrorKind, message: string) {
    super(message);
    this.name = "AiError";
  }
}

interface AIRequestOptions {
  messages: { role: "system" | "user" | "assistant"; content: string }[];
  temperature?: number;
  response_format?: { type: "json_object" | "text" };
  models?: string[];
  /** Plafond de tokens générés (défaut 2048). */
  maxTokens?: number;
  /** Durée maximale d'une tentative (défaut 25 s). */
  attemptTimeoutMs?: number;
  /** Durée totale maximale, toutes tentatives confondues (défaut 45 s). */
  totalTimeoutMs?: number;
}

/** Budget total d'une route IA (maxDuration = 60 s) : temps restant après le travail déjà fait. */
export const AI_ROUTE_BUDGET_MS = 55_000;
export function remainingBudgetMs(startedAt: number, minimum = 10_000): number {
  return Math.max(minimum, AI_ROUTE_BUDGET_MS - (Date.now() - startedAt));
}

interface ErrorInfo {
  status?: number;
  code?: string;
  aborted: boolean;
  message: string;
}

function describeError(err: unknown): ErrorInfo {
  const e = err as {
    name?: string;
    status?: number;
    code?: string;
    message?: string;
    error?: { code?: string; message?: string; error?: { code?: string; message?: string } };
  };
  const body = e?.error?.error ?? e?.error;
  return {
    status: typeof e?.status === "number" ? e.status : undefined,
    code: body?.code ?? (typeof e?.code === "string" ? e.code : undefined),
    aborted: e?.name === "AbortError" || e?.name === "APIUserAbortError" || e?.name === "APIConnectionTimeoutError",
    message: String(body?.message ?? e?.message ?? ""),
  };
}

const MODEL_GONE_CODES = new Set(["model_decommissioned", "model_not_found", "model_not_active"]);
const MODEL_GONE_RE = /decommission|no longer supported|does not exist|not found|deprecated/i;

/** Faut-il essayer le modèle suivant ? Les 400 (requête invalide) ne sont jamais réessayés. */
function classify(info: ErrorInfo): { retryNext: boolean; modelGone: boolean } {
  const { status, code, message } = info;
  const modelGone =
    status === 404 ||
    (!!code && MODEL_GONE_CODES.has(code)) ||
    (status === 400 && MODEL_GONE_RE.test(message));

  if (modelGone) return { retryNext: true, modelGone: true };
  if (status === 400) return { retryNext: code === "json_validate_failed", modelGone: false };
  if (status === 401) return { retryNext: false, modelGone: false };
  if (status === 403) return { retryNext: /model/i.test(code ?? ""), modelGone: false };
  // 408, 409, 413, 429, 5xx, délai dépassé, erreur réseau : un autre modèle peut répondre.
  return { retryNext: true, modelGone: false };
}

/**
 * Requête de chat avec rotation automatique des modèles, timeout par tentative et plafond de
 * tokens. Lève AiError (jamais de fuite de clé ni de contenu dans les journaux).
 */
export async function chatCompletionWithRotation(options: AIRequestOptions) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new AiError("config", "GROQ_API_KEY manquante");

  // maxRetries: 0 — la rotation fait office de nouvelle tentative, avec un budget temps maîtrisé.
  const groq = new Groq({ apiKey, maxRetries: 0 });

  const requested = options.models && options.models.length > 0 ? options.models : getAiModels();
  const now = Date.now();
  const alive = requested.filter((m) => (deadModels.get(m) ?? 0) <= now);
  const candidates = alive.length > 0 ? alive : requested;

  const startedAt = now;
  const totalMs = options.totalTimeoutMs ?? 45_000;
  const attemptMs = options.attemptTimeoutMs ?? 25_000;

  let lastStatus: number | undefined;

  for (const model of candidates) {
    const remaining = totalMs - (Date.now() - startedAt);
    if (remaining < 2_000) break;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(attemptMs, remaining));

    try {
      const completion = await groq.chat.completions.create(
        {
          messages: options.messages,
          model,
          temperature: options.temperature ?? 0.7,
          max_completion_tokens: options.maxTokens ?? 2048,
          response_format: options.response_format,
        },
        { signal: controller.signal, maxRetries: 0 }
      );

      const content = completion.choices?.[0]?.message?.content;
      if (!content || !content.trim()) {
        // Réponse vide (ex. budget de tokens épuisé par un modèle à raisonnement) : modèle suivant.
        console.warn(`[ai] réponse vide du modèle ${model}`);
        continue;
      }
      return completion;
    } catch (err) {
      const info = describeError(err);
      const verdict = classify(info);
      lastStatus = info.status;
      // Aucun contenu de requête ni message brut dans les journaux : statut et code seulement.
      console.warn(
        `[ai] échec modèle ${model} (statut ${info.status ?? (info.aborted ? "timeout" : "réseau")}${info.code ? `, ${info.code}` : ""})`
      );

      if (verdict.modelGone) deadModels.set(model, Date.now() + DEAD_MODEL_TTL_MS);
      if (!verdict.retryNext) {
        throw new AiError(
          info.status === 400 ? "bad_request" : "config",
          `Requête IA refusée (statut ${info.status ?? "?"})`
        );
      }
    } finally {
      clearTimeout(timer);
    }
  }

  throw new AiError(
    "unavailable",
    `Service IA indisponible (dernier statut ${lastStatus ?? "inconnu"})`
  );
}

export function completionText(completion: { choices?: { message?: { content?: string | null } }[] }): string {
  return completion.choices?.[0]?.message?.content?.trim() ?? "";
}

/* -------------------------------------------------------------------------- */
/*  Utilitaires de prompt / JSON                                               */
/* -------------------------------------------------------------------------- */

/** Valeur courte et sans retour à la ligne, pour insertion dans un prompt. */
export function inlineValue(value: string | null | undefined, max = 60): string {
  return (value ?? "").replace(/[\r\n\t]+/g, " ").replace(/[<>`]/g, "").trim().slice(0, max);
}

/** Extrait un JSON d'une réponse de LLM (enrobage ```json, texte autour). null si illisible. */
export function parseLlmJson(raw: string): unknown | null {
  const text = raw.trim();
  const candidates: string[] = [text];

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) candidates.push(fenced[1].trim());

  const start = text.search(/[[{]/);
  if (start >= 0) {
    const closer = text[start] === "[" ? "]" : "}";
    const end = text.lastIndexOf(closer);
    if (end > start) candidates.push(text.slice(start, end + 1));
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // essai suivant
    }
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/*  Documents (PDF) : accès, téléchargement, extraction                        */
/* -------------------------------------------------------------------------- */

/** Plafond des PDF téléchargés (Blob, Drive). */
export const MAX_PDF_BYTES = 10 * 1024 * 1024;
/**
 * Plafond d'un PDF envoyé directement par l'utilisateur (chat) : Vercel refuse les corps de
 * requête > 4,5 Mo, une limite plus haute ne pourrait jamais être atteinte.
 */
export const MAX_UPLOAD_PDF_BYTES = 4 * 1024 * 1024;
/** Plafond des PDF déjà hébergés sur le serveur (lecture disque, pas de téléchargement). */
const MAX_LOCAL_PDF_BYTES = 30 * 1024 * 1024;
/** Plafond de pages lues : l'extraction s'arrête aussi dès que `maxChars` de texte sont réunis. */
export const MAX_PDF_PAGES = 40;
/** Budget de temps de l'extraction du texte d'un PDF (analyse + lecture des pages). */
export const PDF_EXTRACT_TIMEOUT_MS = 15_000;
/** Temps laissé à `destroy()` du parseur avant d'abandonner (ne doit jamais retarder la réponse). */
const PDF_DESTROY_TIMEOUT_MS = 2_000;
/** Taille décompressée maximale d'un flux Flate d'un PDF, et de tous les flux réunis. */
export const MAX_PDF_STREAM_INFLATED_BYTES = 64 * 1024 * 1024;
export const MAX_PDF_TOTAL_INFLATED_BYTES = 128 * 1024 * 1024;
const REMOTE_TIMEOUT_MS = 15_000;
const PDF_MAGIC = "%PDF-";
const PDF_TOO_COMPLEX =
  "Ce PDF est trop complexe ou trop lourd à analyser. Essayez une version plus simple (texte sélectionnable, moins de pages).";

/* ----- Corps de requête borné ---------------------------------------------- */

export type DeclaredLengthCheck = { ok: true } | { ok: false; status: 400 | 411 | 413; error: string };

/**
 * Valide l'en-tête `Content-Length` AVANT de lire le corps. Avec `required`, une requête sans
 * longueur déclarée (corps envoyé en morceaux) est refusée (411) ; une valeur non numérique donne
 * 400 ; au-dessus de `maxBytes`, 413 avec `tooLargeMessage`.
 */
export function checkDeclaredLength(
  header: string | null,
  maxBytes: number,
  opts: { required: boolean; tooLargeMessage: string }
): DeclaredLengthCheck {
  const value = header?.trim() ?? "";
  if (value === "") {
    return opts.required
      ? { ok: false, status: 411, error: "Taille de la requête manquante (Content-Length requis)." }
      : { ok: true };
  }
  if (!/^\d{1,15}$/.test(value)) return { ok: false, status: 400, error: "En-tête Content-Length invalide." };
  if (Number(value) > maxBytes) return { ok: false, status: 413, error: opts.tooLargeMessage };
  return { ok: true };
}

/**
 * Lit un corps de requête en flux avec un compteur d'octets : dès que `maxBytes` est franchi, la
 * lecture est annulée et `null` est renvoyé (même si Content-Length a menti ou est absent).
 * Une erreur de flux (client déconnecté) est propagée.
 */
export async function readBodyCapped(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number
): Promise<Buffer | null> {
  if (!body) return Buffer.alloc(0);

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks, total);
}

/* ----- Budget de temps ----------------------------------------------------- */

export class TimeoutError extends Error {
  constructor() {
    super("délai dépassé");
    this.name = "TimeoutError";
  }
}

/**
 * Attend `work` au plus `ms` millisecondes. À l'expiration, `onTimeout` est appelé (pour annuler
 * le travail en cours) puis TimeoutError est levée ; le travail abandonné ne peut plus produire
 * de rejet non géré.
 */
export function raceWithTimeout<T>(work: Promise<T>, ms: number, onTimeout?: () => void): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      try {
        onTimeout?.();
      } finally {
        reject(new TimeoutError());
      }
    }, ms);
  });
  work.catch(() => undefined);
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

/** Identifiant de fichier Google Drive : validé avant toute injection dans une URL. */
export const DRIVE_FILE_ID_RE = /^[A-Za-z0-9_-]{10,80}$/;

/** Erreur dont le message est destiné à l'utilisateur. */
export class DocumentError extends Error {
  constructor(message: string, public readonly status: number = 400) {
    super(message);
    this.name = "DocumentError";
  }
}

/**
 * Réponse d'erreur commune des routes IA, à renvoyer APRÈS refundAiRequest.
 * Un DocumentError garde son message/statut ; tout le reste devient un 503 générique
 * (rien de technique n'est exposé, rien d'utilisateur n'est journalisé).
 */
export function aiFailureResponse(error: unknown, context: string): NextResponse {
  if (error instanceof DocumentError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const detail =
    error instanceof AiError ? `${error.kind} - ${error.message}` : error instanceof Error ? error.name : "erreur inconnue";
  console.error(`[${context}] échec IA: ${detail}`);

  return NextResponse.json(
    {
      error:
        "Le service IA est momentanément indisponible. Votre requête n'a pas été décomptée, réessayez dans un instant.",
    },
    { status: 503 }
  );
}

/** URL Vercel Blob publique : https, hôte exact `<store>.public.blob.vercel-storage.com`. */
export function isVercelBlobUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return (
      u.protocol === "https:" &&
      u.port === "" &&
      !u.username &&
      !u.password &&
      /^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/i.test(u.hostname)
    );
  } catch {
    return false;
  }
}

async function readBodyLimited(res: Response, maxBytes: number): Promise<Buffer> {
  const tooBig = () => new DocumentError("Le fichier dépasse la taille maximale (10 Mo).", 413);

  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw tooBig();

  if (!res.body) {
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > maxBytes) throw tooBig();
    return buf;
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw tooBig();
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

async function fetchRemoteBuffer(url: string, redirect: "follow" | "error"): Promise<Buffer> {
  let res: Response;
  try {
    res = await fetch(url, { redirect, signal: AbortSignal.timeout(REMOTE_TIMEOUT_MS) });
  } catch {
    throw new DocumentError("Impossible de télécharger le document (délai dépassé ou lien inaccessible).", 502);
  }
  if (!res.ok) {
    throw new DocumentError("Impossible de télécharger le document (accès refusé ou lien introuvable).", 502);
  }
  return readBodyLimited(res, MAX_PDF_BYTES);
}

/** Vrai si le contenu commence par la signature `%PDF-` (indépendamment du type MIME déclaré). */
export function hasPdfMagic(data: Uint8Array): boolean {
  if (data.length < PDF_MAGIC.length) return false;
  for (let i = 0; i < PDF_MAGIC.length; i++) {
    if (data[i] !== PDF_MAGIC.charCodeAt(i)) return false;
  }
  return true;
}

function normalizePdfText(text: string): string {
  return text
    .replace(/\r/g, "")
    .replace(/^-- \d+ of \d+ --$/gm, "")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Détecte les « bombes de décompression » les plus courantes : un flux Flate qui se décompresse
 * en centaines de Mo (un flux de 400 Ko peut produire 400 Mo, ~700 Mo de mémoire dans pdf.js).
 * Chaque flux `stream ... endstream` de type zlib est décompressé avec un plafond de sortie
 * (`perStream`, et `total` pour l'ensemble) : `true` si l'un des plafonds est franchi.
 *
 * Heuristique de défense en profondeur, pas une garantie : les chaînes de filtres
 * (ASCII85 puis Flate), les flux chiffrés ou une structure volontairement tordue y échappent.
 * Les flux tronqués sont décompressés jusqu'au bout de ce qui existe (Z_SYNC_FLUSH).
 */
export function pdfInflatesTooMuch(
  data: Uint8Array,
  limits: { perStream?: number; total?: number; scanBudgetMs?: number } = {}
): boolean {
  const perStream = limits.perStream ?? MAX_PDF_STREAM_INFLATED_BYTES;
  const totalCap = limits.total ?? MAX_PDF_TOTAL_INFLATED_BYTES;
  const deadline = Date.now() + (limits.scanBudgetMs ?? 3_000);

  const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  let inflated = 0;
  let from = 0;

  for (;;) {
    if (Date.now() > deadline) return false;
    const keyword = buf.indexOf("stream", from, "latin1");
    if (keyword === -1) return false;
    from = keyword + 6;
    // « endstream » contient « stream » : seul le mot-clé d'ouverture nous intéresse.
    if (keyword >= 3 && buf.toString("latin1", keyword - 3, keyword) === "end") continue;

    let start = from;
    if (buf[start] === 0x0d) start++;
    if (buf[start] === 0x0a) start++;
    let end = buf.indexOf("endstream", start, "latin1");
    if (end === -1) end = buf.length;
    from = end;

    // En-tête zlib (CMF = 0x78 en pratique, CMF*256+FLG multiple de 31) : évite d'essayer
    // de décompresser des images JPEG ou des flux bruts.
    if (end - start < 8 || (buf[start] & 0x0f) !== 8 || ((buf[start] << 8) | buf[start + 1]) % 31 !== 0) continue;

    try {
      const out = inflateSync(buf.subarray(start, end), {
        maxOutputLength: Math.min(perStream, totalCap - inflated + 1),
        finishFlush: zlibConstants.Z_SYNC_FLUSH,
      });
      inflated += out.length;
    } catch (err) {
      if ((err as { code?: string }).code === "ERR_BUFFER_TOO_LARGE") return true;
      // flux corrompu ou non Flate : pdf.js le gérera (ou échouera) lui-même
    }
    if (inflated > totalCap) return true;
  }
}

/**
 * Lit les pages une à une (`partial`) : on s'arrête dès que `maxChars` de texte sont réunis, au
 * plafond de pages, ou quand le budget de temps a été dépassé (`state.cancelled`).
 */
async function readPdfPages(
  parser: PDFParseInstance,
  maxChars: number,
  state: { cancelled: boolean }
): Promise<string> {
  const parts: string[] = [];
  let totalPages = 1; // connu après la première page
  let text = "";

  for (let page = 1; page <= Math.min(totalPages, MAX_PDF_PAGES); page++) {
    if (state.cancelled) break;
    // Objet de paramètres neuf à chaque appel : pdf-parse le modifie.
    const result = await parser.getText({ partial: [page], cellSeparator: " " });
    totalPages = result.total;
    // Plafond par page : un seul feuillet ne doit pas faire gonfler la mémoire du texte.
    parts.push((result.pages[0]?.text ?? "").slice(0, maxChars * 4));
    text = normalizePdfText(parts.join("\n\n"));
    if (text.length >= maxChars) break;
  }
  return text.slice(0, maxChars);
}

/**
 * Texte d'un PDF (pdf-parse 2.x : classe PDFParse, plus de fonction par défaut).
 * Toute erreur, tout dépassement de budget (temps, taille décompressée) est converti en
 * DocumentError 422 : l'appelant rembourse alors le quota.
 *
 * Risque résiduel : l'analyse s'exécute dans le même processus que la route. Le contrôle de
 * décompression et le budget de temps limitent les cas courants, mais un PDF forgé pour les
 * contourner peut encore consommer de la mémoire/du CPU jusqu'à la limite de l'instance
 * (mémoire de la fonction Vercel, `maxDuration`). Un vrai cloisonnement exigerait un worker
 * séparé à mémoire plafonnée (`resourceLimits`) ou un service d'extraction externe.
 */
export async function extractPdfText(
  data: Buffer,
  maxChars: number,
  timeoutMs: number = PDF_EXTRACT_TIMEOUT_MS
): Promise<string> {
  if (!hasPdfMagic(data)) {
    throw new DocumentError("Le fichier n'est pas un PDF valide.", 422);
  }
  if (pdfInflatesTooMuch(data)) {
    console.error("[pdf] refusé : taille décompressée excessive");
    throw new DocumentError(PDF_TOO_COMPLEX, 422);
  }

  let parser: PDFParseInstance | null = null;
  const state = { cancelled: false };
  try {
    const { PDFParse } = await import("pdf-parse");
    // Copie : pdf.js peut transférer (et donc détacher) le tampon qu'on lui donne.
    const instance = new PDFParse({ data: new Uint8Array(data) });
    parser = instance;
    return await raceWithTimeout(readPdfPages(instance, maxChars, state), timeoutMs, () => {
      state.cancelled = true;
    });
  } catch (err) {
    if (err instanceof TimeoutError) {
      console.error("[pdf] extraction interrompue : budget de temps dépassé");
      throw new DocumentError(PDF_TOO_COMPLEX, 422);
    }
    console.error("[pdf] extraction impossible:", err instanceof Error ? err.name : "erreur inconnue");
    throw new DocumentError("Impossible de lire ce PDF (fichier corrompu, protégé ou illisible).", 422);
  } finally {
    // destroy() interrompt le travail en cours ; borné pour ne jamais retarder la réponse.
    if (parser) await raceWithTimeout(parser.destroy(), PDF_DESTROY_TIMEOUT_MS).catch(() => undefined);
  }
}

/**
 * Texte d'un PDF déjà en mémoire (envoi direct ou téléchargement) : extraction puis refus des
 * documents sans texte exploitable. Rien n'est écrit sur disque.
 */
export async function extractDocumentText(data: Buffer, maxChars: number): Promise<string> {
  const text = await extractPdfText(data, maxChars);
  if (text.length < 20) {
    throw new DocumentError("Le document semble vide ou illisible (PDF scanné sans texte ?).", 422);
  }
  return text;
}

/* ----- Accès aux ressources ------------------------------------------------ */

export interface ResourceAccessUser {
  role: string;
  fieldId: string | null;
  academicLevelId: string | null;
}

/**
 * Même règle que GET /api/resources : ADMIN, ressource commune (sans filière ni niveau), ou
 * filière + niveau de l'utilisateur (GL et RIT partagent un tronc commun).
 */
export async function canAccessResource(
  user: ResourceAccessUser,
  resource: { fieldId: string | null; levelId: string | null }
): Promise<boolean> {
  if (user.role === "ADMIN") return true;
  if (resource.fieldId === null && resource.levelId === null) return true;
  if (!user.fieldId || resource.levelId !== user.academicLevelId) return false;

  const userField = await prisma.field.findUnique({ where: { id: user.fieldId }, select: { code: true } });
  if (userField?.code === "GL" || userField?.code === "RIT") {
    const shared = await prisma.field.findMany({
      where: { code: { in: ["GL", "RIT"] } },
      select: { id: true },
    });
    return !!resource.fieldId && shared.some((f) => f.id === resource.fieldId);
  }
  return resource.fieldId === user.fieldId;
}

export type ResourceSource =
  | { kind: "drive"; fileId: string }
  | { kind: "blob"; url: string }
  | { kind: "local"; relativePath: string };

export type SourceResolution =
  | { ok: true; source: ResourceSource }
  | { ok: false; status: number; error: string; isFolder?: boolean };

function isDriveHost(hostname: string): boolean {
  return hostname === "drive.google.com" || hostname === "docs.google.com";
}

/**
 * Détermine, sans I/O, d'où lire le PDF d'une ressource : Google Drive (fichier public),
 * Vercel Blob ou fichier local. Rapide : à appeler AVANT de consommer du quota.
 */
export function resolveResourceSource(
  resource: { url: string; type: string },
  driveFileId?: string | null
): SourceResolution {
  if (driveFileId != null && !DRIVE_FILE_ID_RE.test(driveFileId)) {
    return { ok: false, status: 400, error: "Identifiant de fichier Drive invalide." };
  }

  if (/^https?:\/\//i.test(resource.url)) {
    let parsed: URL;
    try {
      parsed = new URL(resource.url);
    } catch {
      return { ok: false, status: 400, error: "Lien de la ressource invalide." };
    }

    if (isDriveHost(parsed.hostname)) {
      let fileId = driveFileId ?? "";
      if (!fileId) {
        const idParam = parsed.searchParams.get("id") || "";
        const folderMatch = parsed.pathname.match(/\/folders\/([A-Za-z0-9_-]+)/);
        if (folderMatch || (idParam && parsed.pathname.includes("folders"))) {
          return {
            ok: false,
            status: 200,
            isFolder: true,
            error: "Ce lien est un dossier. Veuillez sélectionner un fichier dans ce dossier.",
          };
        }
        const fileMatch = parsed.pathname.match(/\/d\/([A-Za-z0-9_-]+)/);
        fileId = fileMatch ? fileMatch[1] : idParam;
      }
      if (!DRIVE_FILE_ID_RE.test(fileId)) {
        return { ok: false, status: 400, error: "Identifiant Google Drive introuvable ou invalide dans ce lien." };
      }
      return { ok: true, source: { kind: "drive", fileId } };
    }

    if (isVercelBlobUrl(resource.url)) {
      if (resource.type !== "PDF") {
        return { ok: false, status: 400, error: "L'analyse IA n'est disponible que pour les documents PDF." };
      }
      return { ok: true, source: { kind: "blob", url: resource.url } };
    }

    return {
      ok: false,
      status: 400,
      error: "L'analyse IA n'est supportée que pour les fichiers de la plateforme et Google Drive (public).",
    };
  }

  if (resource.type !== "PDF") {
    return { ok: false, status: 400, error: "L'analyse IA n'est disponible que pour les documents PDF." };
  }
  return { ok: true, source: { kind: "local", relativePath: resource.url } };
}

async function readLocalPublicFile(relativePath: string): Promise<Buffer> {
  const publicDir = path.resolve(process.cwd(), "public");
  const target = path.resolve(publicDir, relativePath.replace(/^[/\\]+/, ""));
  // Le chemin résolu doit rester dans /public (pas de traversée ../).
  if (!target.startsWith(publicDir + path.sep)) {
    throw new DocumentError("Chemin de fichier invalide.", 400);
  }

  try {
    const stat = await fs.stat(target);
    if (!stat.isFile()) throw new Error("not a file");
    if (stat.size > MAX_LOCAL_PDF_BYTES) throw new DocumentError("Le fichier dépasse la taille maximale (30 Mo).", 413);
    return await fs.readFile(target);
  } catch (err) {
    if (err instanceof DocumentError) throw err;
    throw new DocumentError("Fichier introuvable sur le serveur.", 404);
  }
}

/** Télécharge/lit le PDF de la source et en extrait le texte (tronqué à maxChars). */
export async function readResourceText(source: ResourceSource, maxChars: number): Promise<string> {
  let buffer: Buffer;

  if (source.kind === "drive") {
    const key = process.env.GOOGLE_API_KEY;
    // fileId validé par DRIVE_FILE_ID_RE : aucune injection possible dans le chemin ou la requête.
    const url = key
      ? `https://www.googleapis.com/drive/v3/files/${source.fileId}?alt=media&key=${encodeURIComponent(key)}`
      : `https://drive.google.com/uc?export=download&id=${source.fileId}`;
    buffer = await fetchRemoteBuffer(url, "follow");
  } else if (source.kind === "blob") {
    buffer = await fetchRemoteBuffer(source.url, "error");
  } else {
    buffer = await readLocalPublicFile(source.relativePath);
  }

  return extractDocumentText(buffer, maxChars);
}
