"use client";
import { useState } from "react";
import { api, upload } from "@/lib/client";
import { ACEPTA_ADJUNTOS, motivoParaNoSubir, tamano } from "@/lib/medios";
import { Adjunto, Report } from "@/lib/types";
import { Feedback, message } from "./shared";

type Subiendo = { nombre: string; posicion: number; total: number; avance: number };

/**
 * Videos e imágenes para el paciente: un clip de la ecografía, un video 4D,
 * un GIF. El paciente los ve en su enlace junto al informe, y puede guardarlos
 * y compartirlos.
 *
 * Se pueden sumar también con el informe ya publicado —casi todos llegan así
 * desde FileMaker—: lo inmutable es el PDF del resultado, no lo que lo
 * acompaña. Y se pueden quitar: un video en la ficha equivocada tiene que
 * desaparecer en el acto.
 */
export default function ReportMedia({
  report,
  maxBytes,
  maxAdjuntos,
  onChange,
}: {
  report: Report;
  maxBytes: number;
  maxAdjuntos: number;
  onChange: (report: Report) => void;
}) {
  const [subiendo, setSubiendo] = useState<Subiendo | null>(null),
    [quitando, setQuitando] = useState<string | null>(null),
    [confirmar, setConfirmar] = useState<string | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [entrada, setEntrada] = useState(0);
  const ocupado = subiendo !== null || quitando !== null;
  const editable = report.estado !== "RETIRADO";
  const quedan = maxAdjuntos - report.adjuntos.length;

  /** De a uno: si falla uno, los demás siguen, y al final se dice cuál y por qué. */
  async function subir(archivos: File[]) {
    setError("");
    setNotice("");
    const errores: string[] = [];
    const validos = archivos.filter((archivo) => {
      const motivo = motivoParaNoSubir(archivo, maxBytes);
      if (motivo) errores.push(motivo);
      return !motivo;
    });
    if (validos.length > quedan) {
      errores.push(
        `Caben ${quedan} más en este informe (máximo ${maxAdjuntos}); no se subieron: ${validos
          .slice(quedan)
          .map((a) => `«${a.name}»`)
          .join(", ")}.`,
      );
      validos.splice(quedan);
    }
    let subidos = 0;
    for (const [indice, archivo] of validos.entries()) {
      setSubiendo({ nombre: archivo.name, posicion: indice + 1, total: validos.length, avance: 0 });
      const form = new FormData();
      form.set("archivo", archivo);
      try {
        onChange(
          await upload<Report>(`v1/informes/${report.id}/adjuntos`, form, (avance) =>
            setSubiendo((actual) => (actual ? { ...actual, avance } : actual)),
          ),
        );
        subidos++;
      } catch (err) {
        errores.push(`«${archivo.name}»: ${message(err)}`);
      }
    }
    setSubiendo(null);
    setEntrada((n) => n + 1); // vacía el selector para poder elegir el mismo archivo otra vez
    setError(errores.join(" "));
    if (subidos)
      setNotice(
        report.estado === "PUBLICADO"
          ? `${subidos === 1 ? "Listo: el paciente lo verá" : `Listos: el paciente verá los ${subidos}`} la próxima vez que abra su enlace.`
          : `${subidos === 1 ? "Guardado" : `${subidos} guardados`}. El paciente los verá junto al informe cuando lo publiques.`,
      );
  }

  async function quitar(adjunto: Adjunto) {
    setError("");
    setNotice("");
    setQuitando(adjunto.id);
    try {
      onChange(await api<Report>(`v1/informes/${report.id}/adjuntos/${adjunto.id}/eliminar`, "POST"));
      setNotice(`Quitado «${adjunto.nombre}». El paciente ya no lo verá.`);
    } catch (err) {
      setError(message(err));
    } finally {
      setQuitando(null);
      setConfirmar(null);
    }
  }

  if (!editable && report.adjuntos.length === 0) return null;
  return (
    <section className="section medios">
      <h2>Videos e imágenes para el paciente</h2>
      <p className="muted">
        {editable
          ? `Un clip de la ecografía, un video 4D o una imagen. El paciente los ve en su enlace junto al informe y puede guardarlos y compartirlos. Hasta ${maxAdjuntos} por informe, de ${tamano(maxBytes)} cada uno: MP4, MOV o WebM; JPG, PNG, GIF o WebP.`
          : "El informe fue retirado: el paciente ya no puede verlos."}
      </p>
      <Feedback error={error} notice={notice} />

      {report.adjuntos.length > 0 && (
        <ul className="medios-lista">
          {report.adjuntos.map((adjunto) => {
            const url = `/api/v1/informes/${report.id}/adjuntos/${adjunto.id}`;
            return (
              <li key={adjunto.id} className="medio" aria-busy={quitando === adjunto.id}>
                {adjunto.tipo === "VIDEO" ? (
                  // `#t=0.001` hace que Safari pinte el primer cuadro en vez de un recuadro negro.
                  <video className="medio-vista" src={`${url}#t=0.001`} controls playsInline preload="metadata" aria-label={`Vista previa de ${adjunto.nombre}`} />
                ) : (
                  <img className="medio-vista" src={url} alt={`Vista previa de ${adjunto.nombre}`} loading="lazy" />
                )}
                <div className="medio-datos">
                  <strong title={adjunto.nombre}>{adjunto.nombre}</strong>
                  <small>
                    {adjunto.tipo === "VIDEO" ? "Video" : "Imagen"} · {tamano(adjunto.bytes)}
                  </small>
                </div>
                {editable &&
                  (confirmar === adjunto.id ? (
                    <div className="medio-confirmar" role="group" aria-label={`Quitar ${adjunto.nombre}`}>
                      <span>¿Quitarlo? El paciente dejará de verlo.</span>
                      <button type="button" className="danger" disabled={ocupado} onClick={() => void quitar(adjunto)}>
                        {quitando === adjunto.id ? "Quitando…" : "Sí, quitar"}
                      </button>
                      <button type="button" disabled={ocupado} onClick={() => setConfirmar(null)}>
                        No
                      </button>
                    </div>
                  ) : (
                    <button type="button" className="danger" disabled={ocupado} onClick={() => setConfirmar(adjunto.id)}>
                      Quitar
                    </button>
                  ))}
              </li>
            );
          })}
        </ul>
      )}

      {editable &&
        (quedan > 0 ? (
          <label>
            {report.adjuntos.length ? "Agregar más" : "Elegir videos o imágenes"}
            <small>Puedes elegir varios a la vez.</small>
            <input
              key={entrada}
              type="file"
              multiple
              accept={ACEPTA_ADJUNTOS}
              disabled={ocupado}
              onChange={(e) => {
                const archivos = Array.from(e.target.files ?? []);
                if (archivos.length) void subir(archivos);
              }}
            />
          </label>
        ) : (
          <p className="muted">Llegaste al máximo de {maxAdjuntos}. Quita alguno para agregar otro.</p>
        ))}

      {subiendo && (
        <div className="progress" role="status" aria-live="polite">
          <div className="progress-track" role="progressbar" aria-valuenow={subiendo.avance} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${subiendo.avance}%` }} />
          </div>
          <small>
            {subiendo.total > 1 ? `${subiendo.posicion} de ${subiendo.total} · ` : ""}
            {subiendo.avance < 100 ? `Subiendo «${subiendo.nombre}»… ${subiendo.avance}%` : `Verificando «${subiendo.nombre}»…`}
          </small>
        </div>
      )}
    </section>
  );
}
