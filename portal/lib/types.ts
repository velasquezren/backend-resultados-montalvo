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
  telefono: string | null;
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
  aviso: { estado: string; codigoError?: number | null } | null;
  acceso: Access | null;
};
export type Config = {
  notificacionesHabilitadas: boolean;
  maxPdfBytes: number;
  limiteAvisosDiario: number;
  avisoCosto: string;
  estudiosFrecuentes: string[];
};
export const reportLabels = {
  BORRADOR: "En preparación",
  PUBLICADO: "Publicado",
  RETIRADO: "Retirado",
};
export const notificationLabels: Record<string, string> = {
  PENDIENTE: "Aviso pendiente",
  ENVIANDO: "Enviando aviso",
  ACEPTADO: "Aceptado por WhatsApp; entrega pendiente",
  ENTREGADO: "Aviso entregado",
  LEIDO: "Aviso leído",
  FALLIDO: "No se pudo enviar el aviso",
  INCIERTO: "Envío sin confirmar. No se repetirá automáticamente",
  CANCELADO: "Aviso cancelado",
};
export function dateLabel(value: string) {
  return new Intl.DateTimeFormat("es-BO", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
}
