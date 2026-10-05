import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/session";

// Identifiant de dossier Google Drive : caractères sûrs uniquement (il est injecté dans la requête Drive).
const DRIVE_ID_REGEX = /^[A-Za-z0-9_-]{10,80}$/;

function extractFolderId(input: string): string | null {
  const value = input.trim();
  if (DRIVE_ID_REGEX.test(value)) return value;

  const match = value.match(/\/folders\/([A-Za-z0-9_-]+)/);
  if (match) return match[1];

  try {
    return new URL(value).searchParams.get("id");
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  try {
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    // Outil d'import réservé aux admins : il consomme le quota de la clé Google du serveur.
    if (user.role !== "ADMIN") return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const folderUrl = searchParams.get("url");

    if (!folderUrl) {
      return NextResponse.json({ error: "Lien de dossier manquant" }, { status: 400 });
    }
    if (folderUrl.length > 500) {
      return NextResponse.json({ error: "Lien de dossier invalide" }, { status: 400 });
    }

    const folderId = extractFolderId(folderUrl);
    if (!folderId || !DRIVE_ID_REGEX.test(folderId)) {
      return NextResponse.json({ error: "ID de dossier introuvable ou invalide" }, { status: 400 });
    }

    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Clé API Google non configurée sur le serveur" }, { status: 500 });
    }

    // Appel à l'API Google Drive pour lister les fichiers du dossier (PDF uniquement)
    const query = new URLSearchParams({
      q: `'${folderId}' in parents and mimeType='application/pdf' and trashed=false`,
      fields: "files(id,name,size,webContentLink)",
      key: apiKey,
    });

    const response = await fetch(`https://www.googleapis.com/drive/v3/files?${query}`, {
      signal: AbortSignal.timeout(10_000),
    });
    const data = await response.json().catch(() => null);

    if (!response.ok || !data || data.error) {
      console.error("Erreur Google API:", data?.error?.message ?? response.status);
      return NextResponse.json({ error: "Impossible d'accéder au dossier. Vérifiez qu'il est en mode 'Public' (Tous les utilisateurs disposant du lien)." }, { status: 400 });
    }

    return NextResponse.json({ files: data.files || [] });

  } catch (error) {
    console.error("Erreur listing dossier:", error instanceof Error ? error.message : "inconnue");
    return NextResponse.json({ error: "Échec de la récupération des fichiers" }, { status: 500 });
  }
}
