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

    // ROTATION SPECIALISEE QUIZZ (Priorité Compound pour les longs textes)
    const models = ["groq/compound", "openai/gpt-oss-120b", "llama-3.3-70b-versatile"];
    let completion;
    let success = false;

    for (const m of models) {
      try {
        completion = await groq.chat.completions.create({
          messages: [
            { role: "system", content: "Réponds uniquement en JSON valide." },
            { role: "user", content: `Texte: ${fullText}\n\nInstruction: ${prompt}` }
          ],
          model: m,
          response_format: { type: "json_object" }
        });
        success = true;
        break;
      } catch (err: any) {
        if (err?.status === 429) continue;
        break;
      }
    }

    if (!success || !completion) throw new Error("IA Indisponible");

    const quizData = JSON.parse(completion.choices[0]?.message?.content || "{}");

    const quiz = await prisma.quiz.create({
      data: {
        title: quizData.title,
        description: quizData.description,
        subject: resource.subject || 'Général',
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
