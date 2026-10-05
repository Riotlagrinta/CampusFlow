"use client";

import { useSession } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
// La liste des pages publiques (PUBLIC_PAGES) est la même que celle de src/proxy.ts : elle vit
// dans src/lib/routeAccess.ts pour que les deux ne puissent pas diverger.
import { isPublicPage } from "@/lib/routeAccess";

/**
 * Filet de sécurité côté client : le proxy (src/proxy.ts) redirige déjà les visiteurs sans
 * session, mais une session peut expirer ou être fermée dans un autre onglet pendant la
 * navigation. L'accès aux fonctionnalités est libre (tant qu'on a des jetons).
 */
export default function SubscriptionGuard({ children }: { children: React.ReactNode }) {
    const { data: session, status } = useSession();
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        if (status === "loading") return;
        if (isPublicPage(pathname)) return;

        // Pas de session sur une page protégée : retour au login, avec le chemin et les
        // paramètres d'origine pour y revenir après connexion.
        if (!session) {
            const target = `${window.location.pathname}${window.location.search}`;
            router.replace(`/login?callbackUrl=${encodeURIComponent(target)}`);
        }
    }, [session, status, pathname, router]);

    return <>{children}</>;
}
