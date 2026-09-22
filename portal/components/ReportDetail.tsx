"use client";
import { FormEvent, useRef, useState } from 'react';
import { api, ApiError, upload as uploadWithProgress } from '@/lib/client';
import { Access, Config, Report, dateLabel, notificationLabels, reportLabels } from '@/lib/types';
import { Feedback, AccessCard, message } from './shared';
export default function ReportDetail({
  report,
  config,
  initialAccess,
  onChange,
  onBack,
}: {
  report: Report;
  config: Config | null;
  initialAccess: Access | null;
  onChange: (report: Report) => void;
  onBack: () => void;
}) {
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [access, setAccess] = useState<Access | null>(initialAccess);
  const [confirmed, setConfirmed] = useState(false),
    [notify, setNotify] = useState(false),
    [phone, setPhone] = useState(false),
    [consent, setConsent] = useState(false),
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
          notificar: notify,
          ...(notify
            ? {
                telefonoConfirmado: phone,
                consentimientoWhatsApp: consent,
                consentimientoVersion: "resultados-v1",
              }
            : {}),
        }),
      );
      setNotice(
        notify
          ? "Informe publicado. El aviso quedó pendiente de envío."
          : "Informe publicado. Puedes entregar el acceso al paciente.",
      );
    });
  }
  const canNotify =
    !!config?.notificacionesHabilitadas && !!report.paciente.telefono;
  const notificationFields = (
    <section className="notification">
      <h3>Aviso al paciente</h3>
      {canNotify ? (
        <>
          <label className="check">
            <input
              type="checkbox"
              checked={notify}
              disabled={busy}
              onChange={(e) => {
                setNotify(e.target.checked);
                setPhone(false);
                setConsent(false);
              }}
            />
            <span>Autorizar un aviso de WhatsApp</span>
          </label>
          {notify && (
            <div className="section">
              <p>
                Se enviará a <strong>{report.paciente.telefono}</strong>.
                WhatsApp puede generar un cargo. Este aviso no incluye el PDF ni
                el código de acceso.
              </p>
              <label className="check">
                <input
                  type="checkbox"
                  checked={phone}
                  onChange={(e) => setPhone(e.target.checked)}
                  required
                />
                <span>Verifiqué que este teléfono pertenece al paciente.</span>
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  required
                />
                <span>
                  El paciente autorizó recibir el aviso de disponibilidad de su
                  resultado por WhatsApp.
                </span>
              </label>
            </div>
          )}
        </>
      ) : (
        <p className="muted">
          {config?.notificacionesHabilitadas
            ? "Este paciente no tiene teléfono registrado. Entrega el acceso en la clínica."
            : "Los avisos de WhatsApp aún no están habilitados. Puedes publicar y entregar el acceso en la clínica."}
        </p>
      )}
    </section>
  );
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
          {notificationFields}
          <div className="sticky-action">
            <p>El paciente podrá consultar el resultado cuando lo publiques.</p>
            <button
              className="primary"
              disabled={
                busy || !confirmed || !!file || (notify && (!phone || !consent))
              }
            >
              {busy
                ? "Publicando…"
                : notify
                  ? "Publicar y autorizar aviso"
                  : "Publicar informe"}
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
      {report.aviso && (
        <section className="section">
          <h2>Estado del aviso</h2>
          <p role="status">
            {notificationLabels[report.aviso.estado] ||
              "Estado pendiente de comprobación"}
          </p>
          <button
            disabled={busy}
            onClick={() =>
              void action(async () => {
                onChange(await api<Report>(`v1/informes/${report.id}`));
                setNotice("Estado actualizado.");
              })
            }
          >
            Actualizar estado
          </button>
        </section>
      )}
      {report.estado === "PUBLICADO" && !report.aviso && canNotify && (
        <form
          className="section"
          onSubmit={(event) => {
            event.preventDefault();
            void action(async () => {
              onChange(
                await api<Report>(
                  `v1/informes/${report.id}/notificar`,
                  "POST",
                  {
                    revision: report.revision,
                    telefonoConfirmado: phone,
                    consentimientoWhatsApp: consent,
                    consentimientoVersion: "resultados-v1",
                  },
                ),
              );
              setNotice("Aviso autorizado. Puedes comprobar su estado aquí.");
            });
          }}
        >
          {notificationFields}
          <button disabled={busy || !notify || !phone || !consent}>
            Autorizar aviso
          </button>
        </form>
      )}
      {report.estado !== "RETIRADO" && (
        <section className="section actions">
          <button
            disabled={busy}
            onClick={() => renewDialog.current?.showModal()}
          >
            Renovar código de acceso
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
                "Código renovado. Entrega el nuevo código al paciente.",
              );
            });
          }}
        >
          <h2>Renovar acceso</h2>
          <p>
            El código anterior y las sesiones abiertas dejarán de funcionar.
            Entrega el nuevo código al paciente.
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
              Renovar código
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
            El paciente ya no podrá consultarlo. Los archivos descargados y los
            avisos que estén en tránsito no pueden recuperarse. Para corregirlo,
            crea un nuevo informe.
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
