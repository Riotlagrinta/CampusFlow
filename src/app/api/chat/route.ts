import Groq from "groq-sdk";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { addXP } from "@/lib/xp";
import { auth } from "@/../auth";
import fs from 'fs';
import path from 'path';

const DAILY_AI_LIMIT = 5;

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session || !session.user?.email) {
      return NextResponse.json({ reply: "Vous devez être connecté pour parler à l'IA." }, { status: 401 });
    }

    const { message, resourceId } = await req.json();

    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json({ reply: "Le service IA Groq n'est pas configuré (Clé manquante)." }, { status: 500 });
    }

    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ reply: "Utilisateur introuvable." }, { status: 404 });

    // --- LECTURE DU PDF SI PRÉSENT ---
    let resourceContext = "";
    if (resourceId) {
      try {
        const pdfParse = require('pdf-parse');
        const resource = await prisma.resource.findUnique({ where: { id: resourceId } });
        if (resource && resource.type === 'PDF') {
          const filePath = path.join(process.cwd(), 'public', resource.url);
          if (fs.existsSync(filePath)) {
            const dataBuffer = fs.readFileSync(filePath);
            const data = await pdfParse(dataBuffer);
            resourceContext = `CONTENU DU DOCUMENT "${resource.title}" :\n${data.text.substring(0, 10000)}`;
          }
        }
      } catch (err) {
        console.error("Erreur lecture PDF pour Chat:", err);
      }
    }

    // --- LOGIQUE DE QUOTA INTERNE ---
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let dailyUsage = await prisma.dailyAIUsage.findUnique({
      where: { userId_date: { userId: user.id, date: today } },
    });

    if (!dailyUsage) {
      dailyUsage = await prisma.dailyAIUsage.create({
        data: { userId: user.id, date: today, requestCount: 0 },
      });
    }

    if ((DAILY_AI_LIMIT + user.aiBonusRequests - dailyUsage.requestCount) <= 0) {
      return NextResponse.json({
        reply: "Vous avez atteint votre limite personnelle de 5 messages aujourd'hui.",
        quotaExceeded: true
      }, { status: 429 });
    }
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    
    // CHAINE DE ROTATION OPTIMISÉE POUR GROQ 2026
    const models = [
      "llama-3.3-70b-versatile",
      "llama-3.1-70b-versatile",
      "mixtral-8x7b-32768",
      "gemma2-9b-it",
      "llama-3.1-8b-instant"
    ];

    let completion;
    let success = false;
    let lastError;

    for (const modelId of models) {
      try {
        completion = await groq.chat.completions.create({
          messages: [
            {
              role: "system",
              content: `Tu es l'assistant IA officiel de l'institution DEFITECH. Tu accompagnes les étudiants de TOUTES les filières (Génie Logiciel, Réseaux Informatiques, Maintenance, Gestion, etc.).

${resourceContext ? `CONTEXTE DU DOCUMENT JOINT :\n${resourceContext}\n\nUtilise ce contexte pour répondre précisément aux questions de l'étudiant.` : ""}

CAPACITÉS SPÉCIALES :
- Tu peux générer des SCHÉMAS VISUELS (Diagrammes UML, Flux, Base de données, Gantt) en utilisant la syntaxe MERMAID.
- Pour créer un schéma, utilise le bloc de code suivant : \`\`\`mermaid [ton code ici] \`\`\`.
- Privilégie les schémas pour expliquer des concepts complexes.

STYLE DE RÉPONSE :
- Utilise abondamment le **GRAS** pour les termes techniques importants (ils apparaîtront en couleur).
- Utilise des > citations pour les définitions ou les notes importantes.
- Utilise des listes à puces et des titres (H1, H2) pour structurer tes réponses.
- Reste très visuel et pédagogique.`
            },
            { role: "user", content: message }
          ],
          model: modelId,
        });
        success = true;
        break;
      } catch (err: any) {
        lastError = err;
        if (err?.status === 429) continue; // Si limite atteinte, on passe au suivant
        break; 
      }
    }

    if (!success || !completion) throw lastError;

    const text = completion.choices[0]?.message?.content || "Désolé, je ne peux pas répondre pour le moment.";
    const tokensUsed = completion.usage?.total_tokens || 0;

    await prisma.dailyAIUsage.update({
      where: { id: dailyUsage.id },
      data: { 
        requestCount: { increment: 1 },
        tokensUsed: { increment: tokensUsed }
      },
    });

    if (user) await addXP(user.id, 5);

    return NextResponse.json({ reply: text });
  } catch (error: any) {
    console.error("ERREUR IA ROTATION:", error);
    return NextResponse.json(
      { reply: "Le service IA est momentanément indisponible. Veuillez réessayer dans quelques instants." },
      { status: 500 }
    );
  }
}