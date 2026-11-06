import { Poppins } from "next/font/google";
import { MARCAS } from "@/lib/marcas";

/* La misma letra y tarjeta que la página de la clínica: cambia quién la firma. */
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-poppins",
});

const climon = MARCAS.climon;

/*
 * El marco de la página que abre el paciente de un análisis de laboratorio:
 * Laboratorio Climon es otra empresa que Clínica Montalvo, y el paciente debe
 * ver quién le entrega el resultado. Su ícono y su tarjeta de WhatsApp viven en
 * esta carpeta (`icon.png`, `apple-icon.png`, `opengraph-image.tsx`).
 */
export default function LayoutLaboratorio({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className={`pac ${poppins.variable}`}>
      <header className="pac-marca">
        <img src={climon.isotipo} width="32" height="32" alt="" />
        <span>{climon.nombre}</span>
      </header>
      <main id="contenido" className="pac-contenido">
        {children}
      </main>
      <footer className="pac-pie">{climon.razonSocial} · Enlace privado</footer>
    </div>
  );
}
