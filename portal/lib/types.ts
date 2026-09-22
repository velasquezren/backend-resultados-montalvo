export type User = {
  id: string;
  nombre: string;
  email?: string;
  rol: "ADMIN" | "MEDICO";
};
export type Patient = {
  id: string;
  nombre: string;
  ci: string | null;
  pac: string | null;
};
export type Access = {
  id: string;
  codigo?: string;
  url?: string;
  expiraEn?: string;
};
/** Lo que devuelve la lista: solo lo que se pinta en cada fila. */
export type ReportSummary = {
  id: string;
  revision: number;
  estudio: string;
  fechaEstudio: string;
  estado: "BORRADOR" | "PUBLICADO" | "RETIRADO";
  archivoId: string | null;
  publicadoEn: string | null;
  paciente: { id: string; nombre: string };
};
export type Report = {
  id: string;
  revision: number;
  estudio: string;
  fechaEstudio: string;
  estado: "BORRADOR" | "PUBLICADO" | "RETIRADO";
  paciente: Patient;
  medico: { nombre: string };
  archivoId: string | null;
  archivo: { bytes: number; paginas: number } | null;
  acceso: Access | null;
};
export type Config = {
  maxPdfBytes: number;
  estudiosFrecuentes: string[];
};
export const reportLabels = {
  BORRADOR: "En preparación",
  PUBLICADO: "Publicado",
  RETIRADO: "Retirado",
};
export function dateLabel(value: string) {
  return new Intl.DateTimeFormat("es-BO", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
}
