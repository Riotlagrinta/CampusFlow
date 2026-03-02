"use client";

import { useSession } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";

const PUBLIC_ROUTES = ["/", "/login", "/register", "/about", "/subscribe"];
const SHOP_ROUTES = ["/shop", "/shop/checkout", "/shop/success"];

export default function SubscriptionGuard({ children }: { children: React.ReactNode }) {
    const { data: session, status } = useSession();
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        if (status === "loading") return;

        // 1. Gérer les routes publiques (Accessibles à tous)
        const isPublicRoute = PUBLIC_ROUTES.some(route => pathname === route);

        // 2. Gérer les routes d'API publiques
        const isPublicApi = pathname.startsWith("/api/auth") || pathname.startsWith("/api/payment/genius/callback");

        if (isPublicRoute || isPublicApi) return;

        // 3. Si l'utilisateur n'est pas connecté, redirection vers /login
        if (!session) {
            router.push("/login");
            return;
        }

        // 4. Gérer l'accès aux autres pages selon l'abonnement
        const user = session.user as any;
        const isSubscribed = user.isSubscribed;
        const isAdmin = user.role === "ADMIN";
        const isShopRoute = SHOP_ROUTES.some(route => pathname === route);

        // On autorise la boutique même si non abonné (pour pouvoir s'abonner !)
        if (isShopRoute) return;

        if (!isSubscribed && !isAdmin) {
            console.log("Accès refusé : non abonné. Redirection vers /subscribe");
            router.push("/subscribe");
        }
    }, [session, status, pathname, router]);

    return <>{children}</>;
}
