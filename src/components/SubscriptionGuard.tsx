"use client";

import { useSession } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";

const PUBLIC_ROUTES = ["/", "/login", "/register", "/about", "/subscribe"];

export default function SubscriptionGuard({ children }: { children: React.ReactNode }) {
    const { data: session, status } = useSession();
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        if (status === "loading") return;

        // Autoriser les routes publiques, l'auth et le callback de paiement
        const isPublicRoute = PUBLIC_ROUTES.some(route =>
            pathname === route ||
            pathname.startsWith("/api/auth") ||
            pathname.startsWith("/api/payment/genius/callback")
        );

        if (!isPublicRoute) {
            // Si non connecté, NextAuth devrait gérer, mais on reste prudent
            if (!session) return;

            const user = session.user as any;
            const isSubscribed = user.isSubscribed;
            const isAdmin = user.role === "ADMIN";

            if (!isSubscribed && !isAdmin) {
                console.log("Accès refusé : non abonné. Redirection vers /subscribe");
                router.push("/subscribe");
            }
        }
    }, [session, status, pathname, router]);

    return <>{children}</>;
}
