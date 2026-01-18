import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { addXP } from "@/lib/xp";
import { auth } from "@/../auth";

const DAILY_AI_LIMIT = 30; // Augmenté à 30 pour la classe

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session || !session.user?.email) {
      return NextResponse.json({ reply: "Vous devez être connecté pour parler à l'IA." }, { status: 401 });
    }

    const { message } = await req.json();

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ reply: "Le service IA n'est pas configuré (Clé manquante)." }, { status: 500 });
    }

    // Récupérer l'utilisateur via la session
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

    const currentQuota = DAILY_AI_LIMIT + user.aiBonusRequests - dailyUsage.requestCount;

    if (currentQuota <= 0) {
      return NextResponse.json({ 
        reply: "Vous avez atteint votre limite personnelle de 30 messages aujourd'hui. Revenez demain !",
        quotaExceeded: true
      }, { status: 429 });
    }

    // Incrémenter l'utilisation
    await prisma.dailyAIUsage.update({
      where: { id: dailyUsage.id },
      data: { requestCount: { increment: 1 } },
    });

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `Tu es l'assistant IA de DEFITECH. Réponds à l'étudiant de manière pédagogique.
    Question : ${message}`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    if (user) await addXP(user.id, 5);

    return NextResponse.json({ reply: text });
  } catch (error: any) {
    console.error("Erreur détaillée API Chat:", error);
    
    return NextResponse.json(
      { reply: "Le service IA est momentanément indisponible. Veuillez réessayer dans quelques instants." },
      { status: 500 }
    );
  }
}