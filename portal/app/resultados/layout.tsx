import { Poppins } from "next/font/google";

/* La tipografía del CRM: el paciente ve la misma clínica en los dos lados. */
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-poppins",
});

/*
 * El marco de la página que abre el paciente: su marca arriba, el informe y
 * nada más. Sin la cabecera del portal de trabajo de los médicos.
 */
export default function LayoutPaciente({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className={`pac ${poppins.variable}`}>
      <header className="pac-marca">
        <img src="/isotipo.svg" width="30" height="30" alt="" />
        <span>Clínica Montalvo</span>
      </header>
      <main id="contenido" className="pac-contenido">
        {children}
      </main>
      <footer className="pac-pie">Resultados clínicos · Enlace privado</footer>
    </div>
  );
}
