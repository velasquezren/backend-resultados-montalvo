import type { Metadata, Viewport } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";
const font = Montserrat({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-montserrat",
});
export const metadata: Metadata = {
  /* Las imágenes de vista previa se anuncian con URL absoluta. */
  metadataBase: new URL(process.env.PORTAL_ORIGIN || "https://resultados.107.175.132.15.nip.io"),
  title: "Resultados | Clínica Montalvo",
  description: "Consulta privada de resultados de Clínica Montalvo.",
  robots: { index: false, follow: false },
};
/* La barra del navegador del teléfono toma el verde de la clínica. */
export const viewport: Viewport = { themeColor: "#006156" };

export default function Layout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={font.variable}>
      <body>
        <a className="skip" href="#contenido">
          Saltar al contenido
        </a>
        {children}
      </body>
    </html>
  );
}
