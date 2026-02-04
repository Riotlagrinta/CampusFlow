import Groq from "groq-sdk";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { addXP } from "@/lib/xp";
import { auth } from "@/../auth";
import fs from 'fs';
import path from 'path';

const DAILY_AI_LIMIT = 10;

// Fonction de recherche ultra-puissante via Serper (Google Search)
async function searchWeb(query: string) {
    const apiKey = process.env.SERPER_API_KEY;
    if (!apiKey) {
        console.warn("SERPER_API_KEY non configurée.");
        return "";
    }

    try {
        const res = await fetch("https://google.serper.dev/search", {
            method: "POST",
            headers: {
                "X-API-KEY": apiKey,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ q: query, gl: "fr", hl: "fr" })
        });
        const data = await res.json();
        
        if (data.organic && data.organic.length > 0) {
            return data.organic.slice(0, 4).map((item: any) => 
                `Titre: ${item.title}\nInfo: ${item.snippet}\nSource: ${item.link}`
            ).join("\n\n");
        }
    } catch (e) {
        console.error("Erreur Serper Search:", e);
    }
    return "";
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session || !session.user?.email) return NextResponse.json({ reply: "Session expirée." }, { status: 401 });

    const { message, resourceId, externalLink, tempFilePath } = await req.json();
    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ reply: `Utilisateur introuvable.` }, { status: 404 });

    // --- 1. CONTEXTE DOCUMENT ---
    let resourceContext = "";
    if (tempFilePath || externalLink || resourceId) {
        try {
            const pdf = require('pdf-parse');
            if (tempFilePath) {
                const fullTempPath = path.join(process.cwd(), 'public', tempFilePath);
                if (fs.existsSync(fullTempPath)) {
                    const dataBuffer = fs.readFileSync(fullTempPath);
                    const data = await pdf(dataBuffer);
                    resourceContext = data.text.substring(0, 10000);
                    try { fs.unlinkSync(fullTempPath); } catch(e) {}
                }
            } else if (resourceId) {
                const resource = await prisma.resource.findUnique({ where: { id: resourceId } });
                if (resource && resource.type === 'PDF') {
                    const filePath = path.join(process.cwd(), 'public', resource.url);
                    if (fs.existsSync(filePath)) {
                        const dataBuffer = fs.readFileSync(filePath);
                        const data = await pdf(dataBuffer);
                        resourceContext = data.text.substring(0, 10000);
                    }
                }
            }
        } catch (e) {}
    }

    // --- 2. RECHERCHE WEB (Serper) ---
    // On cherche sur le web si on n'a pas de doc, ou si c'est une question d'actualité/générale
    let webContext = "";
    const isGeneralQuestion = !resourceContext || message.length < 50 || message.toLowerCase().match(/(actu|président|qui est|météo|monde|prix|cours|google|internet|france|togo|usa)/);
    
    if (isGeneralQuestion) {
        webContext = await searchWeb(message);
    }

    // --- 3. LOGIQUE DE QUOTA ---
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dailyUsage = await prisma.dailyAIUsage.upsert({
      where: { userId_date: { userId: user.id, date: today } },
      update: {},
      create: { userId: user.id, date: today, requestCount: 0 },
    });

    if ((DAILY_AI_LIMIT + user.aiBonusRequests - dailyUsage.requestCount) <= 0) {
      return NextResponse.json({ reply: "Quota épuisé.", quotaExceeded: true }, { status: 429 });
    }

    // --- 4. GENERATION REPONSE ---
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: `Tu es l'IA de l'institut DEFITECH au Togo. Tu es un expert pédagogique capable de fouiller dans les cours et sur Internet.
          
          SOURCE 1 (COURS PDF) :
          ${resourceContext ? resourceContext : "Aucun document n'est ouvert actuellement."}
          
          SOURCE 2 (INTERNET - GOOGLE SEARCH) :
          ${webContext ? webContext : "Aucune information trouvée sur le web."}
          
          DIRECTIVES :
          1. Si la réponse est dans le COURS (Source 1), donne-la en priorité et précise "D'après votre cours...".
          2. Si l'info manque dans le cours, utilise INTERNET (Source 2) et précise "D'après les recherches sur le web...".
          3. Sois TRÈS PRÉCIS sur les faits historiques et l'actualité.
          4. Si l'étudiant te demande "Qui est le président de...", utilise TOUJOURS la Source 2 pour être à jour.`
        },
        { role: "user", content: message }
      ],
      model: "llama-3.3-70b-versatile",
      temperature: 0.3, // Encore plus bas pour une précision maximale
    });

    const text = completion.choices[0]?.message?.content || "";

    await prisma.dailyAIUsage.update({
      where: { id: dailyUsage.id },
      data: { 
        requestCount: { increment: 1 },
        tokensUsed: { increment: completion.usage?.total_tokens || 0 }
      },
    });

    await addXP(user.id, 5);
    return NextResponse.json({ reply: text });

  } catch (error: any) {
    console.error("ERREUR CHAT:", error);
    return NextResponse.json({ reply: "Une erreur est survenue." }, { status: 500 });
  }
}
