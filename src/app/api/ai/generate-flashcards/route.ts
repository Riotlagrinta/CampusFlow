import Groq from "groq-sdk";
import { NextResponse } from "next/server";
import { auth } from "@/../auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session || !session.user?.email) return NextResponse.json({ error: "Session expirée" }, { status: 401 });

    const { content, count = 5 } = await req.json();
    if (!content) return NextResponse.json({ error: "Contenu manquant" }, { status: 400 });

    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // Vérification quota (Les Flashcards coûtent 1 jeton par génération)
    const DAILY_AI_LIMIT = 10;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dailyUsage = await prisma.dailyAIUsage.findUnique({
      where: { userId_date: { userId: user.id, date: today } }
    });

    const used = dailyUsage?.requestCount || 0;
    if ((DAILY_AI_LIMIT + user.aiBonusRequests - used) <= 0) {
      return NextResponse.json({ error: "Quota IA épuisé" }, { status: 429 });
    }

    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    const prompt = `Génère ${count} flashcards de révision basées sur le contenu suivant : "${content}".
    Chaque flashcard doit avoir une "question" (recto) et une "reponse" (verso) courte et claire.
    Renvoie UNIQUEMENT un tableau JSON valide au format : [{"question": "...", "reponse": "..."}, ...]`;

    const completion = await groq.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: "llama-3.3-70b-versatile",
      temperature: 0.7,
      response_format: { type: "json_object" } // On force le format JSON si le modèle le supporte (Llama 3+)
    });

    const rawResponse = completion.choices[0]?.message?.content || "[]";
    // Extraire le tableau JSON (parfois l'IA enrobe le JSON dans du texte ou un objet 'flashcards')
    let cards = [];
    try {
        const parsed = JSON.parse(rawResponse);
        cards = Array.isArray(parsed) ? parsed : (parsed.flashcards || []);
    } catch (e) {
        console.error("Erreur parsing Flashcards:", rawResponse);
        // Fallback simple si le format JSON est un peu sale
        return NextResponse.json({ error: "L'IA a généré un format invalide. Réessayez." }, { status: 500 });
    }

    // Déduire 1 requête du quota
    await prisma.dailyAIUsage.upsert({
        where: { userId_date: { userId: user.id, date: today } },
        update: { requestCount: { increment: 1 } },
        create: { userId: user.id, date: today, requestCount: 1 }
    });

    return NextResponse.json({ cards });

  } catch (error: any) {
    console.error("Crash Flashcards API:", error);
    return NextResponse.json({ error: "Erreur technique." }, { status: 500 });
  }
}
