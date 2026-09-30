import type { Metadata } from "next";

/*
 * La vista con la que recepción revisa QUÉ informe va a enviar, abierta desde
 * el CRM con un enlace firmado de 10 minutos (ver `src/results/revision.ts`).
 *
 * Es el mismo visor que usa el médico: el PDF dentro del navegador, sin
 * descargas. Muestra la versión liviana del informe, la misma que recibirá la
 * paciente, y no cuenta como «abierto por el paciente».
 */
export const metadata: Metadata = {
  title: "Revisión del informe | Clínica Montalvo",
  robots: { index: false, follow: false },
};

const FORMA = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(\d{10})\.[A-Za-z0-9_-]{43}$/;

export default async function Revision({ params }: { params: Promise<{ enlace: string }> }) {
  const { enlace } = await params;
  const forma = FORMA.exec(enlace);
  /* El vencimiento va legible en el enlace: si ya pasó se dice aquí, sin pedir
     nada. La firma la sigue verificando la API al servir el PDF. */
  const vigente = forma !== null && Number(forma[1]) * 1000 > Date.now();

  if (!vigente)
    return (
      <main id="contenido" className="rev rev-aviso">
        <h1>Este enlace de revisión ya no es válido</h1>
        <p>Duran 10 minutos. Vuelve al CRM y toca otra vez «Ver el informe».</p>
      </main>
    );

  const pdf = `/api/v1/revision/${enlace}/pdf`;
  return (
    <main id="contenido" className="rev">
      <header className="rev-cabecera">
        <img src="/isotipo.svg" width="26" height="26" alt="" />
        <div>
          <h1>Revisión del informe</h1>
          <p>Es lo que recibirá la paciente. Verlo aquí no cuenta como abierto por ella.</p>
        </div>
        <a className="button" href={pdf} target="_blank" rel="noreferrer">
          Pantalla completa
        </a>
      </header>
      <iframe className="rev-visor" src={pdf} title="Informe a enviar" />
    </main>
  );
}
