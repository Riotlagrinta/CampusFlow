import { NextResponse } from 'next/server';
import bcrypt from "bcryptjs";
import { prisma } from '@/lib/prisma';
import { addXP } from '@/lib/xp';
import { auth } from "@/../auth";
import Groq from "groq-sdk";
import { sendPushNotification } from "@/lib/notifications";

import DOMPurify from "isomorphic-dompurify";

function sanitizeHtml(text: string): string {
  return DOMPurify.sanitize(text);
}

export async function GET() {
  try {
    const questions = await prisma.question.findMany({
      include: {
        author: { select: { firstName: true, lastName: true, level: true, image: true } },
        field: { select: { name: true, code: true } },
        level: { select: { name: true } },
        _count: { select: { answers: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    return NextResponse.json(questions);
  } catch (error) {
    console.error('Erreur GET questions:', error);
    return NextResponse.json({ error: 'Server Error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session || !session.user?.email) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const body = await req.json();
    const { title, content, tags, fieldId, levelId } = body;

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { field: true }
    });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const sanitizedTitle = sanitizeHtml(title);
    const sanitizedContent = sanitizeHtml(content);

    // 1. Création de la question
    const question = await prisma.question.create({
      data: {
        title: sanitizedTitle,
        content: sanitizedContent,
        tags,
        authorId: user.id,
        fieldId: fieldId || user.fieldId,
        levelId: levelId || user.academicLevelId,
        semester: 2 // Par défaut S2
      }
    });

    // 2. Réponse Automatique de l'IA (Tuteur)
    try {
      const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
      const aiPrompt = `Tu es le Tuteur IA Expert du forum DEFITECH. 
        Un étudiant (${user.firstName}) vient de poser une question : "${title}".
        Contenu détaillé : "${content}".
        Filière : ${user.field?.name || 'Générale'}.
        
        Ta mission : Fournis une première réponse constructive, académique et encourageante en moins de 150 mots. 
        Si c'est une question technique, donne une piste de solution ou un exemple de code. 
        Commence par "Bonjour ${user.firstName}, c'est une excellente question !"`;

      const completion = await groq.chat.completions.create({
        messages: [{ role: "user", content: aiPrompt }],
        model: "llama-3.3-70b-versatile",
        temperature: 0.5,
      });

      const aiResponse = completion.choices[0]?.message?.content || "Je vais analyser votre question et revenir vers vous !";

      // Trouver ou créer l'utilisateur "IA Tutor"
      let aiUser = await prisma.user.findUnique({ where: { email: 'ai-tutor@defitech.tg' } });
      if (!aiUser) {
        // Génération d'un mot de passe sécurisé pour éviter toute connexion manuelle indue
        const systemPassword = Math.random().toString(36).slice(-16) + Math.random().toString(36).slice(-16);
        const hashedSystemPassword = await bcrypt.hash(systemPassword, 12);

        aiUser = await prisma.user.create({
          data: {
            email: 'ai-tutor@defitech.tg',
            firstName: 'IA',
            lastName: 'Tutor',
            password: hashedSystemPassword,
            role: 'ADMIN',
            isActive: true,
            image: 'https://cdn-icons-png.flaticon.com/512/4712/4712035.png'
          }
        });
      }

      // Enregistrer la réponse de l'IA
      await prisma.answer.create({
        data: {
          content: aiResponse,
          questionId: question.id,
          authorId: aiUser.id
        }
      });

      // Envoyer une notification Push (L'IA répond instantanément)
      if (user.pushToken) {
        await sendPushNotification(
          user.pushToken,
          "L'IA Tuteur vous a répondu ! 🤖",
          "Consultez la première piste de solution sur votre question forum.",
          { questionId: question.id }
        );
      }

    } catch (aiError) {
      console.error('Erreur IA Forum:', aiError);
    }

    // Bonus: +20 XP automatique
    await addXP(user.id, 20);

    return NextResponse.json(question);
  } catch (error) {
    console.error('Erreur POST question:', error);
    return NextResponse.json({ error: 'Server Error' }, { status: 500 });
  }
}
