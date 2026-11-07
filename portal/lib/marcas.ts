/**
 * Quién le entrega el informe al paciente. Son dos empresas: los análisis de
 * laboratorio los emite **Laboratorio Climon** y el resto (ecografía,
 * Papanicolau, otros estudios) **Clínica Montalvo**. Cada una tiene su página:
 * `/laboratorio/<acceso>` y `/resultados/<acceso>`, con su nombre, su logo y su
 * tarjeta de WhatsApp. El enlace es el mismo acceso en las dos; si llega a la
 * página de la otra, el portal lo lleva a la suya.
 *
 * Sin dependencias: la usan también las pruebas de `node --test`.
 */
export type Marca = "montalvo" | "climon";

type DatosMarca = {
  /** Lo que lee el paciente arriba de su informe. */
  readonly nombre: string;
  readonly razonSocial: string;
  /** La ruta de su página; el acceso va detrás. */
  readonly ruta: "/resultados" | "/laboratorio";
  /** El 32 px de la cabecera. */
  readonly isotipo: string;
  /**
   * A dónde escribe el paciente para pedir ayuda o agendar: el número desde
   * el que le llega el aviso, así su mensaje cae en ese mismo chat del CRM.
   * Climon tiene el suyo, la línea «Laboratorio CLIMON» (06/11/2026).
   */
  readonly whatsapp: string;
};

export const MARCAS: Readonly<Record<Marca, DatosMarca>> = {
  montalvo: {
    nombre: "Clínica Montalvo",
    razonSocial: "Clínica Montalvo",
    ruta: "/resultados",
    isotipo: "/isotipo.svg",
    whatsapp: "59175031306",
  },
  climon: {
    nombre: "Laboratorio Climon",
    razonSocial: "Laboratorio Clínico Climon S.R.L.",
    ruta: "/laboratorio",
    isotipo: "/climon/isotipo.png",
    whatsapp: "59177385889",
  },
};

/** La empresa que entrega un informe de este tipo. Sin tipo (API anterior), Clínica Montalvo. */
export function marcaDeTipo(tipo: string | undefined | null): Marca {
  return tipo === "LABORATORIO" ? "climon" : "montalvo";
}

/** La página del paciente de un acceso, en la marca que corresponde. */
export function paginaDelPaciente(marca: Marca, accesoId: string): string {
  return `${MARCAS[marca].ruta}/${accesoId}`;
}
