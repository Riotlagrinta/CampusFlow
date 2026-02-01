import Groq from "groq-sdk";
import { NextResponse } from "next/server";
import fs from 'fs';
import path from 'path';
import { prisma } from '@/lib/prisma';
import { auth } from "@/../auth";

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

    const resource = await prisma.resource.findUnique({ where: { id } });
    if (!resource || resource.type !== 'PDF') {
      return NextResponse.json({ error: 'Fichier PDF non trouvé' }, { status: 404 });
    }

    const filePath = path.join(process.cwd(), 'public', resource.url);
    const dataBuffer = fs.readFileSync(filePath);
    const pdfData = await pdf(dataBuffer);
    const fullText = pdfData.text.substring(0, 15000);

    if (!process.env.GROQ_API_KEY) throw new Error("Clé manquante");
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    // ROTATION ROBUSTE (Explication)
    // 1. Mixtral : Excellent pour le texte fluide et pédagogique.
    // 2. Llama 3.3 : Plus rigoureux si Mixtral échoue.
    const models = ["mixtral-8x7b-32768", "llama-3.3-70b-versatile", "llama-3.1-8b-instant"];
    let completion;
    let success = false;
    let lastError = null;

    for (const m of models) {
      try {
        console.log(`Tentative explication avec modèle : ${m}...`);
        completion = await groq.chat.completions.create({
          messages: [
            {
              role: "system",
              content: "Tu es un professeur expert de l'institution DEFITECH. Ton rôle est d'expliquer le contenu du document fourni par l'étudiant de manière claire, pédagogique et structurée. Utilise du Markdown pour la mise en forme (Titres, Listes, Gras)."
            },
            {
              role: "user",
              content: `Document : ${resource.title}\n\nContenu :\n${fullText}`
            }
          ],
          model: m,
          temperature: 0.5
        });
        success = true;
        console.log(`✅ Succès avec ${m}`);
        break;
      } catch (err: any) {
        console.warn(`⚠️ Échec avec ${m}:`, err.message);
        lastError = err;
        continue;
      }
    }

    if (!success || !completion) {
        throw new Error("IA Indisponible (Toutes les tentatives ont échoué)");
    }

    return NextResponse.json({ explanation: completion.choices[0]?.message?.content });
  } catch (error) {
    console.error('Erreur Explication IA:', error);
    return NextResponse.json({ error: 'Échec de l\'explication' }, { status: 500 });
  }
}
