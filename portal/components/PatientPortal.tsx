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

/* Íconos de trazo, del tamaño del texto; sin librería para cinco dibujos. */
const Icono = ({ d, tam = 18 }: { d: string; tam?: number }) => (
  <svg viewBox="0 0 24 24" width={tam} height={tam} fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);
const DOCUMENTO = "M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h5";
const CANDADO = "M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4";
const CALENDARIO = "M7 3v3M17 3v3M4 8h16M5 5h14v16H5z";
const MENSAJE = "M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z";
const FLECHA = "M9 6l6 6-6 6";

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
    <div className="pac-pantalla">
      {estado.tipo === "abriendo" && (
        <article className="pac-tarjeta" role="status" aria-label="Abriendo tu resultado">
          <span className="pac-esqueleto" style={{ width: 96, height: 24, borderRadius: 999 }} />
          <span className="pac-esqueleto" style={{ width: "78%", height: 30, marginTop: 18 }} />
          <span className="pac-esqueleto" style={{ width: "52%", height: 16, marginTop: 10 }} />
          <span className="pac-esqueleto" style={{ width: "100%", height: 52, marginTop: 28, borderRadius: 999 }} />
        </article>
      )}

      {estado.tipo === "listo" && (
        <>
          <article className="pac-tarjeta">
            <span className="pac-estado">
              <i className="pac-punto" aria-hidden="true" />
              {estado.result.disponible ? "Listo para ver" : "Tu informe"}
            </span>
            <h1 className="pac-titulo">{estado.result.estudio}</h1>
            <p className="pac-meta">
              <span>{dateLabel(estado.result.fechaEstudio)}</span>
              {estado.result.medico && <span>{estado.result.medico}</span>}
            </p>
            {estado.result.disponible ? (
              <>
                <a className="pac-boton" href="/api/v1/portal/informe/pdf" target="_blank" rel="noreferrer">
                  <Icono d={DOCUMENTO} /> Ver informe
                </a>
                <p className="pac-nota">Se abre en el visor de tu teléfono, desde donde puedes guardarlo.</p>
              </>
            ) : (
              <p role="status" className="pac-aviso">{estado.result.mensaje}</p>
            )}
          </article>

          <nav className="pac-lista" aria-label="Qué más puedes hacer">
            <a className="pac-fila" rel="noreferrer" target="_blank"
              href={whatsapp(`Hola, recibí mi resultado de ${estado.result.estudio} y quiero agendar una consulta para revisarlo.`)}>
              <span className="pac-fila-icono"><Icono d={CALENDARIO} /></span>
              <span className="pac-fila-texto">
                <strong>Agendar una consulta</strong>
                <small>Revísalo con tu médico</small>
              </span>
              <Icono d={FLECHA} tam={16} />
            </a>
            <a className="pac-fila" href={AYUDA} rel="noreferrer" target="_blank">
              <span className="pac-fila-icono"><Icono d={MENSAJE} /></span>
              <span className="pac-fila-texto">
                <strong>¿Necesitas ayuda?</strong>
                <small>Escríbenos por WhatsApp</small>
              </span>
              <Icono d={FLECHA} tam={16} />
            </a>
          </nav>

          <p className="pac-privado"><Icono d={CANDADO} tam={14} /> Enlace personal. Por tu privacidad, no lo reenvíes.</p>
        </>
      )}

      {estado.tipo === "enlace-inactivo" && (
        <article className="pac-tarjeta">
          <h1 className="pac-titulo">Este enlace ya no está activo</h1>
          <p className="pac-texto">{estado.mensaje}</p>
          <a className="pac-boton" rel="noreferrer" target="_blank"
            href={whatsapp("Hola, mi enlace de resultados venció. ¿Me pueden enviar uno nuevo?")}>
            <Icono d={MENSAJE} /> Pedir un enlace nuevo
          </a>
        </article>
      )}

      {estado.tipo === "error" && (
        <article className="pac-tarjeta" role="alert">
          <h1 className="pac-titulo">No pudimos abrir tu resultado</h1>
          <p className="pac-texto">{estado.mensaje}</p>
          <button className="pac-boton" onClick={() => void abrir()}>Intentar de nuevo</button>
          <a className="pac-enlace" href={AYUDA} rel="noreferrer" target="_blank">Escríbenos por WhatsApp</a>
        </article>
      )}
    </div>
  );
}
