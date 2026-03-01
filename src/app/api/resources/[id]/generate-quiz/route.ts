import { chatCompletionWithRotation } from "@/lib/ai";
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
    const { PDFParse } = require('pdf-parse');
    const { id } = await params;

    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ error: 'Utilisateur introuvable.' }, { status: 404 });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dailyUsage = await prisma.dailyAIUsage.upsert({
      where: { userId_date: { userId: user.id, date: today } },
      update: {},
      create: { userId: user.id, date: today, requestCount: 0 },
    });

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
            // Détection robuste ID et Type (Dossier vs Fichier)
            const folderMatch = resource.url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
            const fileMatch = resource.url.match(/\/d\/([a-zA-Z0-9_-]+)/);
            let idParam = "";
            try {
              idParam = new URL(resource.url).searchParams.get('id') || "";
            } catch { }

            // Si c'est un dossier (via /folders/ ou via l'URL contenant 'folders')
            if (folderMatch || (idParam && resource.url.includes('folders'))) {
              return NextResponse.json({
                isFolder: true,
                error: "Ce lien est un dossier. Veuillez sélectionner un fichier."
              }, { status: 200 });
            }

            // Sinon on cherche l'ID du fichier
            fileId = fileMatch ? fileMatch[1] : idParam;
          }

          if (!fileId) throw new Error("ID Google Drive introuvable");

          // Utilisation de l'API Google Drive officielle pour plus de fiabilité
          const apiKey = process.env.GOOGLE_API_KEY;
          const downloadUrl = apiKey
            ? `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${apiKey}`
            : `https://drive.google.com/uc?export=download&id=${fileId}`;

          const response = await fetch(downloadUrl);

          if (!response.ok) throw new Error("Impossible de télécharger le fichier depuis Drive");

          const buffer = Buffer.from(await response.arrayBuffer());
          const parser = new PDFParse({ data: buffer });
          const result = await parser.getText();
          fullText = result.text.substring(0, 20000);
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
        const parser = new PDFParse({ data: dataBuffer });
        const result = await parser.getText();
        fullText = result.text.substring(0, 20000);
      } catch (err) {
        return NextResponse.json({ error: "Erreur lecture fichier local." }, { status: 500 });
      }
    }

    // Utilisation de la rotation IA centralisée

    const prompt = `Analyse ce texte de cours et génère un quiz pédagogique exhaustif de 15 questions au format JSON uniquement.
    Structure: { "title": "", "description": "", "questions": [{ "question": "", "options": [], "answer": 0 }] }`;

    const completion = await chatCompletionWithRotation({
      messages: [
        { role: "system", content: "Réponds uniquement en JSON valide." },
        { role: "user", content: `Texte: ${fullText}\n\nInstruction: ${prompt}` }
      ],
      temperature: 0.3,
      response_format: { type: "json_object" }
    });

    if (!completion) {
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
