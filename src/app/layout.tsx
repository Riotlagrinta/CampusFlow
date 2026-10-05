import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import { ThemeProvider } from "@/components/theme-provider";
import LazyAIChat from "@/components/LazyAIChat";
import Heartbeat from "@/components/Heartbeat";
import { SessionProvider } from "next-auth/react";
import { auth } from "@/../auth";
import { Analytics } from "@vercel/analytics/next";
import SubscriptionGuard from "@/components/SubscriptionGuard";
import BottomNav from "@/components/BottomNav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DefiTech Student Hub",
  description: "Plateforme éducative et sociale pour la classe de Génie Logiciel de DEFITECH.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "DefiTech Hub",
  },
  formatDetection: {
    telephone: false,
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();

  return (
    <html lang="fr" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {/* Script Publicitaire Monetag (Multitag) - Désactivé pour éviter l'intrusion. On utilise maintenant le Direct Link sur demande. */}
        {/* <Script
          src="https://quge5.com/88/tag.min.js"
          data-zone="203183"
          async
          data-cfasync="false"
          strategy="lazyOnload"
        /> */}

        <SessionProvider session={session}>
          <SubscriptionGuard>
            <Heartbeat />
            <Analytics />
            <ThemeProvider
              attribute="class"
              defaultTheme="light"
              enableSystem={false}
              disableTransitionOnChange
            >
              <a
                href="#contenu"
                className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[110] focus:rounded-xl focus:bg-blue-600 focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-white"
              >
                Aller au contenu principal
              </a>
              <div className="flex min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-zinc-100 transition-colors duration-300">
                {session && <Sidebar />}
                <main
                  id="contenu"
                  tabIndex={-1}
                  className="flex-1 min-w-0 p-4 md:p-8 pb-24 md:pb-8 transition-all duration-300 relative focus:outline-none"
                  // --sidebar-width est défini en CSS (globals.css) : 0 sur mobile, 260/72 px sur desktop.
                  style={{ marginLeft: session ? 'var(--sidebar-width)' : undefined }}
                >
                  {children}
                </main>
                {session && <LazyAIChat />}
                {session && <BottomNav />}
              </div>
            </ThemeProvider>
          </SubscriptionGuard>
        </SessionProvider>
      </body>
    </html>
  );
}
