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

    const { driveFileId } = await req.json(); // Optionnel : ID d'un fichier dans un dossier
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
    if (!resource) {
      return NextResponse.json({ error: 'Ressource non trouvée' }, { status: 404 });
    }

    let fullText = "";
    
    // 1. GESTION DES LIENS EXTERNES (Google Drive)
    if (resource.url.startsWith('http')) {
        if (resource.url.includes('drive.google.com')) {
            try {
                let fileId = driveFileId;

                if (!fileId) {
                  // Check for Folders
                  if (resource.url.includes('/folders/')) {
                      return NextResponse.json({ 
                          isFolder: true,
                          error: "Ce lien est un dossier. Veuillez sélectionner un fichier." 
                      }, { status: 200 });
                  }

                  const match = resource.url.match(/\/d\/(.+?)\//);
                  if (match) fileId = match[1];
                  else {
                      const urlParams = new URL(resource.url).searchParams;
                      fileId = urlParams.get('id') || "";
                  }
                }

                if (!fileId) throw new Error("ID Google Drive introuvable");

                const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
                const response = await fetch(downloadUrl);
                
                if (!response.ok) throw new Error("Impossible de télécharger le fichier depuis Drive");

                const buffer = Buffer.from(await response.arrayBuffer());
                const data = await pdf(buffer);
                fullText = data.text.substring(0, 20000);
            } catch (err) {
                console.error("Erreur Drive:", err);
                return NextResponse.json({ error: "Impossible de lire ce lien Drive pour générer le quiz. Assurez-vous qu'il est public (Tous les utilisateurs disposant du lien)." }, { status: 400 });
            }
        } else {
             return NextResponse.json({ error: "La génération de quiz n'est supportée que pour les fichiers locaux et Google Drive (Public)." }, { status: 400 });
        }
    } else {
        // 2. GESTION DES FICHIERS LOCAUX
        if (resource.type !== 'PDF') {
            return NextResponse.json({ error: 'Fichier PDF non trouvé (Seuls les PDF sont supportés)' }, { status: 404 });
        }
        
        try {
            const filePath = path.join(process.cwd(), 'public', resource.url);
            if (!fs.existsSync(filePath)) throw new Error("Fichier introuvable");
            
            const dataBuffer = fs.readFileSync(filePath);
            const pdfData = await pdf(dataBuffer);
            fullText = pdfData.text.substring(0, 20000);
        } catch (err) {
             return NextResponse.json({ error: "Erreur lecture fichier local." }, { status: 500 });
        }
    }

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
