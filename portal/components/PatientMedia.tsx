"use client";
import { useEffect, useRef, useState } from "react";
import { nombreDeArchivo, tamano } from "@/lib/medios";
import { AdjuntoPaciente } from "@/lib/types";

type Compartir =
  | { paso: "nada" }
  | { paso: "preparando" }
  | { paso: "listo"; archivo: File }
  | { paso: "error"; mensaje: string };

/* Íconos de trazo, del tamaño del texto. */
const Icono = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);
const GUARDAR = "M12 3v12M7 10l5 5 5-5M5 21h14";
const COMPARTIR = "M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M16 6l-4-4-4 4M12 2v14";

const ruta = (id: string) => `/api/v1/portal/informe/adjuntos/${id}`;

/**
 * Los videos e imágenes que el médico sumó al informe: se ven aquí mismo, se
 * guardan en el teléfono y se comparten con quien la paciente quiera.
 *
 * Compartir manda el ARCHIVO, no el enlace: el informe sigue siendo privado.
 * Va en dos toques porque el iPhone solo abre el menú de compartir justo
 * después de un toque, y bajar un video de 40 MB tarda más que eso: el primero
 * lo prepara, el segundo lo comparte.
 *
 * La sesión del enlace dura 15 minutos. `asegurarSesion` la renueva antes de
 * guardar o compartir, y un video que falla a mitad (sesión vencida mientras
 * se miraba) se recupera solo, en el segundo en que iba.
 */
export default function PatientMedia({
  adjuntos,
  asegurarSesion,
}: {
  adjuntos: AdjuntoPaciente[];
  asegurarSesion: (forzar?: boolean) => Promise<void>;
}) {
  /* Se averigua en el navegador: en el servidor no existe `navigator`. */
  const [puedeCompartir, setPuedeCompartir] = useState(false);
  useEffect(() => {
    try {
      setPuedeCompartir(
        typeof navigator.canShare === "function" &&
          navigator.canShare({ files: [new File([""], "prueba.mp4", { type: "video/mp4" })] }),
      );
    } catch {
      setPuedeCompartir(false);
    }
  }, []);

  const videos = adjuntos.filter((a) => a.tipo === "VIDEO").length;
  const titulo =
    videos === adjuntos.length
      ? videos === 1 ? "Tu video" : "Tus videos"
      : videos === 0
        ? adjuntos.length === 1 ? "Tu imagen" : "Tus imágenes"
        : "Tus videos e imágenes";

  return (
    <section className="pac-medios" aria-labelledby="pac-medios-titulo">
      <h2 id="pac-medios-titulo" className="pac-medios-titulo">{titulo}</h2>
      {adjuntos.map((adjunto, indice) => (
        <Medio
          key={adjunto.id}
          adjunto={adjunto}
          etiqueta={`${adjunto.tipo === "VIDEO" ? "Video" : "Imagen"} ${adjuntos.length > 1 ? indice + 1 : ""}`.trim()}
          puedeCompartir={puedeCompartir}
          asegurarSesion={asegurarSesion}
        />
      ))}
      <p className="pac-nota">Al compartir envías solo el archivo: tu informe y este enlace siguen siendo privados.</p>
    </section>
  );
}

function Medio({
  adjunto,
  etiqueta,
  puedeCompartir,
  asegurarSesion,
}: {
  adjunto: AdjuntoPaciente;
  etiqueta: string;
  puedeCompartir: boolean;
  asegurarSesion: (forzar?: boolean) => Promise<void>;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const reintentado = useRef(false);
  /** Dónde retomar cuando el video vuelva a cargar tras renovar la sesión. */
  const retomarEn = useRef<number | null>(null);
  const [version, setVersion] = useState(0);
  const [compartir, setCompartir] = useState<Compartir>({ paso: "nada" });
  const src = `${ruta(adjunto.id)}${version ? `?s=${version}` : ""}`;

  /** El video se cortó (casi siempre, la sesión venció mientras se miraba): renovar y seguir donde iba. */
  async function alFallar() {
    if (reintentado.current) return;
    reintentado.current = true;
    const segundo = video.current?.currentTime ?? 0;
    try {
      await asegurarSesion(true);
    } catch {
      setCompartir({ paso: "error", mensaje: "No pudimos seguir mostrando el video. Recarga la página para verlo." });
      return;
    }
    retomarEn.current = segundo > 0 ? segundo : null;
    setVersion((v) => v + 1);
  }

  /** Ya cargó (de nuevo): si venía de una sesión vencida, sigue en el segundo en que iba. */
  function alCargar() {
    reintentado.current = false;
    const reproductor = video.current;
    if (!reproductor || retomarEn.current === null) return;
    reproductor.currentTime = retomarEn.current;
    retomarEn.current = null;
    void reproductor.play().catch(() => undefined);
  }

  async function guardar(evento: React.MouseEvent<HTMLAnchorElement>) {
    evento.preventDefault();
    const destino = evento.currentTarget.href;
    try {
      await asegurarSesion();
    } catch {
      setCompartir({ paso: "error", mensaje: "No pudimos preparar la descarga. Recarga la página e intenta de nuevo." });
      return;
    }
    // El servidor lo entrega como descarga: el teléfono lo guarda sin salir de esta página.
    window.location.assign(destino);
  }

  async function preparar() {
    setCompartir({ paso: "preparando" });
    try {
      await asegurarSesion();
      let respuesta = await fetch(ruta(adjunto.id), { credentials: "same-origin", cache: "no-store" });
      if (respuesta.status === 401) {
        await asegurarSesion(true);
        respuesta = await fetch(ruta(adjunto.id), { credentials: "same-origin", cache: "no-store" });
      }
      if (!respuesta.ok) throw new Error("No pudimos preparar el archivo. Intenta de nuevo.");
      const nombre = nombreDeArchivo(respuesta.headers.get("content-disposition"), `clinica-montalvo.${adjunto.mime.split("/")[1]}`);
      setCompartir({ paso: "listo", archivo: new File([await respuesta.blob()], nombre, { type: adjunto.mime }) });
    } catch (err) {
      setCompartir({ paso: "error", mensaje: err instanceof Error ? err.message : "No pudimos preparar el archivo." });
    }
  }

  async function enviar(archivo: File) {
    try {
      await navigator.share({ files: [archivo], title: "Mi estudio — Clínica Montalvo" });
      setCompartir({ paso: "nada" });
    } catch (err) {
      // Cerrar el menú sin elegir no es un error: el archivo sigue listo.
      if (err instanceof DOMException && err.name === "AbortError") return;
      setCompartir({ paso: "error", mensaje: "Tu teléfono no permitió compartirlo. Usa «Guardar» y compártelo desde tu galería." });
    }
  }

  return (
    <article className="pac-medio">
      {adjunto.tipo === "VIDEO" ? (
        // `#t=0.001`: Safari pinta el primer cuadro en vez de un recuadro negro.
        <video
          ref={video}
          key={version}
          className="pac-medio-vista"
          src={`${src}#t=0.001`}
          controls
          playsInline
          preload="metadata"
          aria-label={etiqueta}
          onLoadedMetadata={alCargar}
          onError={() => void alFallar()}
        />
      ) : (
        <a href={src} target="_blank" rel="noreferrer" aria-label={`${etiqueta}: abrir en grande`}>
          <img className="pac-medio-vista" src={src} alt={etiqueta} loading="lazy" />
        </a>
      )}
      <div className="pac-medio-pie">
        <span className="pac-medio-dato">{etiqueta} · {tamano(adjunto.bytes)}</span>
        <div className="pac-medio-acciones">
          <a className="pac-boton-sec" href={`${ruta(adjunto.id)}?descargar=1`} download onClick={(e) => void guardar(e)}>
            <Icono d={GUARDAR} /> Guardar
          </a>
          {puedeCompartir &&
            (compartir.paso === "listo" ? (
              <button type="button" className="pac-boton-sec pac-boton-sec-lleno" onClick={() => void enviar(compartir.archivo)}>
                <Icono d={COMPARTIR} /> Compartir ahora
              </button>
            ) : (
              <button type="button" className="pac-boton-sec" disabled={compartir.paso === "preparando"} onClick={() => void preparar()}>
                <Icono d={COMPARTIR} /> {compartir.paso === "preparando" ? "Preparando…" : "Compartir"}
              </button>
            ))}
        </div>
      </div>
      {compartir.paso === "error" && <p role="alert" className="pac-medio-error">{compartir.mensaje}</p>}
    </article>
  );
}
