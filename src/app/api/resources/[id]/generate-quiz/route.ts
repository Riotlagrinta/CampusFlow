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
    if (!user) {
      return NextResponse.json({ error: 'Utilisateur introuvable.' }, { status: 404 });
    }

    // --- LOGIQUE DE QUOTA QUIZ ---
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

    const currentQuizQuota = DAILY_QUIZ_LIMIT + user.aiBonusRequests - dailyUsage.quizRequestCount;

    if (currentQuizQuota <= 0) {
      return NextResponse.json({ 
        error: "Quota de génération de quiz journalier dépassé.",
        quotaExceeded: true
      }, { status: 429 });
    }

    await prisma.dailyAIUsage.update({
      where: { id: dailyUsage.id },
      data: { quizRequestCount: { increment: 1 } },
    });
    
    const resource = await prisma.resource.findUnique({ where: { id } });
    if (!resource || resource.type !== 'PDF') {
      return NextResponse.json({ error: 'Fichier PDF non trouvé' }, { status: 404 });
    }

    const filePath = path.join(process.cwd(), 'public', resource.url);
    const dataBuffer = fs.readFileSync(filePath);
    const pdfData = await pdf(dataBuffer);
    const fullText = pdfData.text.substring(0, 20000);

    if (!process.env.GROQ_API_KEY) {
      throw new Error("GROQ_API_KEY manquante");
    }

    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    
    const prompt = `Analyse ce texte de cours et génère un quiz pédagogique exhaustif de 15 questions au format JSON uniquement.
    Le JSON doit suivre cette structure exacte:
    {
      "title": "Titre du Quiz",
      "description": "Brève description",
      "questions": [
        {
          "question": "Texte de la question ?",
          "options": ["Choix 1", "Choix 2", "Choix 3", "Choix 4"],
          "answer": 0 
        }
      ]
    }
    L'index "answer" correspond à la bonne réponse (0 à 3).
    Assure-toi que les questions couvrent l'ensemble du texte fourni.
    Génère exactement 15 questions basées sur ce texte:
    
    ${fullText}`;

    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: "Tu es un expert en pédagogie. Réponds TOUJOURS uniquement avec du JSON valide."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      model: "llama-3.3-70b-versatile",
      response_format: { type: "json_object" }
    });

    const quizData = JSON.parse(completion.choices[0]?.message?.content || "{}");

    const quiz = await prisma.quiz.create({
      data: {
        title: quizData.title,
        description: quizData.description,
        subject: resource.subject || 'Général',
        resourceId: resource.id,
        xpReward: 100,
        questions: {
          create: quizData.questions.map((q: any) => ({
            question: q.question,
            options: JSON.stringify(q.options),
            answer: q.answer
          }))
        }
      }
    });

    return NextResponse.json({ success: true, quizId: quiz.id });
  } catch (error) {
    console.error('Erreur Génération Quiz:', error);
    return NextResponse.json({ error: 'Échec de la génération automatique' }, { status: 500 });
  }
}