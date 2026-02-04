import Groq from "groq-sdk";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { addXP } from "@/lib/xp";
import { auth } from "@/../auth";
import fs from 'fs';
import path from 'path';

const DAILY_AI_LIMIT = 10;

// Fonction de recherche via Tavily (Optimisé pour l'IA)
async function searchWeb(query: string) {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) return "";

    try {
        const res = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                api_key: apiKey,
                query: query,
                search_depth: "basic",
                max_results: 3
            })
        });
        const data = await res.json();
        
        if (data.results && data.results.length > 0) {
            return data.results.map((item: any) => 
                `Titre: ${item.title}\nExtrait: ${item.content}\nLien: ${item.url}`
            ).join("\n\n");
        }
    } catch (e) {
        console.error("Erreur Tavily Search:", e);
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

    let webContext = "";
    const isGeneralQuestion = !resourceContext || message.toLowerCase().match(/(actu|président|qui est|météo|nouvelles|prix|internet|togo|usa|france|monde)/);
    
    if (isGeneralQuestion) {
        webContext = await searchWeb(message);
    }

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

    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: `Tu es l'IA de l'institut DEFITECH au Togo. Tu es un expert pédagogique.
          
          COURS PDF :
          ${resourceContext ? resourceContext : "Aucun cours ouvert."}
          
          INTERNET (TAVILY SEARCH) :
          ${webContext ? webContext : "Pas d'infos web."}
          
          DIRECTIVES :
          1. Priorité au COURS PDF si l'info y est.
          2. Utilise INTERNET pour compléter ou si l'info manque (ex: actualité).
          3. Cite la source (Cours ou Web).
          4. Sois factuel et précis.`
        },
        { role: "user", content: message }
      ],
      model: "llama-3.3-70b-versatile",
      temperature: 0.3,
    });

    const text = completion.choices[0]?.message?.content || "";
    await prisma.dailyAIUsage.update({
      where: { id: dailyUsage.id },
      data: { 
        requestCount: { increment: 1 },
        tokensUsed: completion.usage?.total_tokens || 0
      },
    });

    await addXP(user.id, 5);
    return NextResponse.json({ reply: text });

  } catch (error: any) {
    console.error("ERREUR CHAT:", error);
    return NextResponse.json({ reply: "Erreur technique." }, { status: 500 });
  }
}