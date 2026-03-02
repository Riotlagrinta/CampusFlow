"use client";

import { useSession } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";

const PUBLIC_ROUTES = ["/", "/login", "/register", "/about", "/subscribe", "/resources", "/forum", "/ai-assistant", "/profile", "/quiz", "/flashcards", "/assignments", "/support"];
const SHOP_ROUTES = ["/shop", "/shop/checkout", "/shop/success"];

export default function SubscriptionGuard({ children }: { children: React.ReactNode }) {
    const { data: session, status } = useSession();
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        if (status === "loading") return;

        // 1. Gérer les routes publiques et fonctionnelles (Accessibles à tous connectés)
        const isPublicRoute = PUBLIC_ROUTES.some(route => pathname === route || pathname.startsWith(route + "/"));

        if (isPublicRoute) return;

        // 2. Gérer les routes d'API
        if (pathname.startsWith("/api/")) return;

        // 3. Si l'utilisateur n'est pas connecté, redirection vers /login
        if (!session) {
            router.push("/login");
            return;
        }

        // 4. Gérer l'accès aux pages de la boutique
        const isShopRoute = SHOP_ROUTES.some(route => pathname === route);
        if (isShopRoute) return;

        // 5. Restriction spécifique pour les pages vraiment "Premium" si besoin
        // Pour l'instant, on laisse tout accessible pour ne pas bloquer les utilisateurs.
        // On pourrait restreindre des pages spécifiques ici plus tard.
        
    }, [session, status, pathname, router]);

    return <>{children}</>;
}
