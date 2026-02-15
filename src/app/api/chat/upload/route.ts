import { NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { auth } from "@/../auth";

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const formData = (await req.formData()) as any;
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "Aucun fichier reçu" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Dossier temporaire sécurisé (Utilise /tmp sur Vercel, public/uploads/temp en local)
    const isProd = process.env.NODE_ENV === 'production';
    const tempDir = isProd ? "/tmp" : path.join(process.cwd(), "public", "uploads", "temp");
    await mkdir(tempDir, { recursive: true });

    // Nom de fichier unique pour éviter les collisions
    const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(7)}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
    const filePath = path.join(tempDir, uniqueName);

    await writeFile(filePath, buffer);

    // On renvoie le chemin pour que l'API chat puisse le retrouver
    // Si c'est prod, on renvoie le chemin absolu /tmp/...
    // Si c'est local, on renvoie uploads/temp/...
    return NextResponse.json({ 
        tempPath: isProd ? filePath : `uploads/temp/${uniqueName}`,
        originalName: file.name
    });

  } catch (error) {
    console.error("Erreur upload temp:", error);
    return NextResponse.json({ error: "Échec de l'upload" }, { status: 500 });
  }
}
