import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import { ThemeProvider } from "@/components/theme-provider";
import AIChat from "@/components/AIChat";
import Heartbeat from "@/components/Heartbeat";
import { SessionProvider } from "next-auth/react";
import { auth } from "@/../auth";
import Script from "next/script";
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
              <div className="flex min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-zinc-100 transition-colors duration-300">
                {session && <Sidebar />}
                <main
                  className="flex-1 p-4 md:p-8 pb-24 md:pb-8 transition-all duration-300 relative"
                  style={{ marginLeft: session ? 'var(--sidebar-width, 260px)' : '0' }}
                >
                  {children}
                </main>
                {session && <AIChat />}
                {session && <BottomNav />}
              </div>
            </ThemeProvider>
          </SubscriptionGuard>
        </SessionProvider>
      </body>
    </html>
  );
}