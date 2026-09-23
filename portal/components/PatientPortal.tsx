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

/** La línea de Recepción: la misma desde la que llega el aviso, así la
    respuesta del paciente cae en ese mismo chat del CRM. */
const WHATSAPP_CLINICA = "59175031306";
const whatsapp = (texto: string) =>
  `https://wa.me/${WHATSAPP_CLINICA}?text=${encodeURIComponent(texto)}`;
const AYUDA = whatsapp("Hola, necesito ayuda para ver mi resultado.");

/* Íconos de trazo, del tamaño del texto; sin librería para cuatro dibujos. */
const Icono = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);
const CHECK = "M20 6 9 17l-5-5";
const DOCUMENTO = "M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h5";
const CANDADO = "M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4";
const CALENDARIO = "M7 3v3M17 3v3M4 8h16M5 5h14v16H5z";

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
      {estado.tipo === "abriendo" && (
        <div className="resultado resultado-cargando" role="status" aria-label="Abriendo tu resultado">
          <span className="esqueleto esqueleto-chip" />
          <span className="esqueleto esqueleto-titulo" />
          <span className="esqueleto esqueleto-linea" />
          <span className="esqueleto esqueleto-boton" />
        </div>
      )}
      {estado.tipo === "listo" && (
        <>
          <article className="resultado">
            <p className="resultado-estado">
              <span className="resultado-check"><Icono d={CHECK} /></span>
              {estado.result.disponible ? "Tu informe está listo" : "Tu informe"}
            </p>
            <h1>{estado.result.estudio}</h1>
            <p className="resultado-meta">
              {dateLabel(estado.result.fechaEstudio)}
              {estado.result.medico && <> · {estado.result.medico}</>}
            </p>
            {estado.result.disponible ? (
              <>
                <a className="button primary patient-open" href="/api/v1/portal/informe/pdf"
                  target="_blank" rel="noreferrer">
                  <Icono d={DOCUMENTO} /> Ver mi informe
                </a>
                <p className="resultado-nota">
                  Se abre en el visor de tu teléfono. Desde ahí puedes guardarlo o
                  compartirlo con tu médico.
                </p>
              </>
            ) : (
              <p role="status" className="notice">{estado.result.mensaje}</p>
            )}
          </article>

          {/* El siguiente paso natural después de recibir un resultado. */}
          <a className="siguiente-paso" rel="noreferrer" target="_blank"
            href={whatsapp(`Hola, recibí mi resultado de ${estado.result.estudio} y quiero agendar una consulta para revisarlo.`)}>
            <span className="siguiente-icono"><Icono d={CALENDARIO} /></span>
            <span>
              <strong>¿Quieres revisarlo con tu médico?</strong>
              <small>Agenda una consulta por WhatsApp</small>
            </span>
            <span className="siguiente-flecha" aria-hidden="true">›</span>
          </a>

          <p className="privado"><Icono d={CANDADO} /> Este enlace es personal. Por tu privacidad, no lo reenvíes.</p>
        </>
      )}
      {estado.tipo === "enlace-inactivo" && (
        <div className="resultado">
          <h1>Este enlace ya no está activo</h1>
          <p className="lead">{estado.mensaje}</p>
          <a className="button primary" href={whatsapp("Hola, mi enlace de resultados venció. ¿Me pueden enviar uno nuevo?")} rel="noreferrer" target="_blank">
            Pedir un enlace nuevo
          </a>
        </div>
      )}
      {estado.tipo === "error" && (
        <div className="resultado">
          <h1>No pudimos abrir tu resultado</h1>
          <div role="alert">
            <p className="error">{estado.mensaje}</p>
          </div>
          <button className="primary" onClick={() => void abrir()}>
            Intentar de nuevo
          </button>
        </div>
      )}
      <p className="ayuda-pie">
        ¿Problemas para verlo?{" "}
        <a href={AYUDA} rel="noreferrer" target="_blank">Escríbenos por WhatsApp</a>
      </p>
    </section>
  );
}
