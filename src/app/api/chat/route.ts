import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { addXP } from "@/lib/xp";
import { auth } from "@/../auth";

const DAILY_AI_LIMIT = 30; // Augmenté à 30 pour la classe

export async function POST(req: Request) {
  try {
    console.log("Démarrage requête IA...");
    const session = await auth();
    if (!session || !session.user?.email) {
      console.log("Erreur: Session absente");
      return NextResponse.json({ reply: "Vous devez être connecté pour parler à l'IA." }, { status: 401 });
    }

    const { message } = await req.json();
    console.log("Message reçu, utilisateur:", session.user.email);

    if (!process.env.GEMINI_API_KEY) {
      console.log("Erreur: Clé API manquante");
      return NextResponse.json({ reply: "Le service IA n'est pas configuré (Clé manquante)." }, { status: 500 });
    }

    // Récupérer l'utilisateur
    console.log("Connexion base de données...");
    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) {
      console.log("Erreur: Utilisateur non trouvé en DB");
      return NextResponse.json({ reply: "Utilisateur introuvable." }, { status: 404 });
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
        reply: "Vous avez atteint votre limite personnelle de 30 messages aujourd'hui.",
        quotaExceeded: true
      }, { status: 429 });
    }

    console.log("Appel Google Gemini...");
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) throw new Error("Clé API manquante");

    const genAI = new GoogleGenerativeAI(apiKey);
    
    // Liste des modèles à essayer par ordre de préférence
    const modelsToTry = ["gemini-1.5-flash", "gemini-pro"];
    let text = "";
    let success = false;
    let lastError = null;

    for (const modelName of modelsToTry) {
      try {
        console.log(`Tentative avec le modèle : ${modelName}`);
        const model = genAI.getGenerativeModel({ model: modelName });
        const prompt = `Tu es l'assistant IA de DEFITECH. Réponds à l'étudiant de manière pédagogique.
        Question : ${message}`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        text = response.text();
        success = true;
        console.log(`Succès avec ${modelName}`);
        break; // On sort de la boucle si ça marche
      } catch (err: any) {
        lastError = err;
        console.warn(`Échec avec ${modelName}:`, err.message);
        if (err.status !== 404) break; // Si c'est autre chose qu'un 404 (ex: quota), on arrête
      }
    }

    if (!success) throw lastError;

    console.log("Réponse IA générée avec succès");
    await prisma.dailyAIUsage.update({
      where: { id: dailyUsage.id },
      data: { requestCount: { increment: 1 } },
    });

    if (user) await addXP(user.id, 5);

    return NextResponse.json({ reply: text });
  } catch (error: any) {
    console.error("ERREUR CRITIQUE CHAT:", error);
    return NextResponse.json(
      { reply: `Le service IA rencontre une difficulté technique (${error?.message?.substring(0, 50)}...). Réessayez.` },
      { status: 500 }
    );
  }
}