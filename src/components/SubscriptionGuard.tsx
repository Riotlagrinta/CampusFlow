"use client";

import { useSession } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * SubscriptionGuard sert maintenant uniquement à protéger le login.
 * L'accès aux fonctionnalités est libre (tant qu'on a des jetons).
 */
export default function SubscriptionGuard({ children }: { children: React.ReactNode }) {
    const { data: session, status } = useSession();
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        if (status === "loading") return;

        // 1. Liste des routes publiques (Accessibles à tous)
        const publicRoutes = ["/", "/login", "/register", "/about", "/subscribe"];
        const isPublicRoute = publicRoutes.some(route => pathname === route);

        if (isPublicRoute || pathname.startsWith("/api/")) return;

        // 2. Si pas de session, retour au login
        if (!session) {
            router.push("/login");
        }
        
    }, [session, status, pathname, router]);

    return <>{children}</>;
}
