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

    // ROTATION EXPLICATION
    const models = ["openai/gpt-oss-120b", "groq/compound", "moonshotai/kimi-k2-instruction"];
    let completion;
    let success = false;

    for (const m of models) {
      try {
        completion = await groq.chat.completions.create({
          messages: [
            {
              role: "system",
              content: "Tu es un professeur expert de l'institution DEFITECH. Ton rôle est d'expliquer le contenu du document fourni par l'étudiant de manière claire, pédagogique et structurée, quel que soit le sujet (Technique, Gestion, Réseaux, etc.). Utilise du Markdown pour la mise en forme."
            },
            {
              role: "user",
              content: `Document : ${resource.title}\n\nContenu :\n${fullText}`
            }
          ],
          model: m,
        });
        success = true;
        break;
      } catch (err: any) {
        if (err?.status === 429) continue;
        break;
      }
    }

    if (!success || !completion) throw new Error("IA Indisponible");

    return NextResponse.json({ explanation: completion.choices[0]?.message?.content });
  } catch (error) {
    console.error('Erreur Explication IA:', error);
    return NextResponse.json({ error: 'Échec de l\'explication' }, { status: 500 });
  }
}
