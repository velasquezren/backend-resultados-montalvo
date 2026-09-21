"use client";
import { Access } from "@/lib/types";
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
export function AccessCard({ access }: { access: Access }) {
  return (
    <section className="access-card">
      <h3>Acceso del paciente</h3>
      {access.codigo ? (
        <>
          <p>
            Entrega este código al paciente en la clínica. Se muestra una sola
            vez; no lo envíes en el mismo mensaje que el enlace.
          </p>
          <strong className="access-code">{access.codigo}</strong>
        </>
      ) : (
        <p>
          Usa el código entregado al paciente. Si se perdió, puedes renovarlo.
        </p>
      )}
      <p className="break">
        {access.url || `${window.location.origin}/resultados/${access.id}`}
      </p>
      <button type="button" onClick={() => window.print()}>
        Imprimir comprobante
      </button>
    </section>
  );
}
