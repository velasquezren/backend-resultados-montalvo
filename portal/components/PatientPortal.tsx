"use client";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/client";
import { dateLabel } from "@/lib/types";
type Result = {
  estudio: string;
  fechaEstudio: string;
  medico: string;
  disponible: boolean;
  mensaje: string;
};
type Estado =
  | { tipo: "abriendo" }
  | { tipo: "listo"; result: Result }
  | { tipo: "enlace-inactivo"; mensaje: string }
  | { tipo: "error"; mensaje: string };

const AYUDA =
  "https://wa.me/59175031306?text=Necesito%20ayuda%20para%20ver%20mi%20resultado";

/**
 * Consulta del paciente. El enlace del WhatsApp es la llave: la página se abre
 * sola y muestra el informe, sin pedir código ni documento (decidido con la
 * clínica el 2026-09-23; el código de 12 caracteres en papel era el paso que
 * más frenaba al paciente).
 *
 * El PDF no se abre automáticamente al cargar: en Android navegar directo a un
 * PDF suele descargarlo en vez de mostrarlo, y el paciente se queda sin saber
 * dónde fue. Un botón grande que lo abre en el visor del teléfono es un toque
 * más y ninguna duda.
 */
export default function PatientPortal({ accessId }: { accessId: string }) {
  const [estado, setEstado] = useState<Estado>({ tipo: "abriendo" });

  const abrir = useCallback(async () => {
    setEstado({ tipo: "abriendo" });
    try {
      await api(`v1/portal/accesos/${accessId}/ingresar`, "POST");
      setEstado({ tipo: "listo", result: await api<Result>("v1/portal/informe") });
    } catch (err) {
      /* 401 es un enlace vencido o retirado: se dice qué hacer, no «error». */
      if (err instanceof ApiError && err.status === 401)
        setEstado({ tipo: "enlace-inactivo", mensaje: err.message });
      else
        setEstado({
          tipo: "error",
          mensaje:
            err instanceof Error ? err.message : "No pudimos abrir tu resultado.",
        });
    }
  }, [accessId]);

  useEffect(() => {
    void abrir();
  }, [abrir]);

  return (
    <section className="login patient">
      <p className="eyebrow">Clínica Montalvo</p>
      {estado.tipo === "abriendo" && (
        <>
          <h1>Abriendo tu resultado…</h1>
          <p className="lead" role="status">
            Un momento, por favor.
          </p>
        </>
      )}
      {estado.tipo === "listo" && (
        <>
          <h1>Tu resultado</h1>
          <section className="identity">
            <strong>{estado.result.estudio}</strong>
            <span>{dateLabel(estado.result.fechaEstudio)}</span>
            <span>{estado.result.medico}</span>
          </section>
          {estado.result.disponible ? (
            <a
              className="button primary patient-open"
              href="/api/v1/portal/informe/pdf"
              target="_blank"
              rel="noreferrer"
            >
              Ver mi informe
            </a>
          ) : (
            <p role="status">{estado.result.mensaje}</p>
          )}
        </>
      )}
      {estado.tipo === "enlace-inactivo" && (
        <>
          <h1>Este enlace ya no está activo</h1>
          <p className="lead">{estado.mensaje}</p>
          <a className="button primary" href={AYUDA} rel="noreferrer" target="_blank">
            Pedir un enlace nuevo
          </a>
        </>
      )}
      {estado.tipo === "error" && (
        <>
          <h1>No pudimos abrir tu resultado</h1>
          <div role="alert">
            <p className="error">{estado.mensaje}</p>
          </div>
          <button className="primary" onClick={() => void abrir()}>
            Intentar de nuevo
          </button>
        </>
      )}
      <aside className="help">
        <h2>¿Necesitas ayuda?</h2>
        <p>Escríbenos por WhatsApp y te ayudamos a ver tu resultado.</p>
        <a href={AYUDA} rel="noreferrer" target="_blank">
          Contactar con atención al paciente
        </a>
      </aside>
    </section>
  );
}
