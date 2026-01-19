import Groq from "groq-sdk";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { addXP } from "@/lib/xp";
import { auth } from "@/../auth";

const DAILY_AI_LIMIT = 5;

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session || !session.user?.email) {
      return NextResponse.json({ reply: "Vous devez être connecté pour parler à l'IA." }, { status: 401 });
    }

    const { message } = await req.json();

    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json({ reply: "Le service IA Groq n'est pas configuré (Clé manquante)." }, { status: 500 });
    }

    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ reply: "Utilisateur introuvable." }, { status: 404 });

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
    
    // CHAINE DE ROTATION 2025 (Basée sur votre liste)
    const models = [
      "openai/gpt-oss-120b",
      "moonshotai/kimi-k2-instruction",
      "llama-3.3-70b-versatile",
      "groq/compound",
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
              content: "Tu es l'assistant IA officiel de l'institution DEFITECH. Tu accompagnes les étudiants de TOUTES les filières (Génie Logiciel, Réseaux Informatiques, Maintenance, Gestion, etc.). Réponds de manière pédagogique, précise et adaptée au niveau académique de l'étudiant."
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