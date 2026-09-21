"use client";
import { FormEvent, useState } from "react";
import { api } from "@/lib/client";
import { dateLabel } from "@/lib/types";
type Result = {
  estudio: string;
  fechaEstudio: string;
  medico: string;
  disponible: boolean;
  mensaje: string;
};
export default function PatientPortal({ accessId }: { accessId: string }) {
  const [result, setResult] = useState<Result | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await api(`v1/portal/accesos/${accessId}/ingresar`, "POST", {
        codigo: String(form.get("codigo")).trim(),
      });
      setResult(await api<Result>("v1/portal/informe"));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No pudimos consultar el resultado.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="login patient">
      <p className="eyebrow">Consulta privada</p>
      <h1>{result ? "Tu resultado" : "Consulta tu resultado"}</h1>
      <div role="alert">{error && <p className="error">{error}</p>}</div>
      {!result ? (
        <>
          <p className="lead">
            Ingresa el código que te entregamos en la clínica.
          </p>
          <form onSubmit={login}>
            <label>
              Código de acceso
              <input
                name="codigo"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                required
                minLength={12}
                maxLength={24}
                aria-describedby="codigo-ayuda"
              />
              <small id="codigo-ayuda">
                Es el código de 12 caracteres del comprobante. No es tu CI ni tu
                número PAC.
              </small>
            </label>
            <button className="primary" disabled={busy}>
              {busy ? "Consultando…" : "Consultar resultado"}
            </button>
          </form>
        </>
      ) : (
        <>
          <section className="identity">
            <strong>{result.estudio}</strong>
            <span>{dateLabel(result.fechaEstudio)}</span>
            <span>{result.medico}</span>
          </section>
          <p role="status">{result.mensaje}</p>
          {result.disponible && (
            <a
              className="button primary"
              href="/api/v1/portal/informe/pdf"
              target="_blank"
              rel="noreferrer"
            >
              Descargar PDF
            </a>
          )}
          <button
            className="back"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api("v1/portal/salir", "POST");
                setResult(null);
              } catch {
                setError("No pudimos cerrar la consulta. Intenta nuevamente.");
              } finally {
                setBusy(false);
              }
            }}
          >
            Cerrar consulta
          </button>
        </>
      )}
      <aside className="help">
        <h2>¿Necesitas ayuda?</h2>
        <p>
          Si no tienes el código o tu acceso venció, solicita uno nuevo a la
          clínica. No envíes tu informe por este enlace de ayuda.
        </p>
        <a
          href="https://wa.me/59175031306?text=Necesito%20ayuda%20para%20consultar%20mi%20resultado"
          rel="noreferrer"
          target="_blank"
        >
          Contactar con atención al paciente
        </a>
      </aside>
    </section>
  );
}
