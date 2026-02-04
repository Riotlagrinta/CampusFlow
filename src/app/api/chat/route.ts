import Groq from "groq-sdk";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { addXP } from "@/lib/xp";
import { auth } from "@/../auth";
import fs from 'fs';
import path from 'path';

const DAILY_AI_LIMIT = 10; // Augmenté pour plus de confort

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session || !session.user?.email) {
      return NextResponse.json({ reply: "Session invalide. Veuillez vous déconnecter puis vous reconnecter." }, { status: 401 });
    }

    const { message, resourceId, externalLink, tempFilePath } = await req.json();

    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json({ reply: "Erreur de configuration : La clé API Groq est absente." }, { status: 500 });
    }

    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ reply: `Utilisateur introuvable.` }, { status: 404 });

    // --- CONTEXTE DOCUMENT ---
    let resourceContext = "";
    let pdfStatus = "";
    
    // N'activer la lecture PDF QUE si un fichier est réellement présent
    if (tempFilePath || externalLink || resourceId) {
        try {
            const pdf = require('pdf-parse');
            
            if (tempFilePath) {
                const fullTempPath = path.join(process.cwd(), 'public', tempFilePath);
                if (fs.existsSync(fullTempPath)) {
                    const dataBuffer = fs.readFileSync(fullTempPath);
                    const data = await pdf(dataBuffer);
                    resourceContext = data.text.substring(0, 15000);
                    try { fs.unlinkSync(fullTempPath); } catch(e) {}
                }
            } else if (externalLink && externalLink.includes('drive.google.com')) {
                const match = externalLink.match(/\/d\/([a-zA-Z0-9_-]+)/);
                const fileId = match ? match[1] : null;
                if (fileId) {
                    const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
                    const response = await fetch(downloadUrl);
                    if (response.ok) {
                        const buffer = Buffer.from(await response.arrayBuffer());
                        const data = await pdf(buffer);
                        resourceContext = data.text.substring(0, 15000);
                    }
                }
            } else if (resourceId) {
                const resource = await prisma.resource.findUnique({ where: { id: resourceId } });
                if (resource && resource.type === 'PDF') {
                    const filePath = path.join(process.cwd(), 'public', resource.url);
                    if (fs.existsSync(filePath)) {
                        const dataBuffer = fs.readFileSync(filePath);
                        const data = await pdf(dataBuffer);
                        resourceContext = data.text.substring(0, 15000);
                    }
                }
            }
        } catch (pdfError: any) {
            console.error("Erreur PDF:", pdfError);
            // On ne bloque pas la réponse de l'IA, on ignore juste le contexte défaillant
        }
    }

    // --- LOGIQUE DE QUOTA ---
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dailyUsage = await prisma.dailyAIUsage.upsert({
      where: { userId_date: { userId: user.id, date: today } },
      update: {},
      create: { userId: user.id, date: today, requestCount: 0 },
    });

    if ((DAILY_AI_LIMIT + user.aiBonusRequests - dailyUsage.requestCount) <= 0) {
      return NextResponse.json({
        reply: "Quota quotidien épuisé. Regardez une publicité pour continuer !",
        quotaExceeded: true
      }, { status: 429 });
    }

    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    
    // Utilisation de Llama 3.3 70B par défaut pour plus de précision
    const models = ["llama-3.3-70b-versatile", "mixtral-8x7b-32768"];

    let completion;
    let success = false;

    for (const modelId of models) {
      try {
        completion = await groq.chat.completions.create({
          messages: [
            {
              role: "system",
              content: `Tu es l'IA de l'institut DEFITECH au Togo. Tu es un expert pédagogique précis, cultivé et serviable.
              
              CONTEXTE :
              ${resourceContext ? `L'étudiant a joint un document. Voici son contenu : ${resourceContext}` : "Réponds aux questions de l'étudiant avec tes connaissances générales."}
              
              DIRECTIVES :
              1. Sois PRECIS et donne des faits réels (ex: President actuel des USA, etc.).
              2. Ne crée de graphiques (MERMAID) QUE si c'est indispensable pour expliquer un processus complexe. Sinon, réponds en texte clair.
              3. Si l'étudiant pose une question sans rapport avec le document joint, réponds-y normalement en utilisant tes connaissances générales.
              4. Ton ton doit être professionnel mais encourageant.`
            },
            { role: "user", content: message }
          ],
          model: modelId,
          temperature: 0.5, // Plus bas pour plus de précision factuelle
        });

        if (completion?.choices[0]?.message?.content) {
            success = true;
            break;
        }
      } catch (err: any) {
        continue;
      }
    }

    if (!success || !completion) {
        return NextResponse.json({ reply: "Service IA momentanément indisponible." }, { status: 503 });
    }

    const text = completion.choices[0]?.message?.content || "";

    await prisma.dailyAIUsage.update({
      where: { id: dailyUsage.id },
      data: { 
        requestCount: { increment: 1 },
        tokensUsed: { increment: completion.usage?.total_tokens || 0 }
      },
    });

    if (user) await addXP(user.id, 5);

    return NextResponse.json({ reply: text });
  } catch (error: any) {
    console.error("ERREUR CRITIQUE CHAT:", error);
    return NextResponse.json(
      { reply: "Une erreur technique est survenue. Veuillez réessayer." },
      { status: 500 }
    );
  }
}
