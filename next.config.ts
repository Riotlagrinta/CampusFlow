import type { NextConfig } from "next";
// @ts-expect-error next-pwa ne fournit pas de types
import withPWAInit from "next-pwa";
// Règles de cache par défaut de next-pwa (polices, images, JS/CSS, pages...), reprises telles quelles.
// @ts-expect-error next-pwa ne fournit pas de types
import defaultRuntimeCaching from "next-pwa/cache";

const isDev = process.env.NODE_ENV === "development";
const isProd = process.env.NODE_ENV === "production";

// Les réponses de l'API contiennent des données personnelles : par défaut next-pwa met en cache
// les GET /api/* (NetworkFirst, 24 h), donc elles survivraient à la déconnexion et seraient servies
// hors ligne à la personne suivante sur l'appareil. Cette règle, placée AVANT les règles par défaut
// (la première qui correspond gagne), envoie toujours les appels /api/ au réseau. /api/auth/ reste
// hors du service worker, comme dans les règles par défaut. La fonction est sérialisée dans sw.js :
// elle ne doit référencer que des globales du service worker.
const apiNetworkOnly = {
  urlPattern: ({ url }: { url: URL }) =>
    self.origin === url.origin && url.pathname.startsWith("/api/") && !url.pathname.startsWith("/api/auth/"),
  handler: "NetworkOnly",
  method: "GET",
  options: { cacheName: "api-network-only" },
};

// Le layout met la session (email, nom) dans le HTML et dans les réponses RSC. Les règles par défaut
// de next-pwa (« others », NetworkFirst, 24 h, et la règle « start-url » sur « / ») les gardent en
// cache : la purge n'a lieu qu'à la déconnexion, donc un appareil partagé ou une session expirée
// peut resservir les pages (et les données personnelles qu'elles contiennent) d'un autre compte,
// surtout hors ligne. Ces deux règles, placées AVANT les règles par défaut (la première qui
// correspond gagne), envoient au réseau, sans jamais les mettre en cache :
//  - les navigations (request.mode === "navigate" ou destination "document", iframes comprises) ;
//  - les requêtes RSC / données de page (en-tête RSC, paramètre _rsc, /_next/data/).
// Les ressources statiques (_next/static, images, polices, audio/vidéo) gardent leurs règles par
// défaut. Contrepartie : plus de pages hors ligne (pas de page de repli /offline configurée).
// Format : urlPattern accepte une fonction (workbox v6, RouteMatchCallback { url, request, ... }) ;
// elle est sérialisée telle quelle dans sw.js, donc elle ne référence que des globales du service
// worker (jamais de variable de ce fichier).
const documentNetworkOnly = {
  urlPattern: ({ url, request }: { url: URL; request: Request }) =>
    self.origin === url.origin && (request.mode === "navigate" || request.destination === "document"),
  handler: "NetworkOnly",
  method: "GET",
  options: { cacheName: "documents-network-only" },
};

const rscNetworkOnly = {
  urlPattern: ({ url, request }: { url: URL; request: Request }) =>
    self.origin === url.origin &&
    (request.headers.get("RSC") !== null ||
      url.searchParams.has("_rsc") ||
      url.pathname.startsWith("/_next/data/")),
  handler: "NetworkOnly",
  method: "GET",
  options: { cacheName: "rsc-network-only" },
};

const withPWA = withPWAInit({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: isDev,
  // next-pwa met par défaut la page d'accueil « / » dans un cache « start-url » (règle ajoutée EN TÊTE,
  // donc prioritaire sur les règles ci-dessous, et préchargement/écriture côté navigateur dans
  // register.js). Désactivé : cette page contient aussi la session.
  dynamicStartUrl: false,
  cacheStartUrl: false,
  runtimeCaching: [apiNetworkOnly, documentNetworkOnly, rscNetworkOnly, ...defaultRuntimeCaching],
});

// Domaine canonique de l'application : NEXT_PUBLIC_APP_URL (ex. https://mon-domaine.vercel.app).
// Aucun domaine n'est codé en dur : sans cette variable, aucun en-tête CORS n'est émis
// (les appels du site lui-même sont same-origin et l'app mobile utilise un Bearer, sans CORS).
function resolveAppOrigin(): string | null {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!raw) {
    if (isProd) console.warn("[next.config] NEXT_PUBLIC_APP_URL n'est pas défini : aucun en-tête CORS ne sera émis.");
    return null;
  }
  try {
    return new URL(raw).origin;
  } catch {
    console.warn("[next.config] NEXT_PUBLIC_APP_URL n'est pas une URL valide : aucun en-tête CORS ne sera émis.");
    return null;
  }
}

const appOrigin = resolveAppOrigin();

// --- Content-Security-Policy -------------------------------------------------
// Compatible avec : next/image et next/font (auto-hébergée), Three.js / react-three-fiber (WebGL,
// scène procédurale, aucun asset distant), Mermaid (SVG injecté + styles en ligne), Vercel Analytics
// (script servi en same-origin sous /_vercel/insights), Vercel Blob (upload client vers vercel.com
// puis lecture depuis *.public.blob.vercel-storage.com).
// Les appels Groq, Tavily, Google Drive API, Genius Pay et UltraMsg partent du SERVEUR : ils ne
// passent pas par le navigateur et n'ont donc pas besoin de connect-src.
// 'unsafe-inline' est requis par les scripts d'hydratation inline de Next.js (pas de nonce sans
// proxy dynamique) et par les styles en ligne de framer-motion / Tailwind ; 'unsafe-eval' uniquement en dev.
const VERCEL_BLOB = "https://*.vercel-storage.com";

const cspFull = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://va.vercel-scripts.com`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: https://lh3.googleusercontent.com https://avatars.githubusercontent.com https://*.r2.dev ${VERCEL_BLOB} https://cdn-icons-png.flaticon.com`,
  "font-src 'self' data:",
  `connect-src 'self' ${VERCEL_BLOB} https://vercel.com https://va.vercel-scripts.com${isDev ? " ws://localhost:* http://localhost:*" : ""}`,
  `media-src 'self' blob: ${VERCEL_BLOB}`,
  `frame-src 'self' ${VERCEL_BLOB} https://drive.google.com https://docs.google.com`,
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join("; ");

// Socle toujours appliqué : anti-clickjacking, anti-injection de <base> et aucun plugin/objet embarqué
// (object-src 'none' neutralise <object>, <embed> et <applet>, vecteurs classiques de contournement de CSP).
const cspBaselineBase = "base-uri 'self'; form-action 'self'; frame-ancestors 'self'";
const cspBaseline = `${cspBaselineBase}; object-src 'none'`;

// Fichiers servis sous /uploads (PDF affichés dans l'<iframe> de l'aperçu des Ressources) : sans
// object-src, car le lecteur PDF des navigateurs est un objet embarqué qu'un « object-src 'none' »
// risque de bloquer. À valider dans un vrai navigateur.
const cspUploads = cspBaselineBase;

// La politique complète est d'abord émise en mode « Report-Only » : le navigateur journalise les
// violations dans la console sans rien bloquer. Elle n'a pas pu être validée dans un vrai navigateur
// (three.js, mermaid, aperçu PDF, upload Blob...). Une fois la console propre sur les pages
// principales, définir CSP_ENFORCE=true pour la faire appliquer réellement.
const enforceFullCsp = process.env.CSP_ENFORCE === "true";
const cspHeaders = enforceFullCsp
  ? [{ key: "Content-Security-Policy", value: isProd ? `${cspFull}; upgrade-insecure-requests` : cspFull }]
  : [
      { key: "Content-Security-Policy", value: cspBaseline },
      { key: "Content-Security-Policy-Report-Only", value: cspFull },
    ];

const nextConfig: NextConfig = {
  // pdf-parse v2 s'appuie sur pdfjs-dist, qui charge pdf.worker.mjs dynamiquement, et sur un
  // binaire natif (@napi-rs/canvas) : ces paquets doivent rester externes au bundle webpack
  // (chargés par Node à l'exécution). Règle aussi l'avertissement « Critical dependency ».
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "@napi-rs/canvas"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
      { protocol: "https", hostname: "pub-*.r2.dev" },
      // Vercel Blob public : <id>.public.blob.vercel-storage.com (deux niveaux de sous-domaine,
      // non couverts par un simple *.vercel-storage.com).
      { protocol: "https", hostname: "**.public.blob.vercel-storage.com" },
      { protocol: "https", hostname: "*.vercel-storage.com" },
      { protocol: "https", hostname: "cdn-icons-png.flaticon.com" },
    ],
    formats: ["image/avif", "image/webp"],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "15mb",
    },
    // Autoriser Turbopack malgré la présence de webpack (next-pwa)
    // turbopack: {},
  },
  async headers() {
    return [
      // CORS restreint au domaine canonique. L'app mobile Expo s'authentifie via l'en-tête
      // Authorization (pas de CORS nécessaire côté natif).
      ...(appOrigin
        ? [
            {
              source: "/api/:path*",
              headers: [
                { key: "Access-Control-Allow-Credentials", value: "true" },
                { key: "Access-Control-Allow-Origin", value: appOrigin },
                { key: "Vary", value: "Origin" },
                { key: "Access-Control-Allow-Methods", value: "GET,DELETE,PATCH,POST,PUT,OPTIONS" },
                { key: "Access-Control-Allow-Headers", value: "X-CSRF-Token, X-Requested-With, Accept, Content-Type, Authorization" },
              ],
            },
          ]
        : []),
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          // SAMEORIGIN (et non DENY) : l'aperçu PDF de la page Ressources charge des fichiers
          // /uploads/* dans une <iframe> de même origine.
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      {
        // Aperçu PDF : CSP sans object-src (voir cspUploads).
        source: "/uploads/:path*",
        headers: [{ key: "Content-Security-Policy", value: cspUploads }],
      },
      {
        // CSP : pas sur les assets statiques, l'optimiseur d'images (qui pose sa propre CSP), le
        // service worker /sw.js (qui charge un script tiers, décision propriétaire en attente) ni
        // /uploads (règle ci-dessus).
        source: "/((?!_next/static|_next/image|sw\\.js|workbox-|uploads/).*)",
        headers: cspHeaders,
      },
    ];
  },
};

export default withPWA(nextConfig);
