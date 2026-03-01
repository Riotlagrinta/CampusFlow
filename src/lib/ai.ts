import Groq from "groq-sdk";

const DEFAULT_MODELS = [
    "llama-3.3-70b-versatile",
    "mixtral-8x7b-32768",
    "llama-3.1-8b-instant"
];

interface AIRequestOptions {
    messages: { role: "system" | "user" | "assistant"; content: string }[];
    temperature?: number;
    response_format?: { type: "json_object" | "text" };
    models?: string[];
}

/**
 * Exécute une requête de chat avec un système de rotation automatique des modèles.
 */
export async function chatCompletionWithRotation(options: AIRequestOptions) {
    if (!process.env.GROQ_API_KEY) {
        throw new Error("GROQ_API_KEY is missing in environment variables.");
    }

    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const models = options.models || DEFAULT_MODELS;

    let lastError = null;

    for (const model of models) {
        try {
            console.log(`[AI Rotation] Tentative avec le modèle : ${model}`);
            const completion = await groq.chat.completions.create({
                messages: options.messages,
                model: model,
                temperature: options.temperature ?? 0.7,
                response_format: options.response_format,
            });

            console.log(`[AI Rotation] ✅ Succès avec ${model}`);
            return completion;
        } catch (err: any) {
            console.warn(`[AI Rotation] ⚠️ Échec avec ${model}: ${err.message}`);
            lastError = err;
            continue;
        }
    }

    throw new Error(`Tous les modèles de la rotation ont échoué. Dernier message : ${lastError?.message}`);
}
