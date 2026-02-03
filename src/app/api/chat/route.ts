import Groq from "groq-sdk";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { addXP } from "@/lib/xp";
import { auth } from "@/../auth";
import fs from 'fs';
import path from 'path';

const DAILY_AI_LIMIT = 5;

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session || !session.user?.email) {
      return NextResponse.json({ reply: "Session invalide. Veuillez vous déconnecter puis vous reconnecter." }, { status: 401 });
    }

    const { message, resourceId, externalLink, tempFilePath } = await req.json();

    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json({ reply: "Erreur de configuration : La clé API Groq est absente du serveur de production." }, { status: 500 });
    }

    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ reply: `Utilisateur (${session.user.email}) introuvable.` }, { status: 404 });

    // --- CONTEXTE DOCUMENT ---
    let resourceContext = "";
    let pdfStatus = "";
    
    try {
        const { PDFParse } = require('pdf-parse');
        
        const extractDriveId = (url: string) => {
            if (!url) return null;
            const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
            if (match) return match[1];
            try {
                const u = new URL(url);
                return u.searchParams.get('id');
            } catch { return null; }
        };

        if (tempFilePath) {
            const fullTempPath = path.join(process.cwd(), 'public', tempFilePath);
            if (fs.existsSync(fullTempPath)) {
                const dataBuffer = fs.readFileSync(fullTempPath);
                const parser = new PDFParse({ data: dataBuffer });
                const result = await parser.getText();
                resourceContext = result.text.substring(0, 15000);
                try { fs.unlinkSync(fullTempPath); } catch(e) {}
            }
        } else if (externalLink && externalLink.includes('drive.google.com')) {
            const fileId = extractDriveId(externalLink);
            if (fileId) {
                const apiKey = process.env.GOOGLE_API_KEY;
                const downloadUrl = apiKey 
                    ? `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${apiKey}`
                    : `https://drive.google.com/uc?export=download&id=${fileId}`;

                const response = await fetch(downloadUrl);
                if (response.ok) {
                    const buffer = Buffer.from(await response.arrayBuffer());
                    const parser = new PDFParse({ data: buffer });
                    const result = await parser.getText();
                    resourceContext = result.text.substring(0, 15000);
                } else {
                    pdfStatus = "⚠️ Impossible de lire le lien Drive (vérifiez qu'il est bien public).";
                }
            }
        } else if (resourceId) {
            const resource = await prisma.resource.findUnique({ where: { id: resourceId } });
            if (resource && resource.type === 'PDF') {
                const filePath = path.join(process.cwd(), 'public', resource.url);
                if (fs.existsSync(filePath)) {
                    const dataBuffer = fs.readFileSync(filePath);
                    const parser = new PDFParse({ data: dataBuffer });
                    const result = await parser.getText();
                    resourceContext = result.text.substring(0, 10000);
                }
            }
        }
    } catch (pdfError: any) {
        console.error("Erreur PDF:", pdfError);
        pdfStatus = `⚠️ Erreur lecture PDF : ${pdfError.message}`;
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
    const models = [
      "llama-3.3-70b-versatile",
      "mixtral-8x7b-32768",
      "llama-3.1-8b-instant"
    ];

    let completion;
    let success = false;

    for (const modelId of models) {
      try {
        const chatCompletion = await groq.chat.completions.create({
          messages: [
            {
              role: "system",
              content: `Tu es l'assistant IA de DEFITECH. 
              ${resourceContext ? `IMPORTANT : Voici le texte du document joint. Tu DOIS l'utiliser pour répondre. Ne dis JAMAIS que tu ne peux pas accéder aux fichiers car ils te sont fournis ici : 

${resourceContext}` : "L'étudiant n'a pas joint de document."}
              
              INSTRUCTIONS :
              - Réponds de manière pédagogique.
              - Utilise MERMAID pour les schémas.`
            },
            { role: "user", content: message }
          ],
          model: modelId,
          temperature: 0.6,
        });

        if (chatCompletion?.choices[0]?.message?.content) {
            completion = chatCompletion;
            success = true;
            break;
        }
      } catch (err: any) {
        await new Promise(resolve => setTimeout(resolve, 500));
        continue;
      }
    }

    if (!success || !completion) {
        return NextResponse.json({ reply: "Service IA momentanément indisponible." }, { status: 503 });
    }

    const text = completion.choices[0]?.message?.content || "";
    const finalReply = pdfStatus ? `${pdfStatus}\n\n${text}` : text;

    await prisma.dailyAIUsage.update({
      where: { id: dailyUsage.id },
      data: { 
        requestCount: { increment: 1 },
        tokensUsed: { increment: completion.usage?.total_tokens || 0 }
      },
    });

    if (user) await addXP(user.id, 5);

    return NextResponse.json({ reply: finalReply });
  } catch (error: any) {
    console.error("ERREUR CRITIQUE CHAT:", error);
    return NextResponse.json(
      { reply: "Une erreur technique est survenue. Veuillez réessayer." },
      { status: 500 }
    );
  }
}