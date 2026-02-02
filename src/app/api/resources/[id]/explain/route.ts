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

    const { id } = await params;

    const resource = await prisma.resource.findUnique({ where: { id } });
    if (!resource) {
      return NextResponse.json({ error: 'Ressource non trouvée' }, { status: 404 });
    }

    let fullText = "";
    const pdfParser = require('pdf-parse');

    // 1. GESTION DES LIENS EXTERNES (Google Drive)
    if (resource.url.startsWith('http')) {
        if (resource.url.includes('drive.google.com')) {
            try {
                // Conversion en lien de téléchargement direct pour Google Drive
                let fileId = "";
                const match = resource.url.match(/\/d\/(.+?)\//);
                if (match) fileId = match[1];
                else {
                    const urlParams = new URL(resource.url).searchParams;
                    fileId = urlParams.get('id') || "";
                }

                if (!fileId) throw new Error("ID Google Drive introuvable");

                const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
                const response = await fetch(downloadUrl);
                
                if (!response.ok) throw new Error("Impossible de télécharger le fichier depuis Drive");

                const buffer = Buffer.from(await response.arrayBuffer());
                const data = await pdfParser(buffer);
                fullText = data.text.substring(0, 15000);
            } catch (err) {
                console.error("Erreur Drive:", err);
                return NextResponse.json({ error: "Impossible de lire ce lien Drive. Assurez-vous qu'il est public (Tous les utilisateurs disposant du lien)." }, { status: 400 });
            }
        } else {
            return NextResponse.json({ error: "L'analyse IA directe n'est supportée que pour les fichiers locaux et Google Drive (Public)." }, { status: 400 });
        }
    } else {
        // 2. GESTION DES FICHIERS LOCAUX
        if (resource.type !== 'PDF') {
            return NextResponse.json({ error: "L'explication IA n'est disponible que pour les documents PDF." }, { status: 400 });
        }

        try {
            const filePath = path.join(process.cwd(), 'public', resource.url);
            if (!fs.existsSync(filePath)) throw new Error("Fichier introuvable");
            
            const dataBuffer = fs.readFileSync(filePath);
            const pdfData = await pdfParser(dataBuffer);
            fullText = pdfData.text.substring(0, 15000);
        } catch (err) {
            return NextResponse.json({ error: "Erreur lors de la lecture du fichier local." }, { status: 500 });
        }
    }

    if (!fullText || fullText.trim().length < 20) {
        return NextResponse.json({ error: "Le document semble vide ou illisible." }, { status: 400 });
    }

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
