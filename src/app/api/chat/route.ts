import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { addXP } from "@/lib/xp";

const DAILY_AI_LIMIT = 10; // Limite par défaut
const BONUS_PER_AD = 5; // Requêtes gagnées par pub

export async function POST(req: Request) {
  try {
    const { message, email } = await req.json();

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ reply: "Clé API manquante." }, { status: 500 });
    }

    // Récupérer l'utilisateur
    const user = email ? await prisma.user.findUnique({ where: { email } }) : null;
    if (!user) return NextResponse.json({ reply: "Utilisateur introuvable pour le quota." }, { status: 404 });

    // --- LOGIQUE DE QUOTA ---
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Début de journée

    let dailyUsage = await prisma.dailyAIUsage.findUnique({
      where: {
        userId_date: {
          userId: user.id,
          date: today,
        },
      },
    });

    // Si pas d'enregistrement pour aujourd'hui, on le crée
    if (!dailyUsage) {
      dailyUsage = await prisma.dailyAIUsage.create({
        data: {
          userId: user.id,
          date: today,
          requestCount: 0,
        },
      });
    }

    const currentQuota = DAILY_AI_LIMIT + user.aiBonusRequests - dailyUsage.requestCount;

    if (currentQuota <= 0) {
      return NextResponse.json({ 
        reply: "Quota IA journalier dépassé. Regardez une pub pour des requêtes supplémentaires ou attendez demain.",
        quotaExceeded: true
      }, { status: 429 });
    }

    // Incrémenter l'utilisation
    await prisma.dailyAIUsage.update({
      where: { id: dailyUsage.id },
      data: { requestCount: { increment: 1 } },
    });
    // --- FIN LOGIQUE DE QUOTA ---

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    // Tentative avec un modèle Gemini
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `Tu es l'assistant IA de DEFITECH. Réponds à l'étudiant de manière pédagogique.
    Question : ${message}`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Bonus XP automatique (+5 XP)
    if (user) await addXP(user.id, 5);

    return NextResponse.json({ reply: text });
  } catch (error: unknown) {
    console.error("Erreur API:", error);
    
    // Si Gemma échoue aussi, on renvoie un message clair sur le quota
    const status = (error as { status?: number })?.status || 500;
    return NextResponse.json(
      { reply: "Désolé, les quotas gratuits de Google pour ta clé API sont épuisés (Error 429). Tu peux essayer de créer une nouvelle clé sur Google AI Studio ou attendre demain." },
      { status }
    );
  }
}