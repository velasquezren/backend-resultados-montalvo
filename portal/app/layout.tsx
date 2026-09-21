import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";
const font = Montserrat({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-montserrat",
});
export const metadata: Metadata = {
  title: "Resultados | Clínica Montalvo",
  description: "Consulta privada de resultados de Clínica Montalvo.",
  robots: { index: false, follow: false },
};
export default function Layout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={font.variable}>
      <body>
        <a className="skip" href="#contenido">
          Saltar al contenido
        </a>
        <header className="brand">
          <a href="/" aria-label="Clínica Montalvo, portal de resultados">
            <img src="/isotipo.svg" width="40" height="40" alt="" />
            <span>
              <small>CLÍNICA</small>
              <strong>MONTALVO</strong>
            </span>
          </a>
          <span className="brand-caption">Portal de resultados</span>
        </header>
        <main id="contenido">{children}</main>
        <footer>Clínica Montalvo · Resultados clínicos</footer>
      </body>
    </html>
  );
}
