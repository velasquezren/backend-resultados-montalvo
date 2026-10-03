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
/** Un video o imagen que el médico sumó al informe (ver `lib/medios.ts`). */
export type Adjunto = {
  id: string;
  tipo: "VIDEO" | "IMAGEN";
  mime: string;
  /** Como lo subió el médico. Solo llega en el portal del médico. */
  nombre: string;
  bytes: number;
  createdAt: string;
};
/** Lo que ve el paciente de cada adjunto: sin el nombre del archivo. */
export type AdjuntoPaciente = Pick<Adjunto, "id" | "tipo" | "mime" | "bytes">;
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
  adjuntos: Adjunto[];
};
export type Config = {
  maxPdfBytes: number;
  maxAdjuntoBytes: number;
  maxAdjuntos: number;
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
