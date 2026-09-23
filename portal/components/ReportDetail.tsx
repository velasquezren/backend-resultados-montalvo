"use client";
import { FormEvent, useRef, useState } from 'react';
import { api, ApiError, upload as uploadWithProgress } from '@/lib/client';
import { Access, Report, dateLabel, reportLabels } from '@/lib/types';
import { Feedback, AccessCard, message } from './shared';
export default function ReportDetail({
  report,
  initialAccess,
  onChange,
  onBack,
}: {
  report: Report;
  initialAccess: Access | null;
  onChange: (report: Report) => void;
  onBack: () => void;
}) {
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [access, setAccess] = useState<Access | null>(initialAccess);
  const [confirmed, setConfirmed] = useState(false),
    [file, setFile] = useState<File | null>(null),
    [progress, setProgress] = useState<number | null>(null);
  const dialog = useRef<HTMLDialogElement>(null),
    renewDialog = useRef<HTMLDialogElement>(null);
  async function action(fn: () => Promise<void>) {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      setError(message(err));
      if (err instanceof ApiError && err.status === 409)
        try {
          onChange(await api<Report>(`v1/informes/${report.id}`));
        } catch {}
    } finally {
      setBusy(false);
    }
  }
  async function submitFile(event: FormEvent) {
    event.preventDefault();
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError("Adjunta un PDF de hasta 10 MB.");
      return;
    }
    await action(async () => {
      const form = new FormData();
      form.set("archivo", file);
      form.set("revision", String(report.revision));
      setProgress(0);
      try {
        onChange(
          await uploadWithProgress<Report>(
            `v1/informes/${report.id}/pdf`,
            form,
            setProgress,
          ),
        );
      } finally {
        setProgress(null);
      }
      setFile(null);
      setConfirmed(false);
      setNotice("PDF guardado. Revísalo antes de publicar.");
    });
  }
  async function publish(event: FormEvent) {
    event.preventDefault();
    await action(async () => {
      onChange(
        await api<Report>(`v1/informes/${report.id}/publicar`, "POST", {
          revision: report.revision,
          pacienteYPdfConfirmados: confirmed,
        }),
      );
      setNotice(
        "Informe publicado. Recepción le enviará el enlace al paciente por WhatsApp.",
      );
    });
  }
  return (
    <section className="editor">
      <button className="back" disabled={busy} onClick={onBack}>
        ← Mis informes
      </button>
      <div className="page-heading">
        <div>
          <p className="eyebrow">{reportLabels[report.estado]}</p>
          <h1>{report.estudio}</h1>
          <p className="muted">
            {dateLabel(report.fechaEstudio)} · {report.medico.nombre}
          </p>
        </div>
      </div>
      <section className="identity">
        <strong>{report.paciente.nombre}</strong>
        <span>
          {report.paciente.ci ? `CI ${report.paciente.ci}` : ""}
          {report.paciente.pac ? ` · PAC ${report.paciente.pac}` : ""}
        </span>
      </section>
      <Feedback error={error} notice={notice} />
      {report.estado === "BORRADOR" && (
        <form className="section" onSubmit={submitFile}>
          <h2>{report.archivoId ? "PDF adjunto" : "Adjunta el resultado"}</h2>
          <p>
            PDF de hasta 10 MB, sin contraseña, scripts ni archivos adjuntos.
          </p>
          <label>
            {report.archivoId ? "Seleccionar otro PDF" : "Archivo PDF"}
            <input
              type="file"
              accept="application/pdf,.pdf"
              disabled={busy}
              onChange={(e) => {
                setFile(e.target.files?.[0] || null);
                setConfirmed(false);
              }}
            />
          </label>
          {file && (
            <p className="muted">
              {file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB
            </p>
          )}
          {progress !== null && (
            <div className="progress" role="status" aria-live="polite">
              <div
                className="progress-track"
                role="progressbar"
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <span style={{ width: `${progress}%` }} />
              </div>
              <small>
                {progress < 100
                  ? `Subiendo… ${progress}%`
                  : "Analizando el documento…"}
              </small>
            </div>
          )}
          <button disabled={!file || busy}>
            {busy ? "Procesando…" : "Guardar PDF"}
          </button>
        </form>
      )}
      {report.archivo && (
        <section className="section">
          <h2>Revisa el documento</h2>
          <p className="muted">
            {report.archivo.paginas} páginas ·{" "}
            {(report.archivo.bytes / 1024 / 1024).toFixed(1)} MB
          </p>
          <iframe
            className="pdf-preview"
            // La revisión cambia con cada carga: evita que el navegador muestre el PDF anterior.
            src={`/api/v1/informes/${report.id}/pdf?v=${report.revision}`}
            title={`Vista previa del informe de ${report.paciente.nombre}`}
          />
          <a
            className="button"
            href={`/api/v1/informes/${report.id}/pdf?v=${report.revision}`}
            target="_blank"
            rel="noreferrer"
          >
            Abrir en otra pestaña
          </a>
        </section>
      )}
      {report.estado === "BORRADOR" && report.archivoId && (
        <form onSubmit={publish} className="section">
          <h2>Antes de publicar</h2>
          <label className="check">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              required
              disabled={busy}
            />
            <span>
              Revisé el PDF y confirmé que corresponde a{" "}
              {report.paciente.nombre}.
            </span>
          </label>
          {/* El aviso lo manda recepción desde el CRM, que es quien tiene la
              conversación con el paciente: aquí no se pide teléfono ni
              consentimiento, y el médico no envía nada. */}
          <p className="muted">
            Al publicar, el informe aparece en la cola de recepción del CRM, que
            le envía al paciente el enlace por WhatsApp. Al abrirlo verá su
            informe directamente.
          </p>
          <div className="sticky-action">
            <p>El paciente podrá consultar el resultado cuando lo publiques.</p>
            <button className="primary" disabled={busy || !confirmed || !!file}>
              {busy ? "Publicando…" : "Publicar informe"}
            </button>
            {file && (
              <small>
                Guarda primero el PDF seleccionado o recarga para conservar el
                anterior.
              </small>
            )}
          </div>
        </form>
      )}
      {report.estado !== "RETIRADO" && (access || report.acceso) && (
        <AccessCard access={access || report.acceso!} />
      )}
      {report.estado !== "RETIRADO" && (
        <section className="section actions">
          <button
            disabled={busy}
            onClick={() => renewDialog.current?.showModal()}
          >
            Extender el enlace 30 días
          </button>
          <button
            className="danger"
            disabled={busy}
            onClick={() => dialog.current?.showModal()}
          >
            Retirar informe
          </button>
        </section>
      )}
      <dialog ref={renewDialog}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void action(async () => {
              setAccess(
                await api<Access>(
                  `v1/informes/${report.id}/acceso/renovar`,
                  "POST",
                ),
              );
              onChange(await api<Report>(`v1/informes/${report.id}`));
              renewDialog.current?.close();
              setNotice(
                "Enlace extendido 30 días. El paciente puede volver a abrir el mismo mensaje.",
              );
            });
          }}
        >
          <h2>Extender el enlace</h2>
          <p>
            El enlace que el paciente ya tiene vuelve a funcionar durante 30 días
            más. Para cortarlo del todo, retira el informe.
          </p>
          <Feedback error={error} />
          <div className="actions">
            <button
              type="button"
              disabled={busy}
              onClick={() => renewDialog.current?.close()}
            >
              Cancelar
            </button>
            <button className="primary" disabled={busy}>
              Extender 30 días
            </button>
          </div>
        </form>
      </dialog>
      <dialog ref={dialog}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void action(async () => {
              onChange(
                await api<Report>(`v1/informes/${report.id}/retirar`, "POST", {
                  revision: report.revision,
                  motivo: String(form.get("motivo")).trim(),
                }),
              );
              dialog.current?.close();
              setAccess(null);
              setNotice("Informe retirado. El acceso quedó desactivado.");
            });
          }}
        >
          <h2>Retirar este informe</h2>
          <p>
            El paciente ya no podrá consultarlo, aunque ya haya recibido el
            enlace. Los archivos descargados no pueden recuperarse. Para
            corregirlo, crea un nuevo informe.
          </p>
          <label>
            Motivo del retiro
            <textarea name="motivo" required minLength={5} maxLength={250} />
          </label>
          <Feedback error={error} />
          <div className="actions">
            <button
              type="button"
              disabled={busy}
              onClick={() => dialog.current?.close()}
            >
              Cancelar
            </button>
            <button className="danger" disabled={busy}>
              Confirmar retiro
            </button>
          </div>
        </form>
      </dialog>
    </section>
  );
}
