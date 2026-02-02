import { NextResponse } from "next/server";
import { auth } from "@/../auth";

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const folderUrl = searchParams.get("url");

    if (!folderUrl) {
      return NextResponse.json({ error: "Lien de dossier manquant" }, { status: 400 });
    }

    // Extraction robuste de l'ID du dossier
    const match = folderUrl.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    let folderId = match ? match[1] : null;

    if (!folderId) {
        try {
            const urlObj = new URL(folderUrl);
            folderId = urlObj.searchParams.get('id');
        } catch {}
    }

    if (!folderId) return NextResponse.json({ error: "ID de dossier introuvable" }, { status: 400 });

    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Clé API Google non configurée sur le serveur" }, { status: 500 });
    }

    // Appel à l'API Google Drive pour lister les fichiers du dossier
    // On filtre pour n'avoir que les PDF
    const driveUrl = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+mimeType='application/pdf'+and+trashed=false&fields=files(id,name,size,webContentLink)&key=${apiKey}`;

    const response = await fetch(driveUrl);
    const data = await response.json();

    if (data.error) {
      console.error("Erreur Google API:", data.error);
      return NextResponse.json({ error: "Impossible d'accéder au dossier. Vérifiez qu'il est en mode 'Public' (Tous les utilisateurs disposant du lien)." }, { status: 400 });
    }

    return NextResponse.json({ files: data.files || [] });

  } catch (error) {
    console.error("Erreur listing dossier:", error);
    return NextResponse.json({ error: "Échec de la récupération des fichiers" }, { status: 500 });
  }
}
