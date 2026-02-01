import Groq from "groq-sdk";
import { NextResponse } from "next/server";
import fs from 'fs';
import path from 'path';
import { prisma } from '@/lib/prisma';
import { auth } from "@/../auth";

const DAILY_QUIZ_LIMIT = 2;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session || !session.user?.email) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const pdf = require('pdf-parse');
    const { id } = await params;

    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ error: 'Utilisateur introuvable.' }, { status: 404 });

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

    if ((DAILY_QUIZ_LIMIT + user.aiBonusRequests - dailyUsage.quizRequestCount) <= 0) {
      return NextResponse.json({ error: "Quota quizz dépassé.", quotaExceeded: true }, { status: 429 });
    }

    const resource = await prisma.resource.findUnique({ where: { id } });
    if (!resource || resource.type !== 'PDF') {
      return NextResponse.json({ error: 'Fichier PDF non trouvé' }, { status: 404 });
    }

    const filePath = path.join(process.cwd(), 'public', resource.url);
    const dataBuffer = fs.readFileSync(filePath);
    const pdfData = await pdf(dataBuffer);
    const fullText = pdfData.text.substring(0, 20000);

    if (!process.env.GROQ_API_KEY) throw new Error("Clé manquante");
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    
    const prompt = `Analyse ce texte de cours et génère un quiz pédagogique exhaustif de 15 questions au format JSON uniquement.
    Structure: { "title": "", "description": "", "questions": [{ "question": "", "options": [], "answer": 0 }] }`;

    // ROTATION ROBUSTE (Modèles Officiels Groq 2025/2026)
    // 1. Llama 3.3 70B : Le plus intelligent pour la structure JSON complexe.
    // 2. Mixtral 8x7B : Excellent fallback, très stable.
    // 3. Llama 3.1 8B : Rapide, en dernier recours.
    const models = ["llama-3.3-70b-versatile", "mixtral-8x7b-32768", "llama-3.1-8b-instant"];
    let completion;
    let success = false;
    let lastError = null;

    for (const m of models) {
      try {
        console.log(`Tentative génération Quiz avec modèle : ${m}...`);
        completion = await groq.chat.completions.create({
          messages: [
            { role: "system", content: "Réponds uniquement en JSON valide." },
            { role: "user", content: `Texte: ${fullText}\n\nInstruction: ${prompt}` }
          ],
          model: m,
          response_format: { type: "json_object" },
          temperature: 0.3 // Faible température pour garantir le format JSON
        });
        success = true;
        console.log(`✅ Succès avec ${m}`);
        break; // Sortie de boucle si succès
      } catch (err: any) {
        console.warn(`⚠️ Échec avec ${m}:`, err.message);
        lastError = err;
        // On continue vers le prochain modèle de la liste
        continue;
      }
    }

    if (!success || !completion) {
        console.error("Tous les modèles ont échoué.", lastError);
        throw new Error("Service IA temporairement indisponible (Rotation épuisée).");
    }

    const quizData = JSON.parse(completion.choices[0]?.message?.content || "{}");

    const quiz = await prisma.quiz.create({
      data: {
        title: quizData.title,
        description: quizData.description,
        subjectName: resource.subjectName || 'Général',
        subjectId: resource.subjectId,
        resourceId: resource.id,
        questions: {
          create: quizData.questions.map((q: any) => ({
            question: q.question,
            options: JSON.stringify(q.options),
            answer: q.answer
          }))
        }
      }
    });

    await prisma.dailyAIUsage.update({
      where: { id: dailyUsage.id },
      data: { 
        quizRequestCount: { increment: 1 },
        tokensUsed: { increment: completion.usage?.total_tokens || 0 }
      },
    });

    return NextResponse.json({ success: true, quizId: quiz.id });
  } catch (error) {
    console.error('Erreur Quiz IA:', error);
    return NextResponse.json({ error: 'Échec de la génération' }, { status: 500 });
  }
}
