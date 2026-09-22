import type { NextConfig } from "next";
import path from "node:path";
const config: NextConfig = {
  poweredByHeader: false,
  turbopack: { root: path.resolve(process.cwd()) },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
      {
        // Debe ir DESPUÉS de la regla general: cuando dos reglas fijan la misma
        // cabecera, gana la última. El PDF se revisa incrustado en el propio
        // portal, así que aquí se relaja a SAMEORIGIN; las páginas siguen en DENY.
        source: "/api/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
        ],
      },
    ];
  },
};
export default config;
