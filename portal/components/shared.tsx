"use client";
import { Access, dateLabel } from "@/lib/types";
export function message(error: unknown) {
  return error instanceof Error
    ? error.message
    : "No pudimos completar la operación.";
}
export function today() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/La_Paz",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export function Feedback({
  error,
  notice,
}: {
  error: string;
  notice?: string;
}) {
  return (
    <>
      <div role="alert">{error && <p className="error">{error}</p>}</div>
      <div role="status" aria-live="polite">
        {notice && <p className="notice">{notice}</p>}
      </div>
    </>
  );
}
/**
 * El enlace del paciente. Es la llave de su informe: quien lo abre lo ve, sin
 * código. No se entrega en papel: recepción lo envía por WhatsApp desde el CRM.
 */
export function AccessCard({ access }: { access: Access }) {
  const url = access.url || `${window.location.origin}/resultados/${access.id}`;
  return (
    <section className="access-card">
      <h3>Enlace del paciente</h3>
      <p>
        Recepción se lo enviará por WhatsApp al publicar. Al abrirlo verá su
        informe directamente, sin códigos.
        {access.expiraEn && <> Vence el {dateLabel(access.expiraEn)}.</>}
      </p>
      <p className="break">{url}</p>
    </section>
  );
}
