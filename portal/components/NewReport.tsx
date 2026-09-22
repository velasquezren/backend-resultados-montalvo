"use client";
import { FormEvent, useState } from 'react';
import { api, ApiError } from '@/lib/client';
import { Access, Config, Patient } from '@/lib/types';
import { Feedback, message, today } from './shared';
export default function NewReport({
  config,
  onCancel,
  onCreated,
}: {
  config: Config | null;
  onCancel: () => void;
  onCreated: (id: string, access: Access) => Promise<void>;
}) {
  const [patient, setPatient] = useState<Patient | null>(null),
    [kind, setKind] = useState("ci"),
    [identifier, setIdentifier] = useState(""),
    [register, setRegister] = useState(false);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [created, setCreated] = useState<{ id: string; acceso: Access } | null>(
      null,
    );
  async function search(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setRegister(false);
    try {
      setPatient(
        await api<Patient>("v1/pacientes/buscar", "POST", {
          identificador: identifier.trim(),
        }),
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setRegister(true);
      else setError(message(err));
    } finally {
      setBusy(false);
    }
  }
  async function savePatient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const telefono = String(form.get("telefono") || "").trim();
      setPatient(
        await api<Patient>("v1/pacientes", "POST", {
          nombre: String(form.get("nombre")).trim(),
          [kind]: identifier.trim(),
          ...(telefono ? { telefono } : {}),
        }),
      );
      setRegister(false);
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!patient) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      if (created) {
        await onCreated(created.id, created.acceso);
        return;
      }
      const result = await api<{ informe: { id: string }; acceso: Access }>(
        "v1/informes",
        "POST",
        {
          pacienteId: patient.id,
          estudio: String(form.get("estudio")).trim(),
          fechaEstudio: form.get("fecha"),
        },
      );
      setCreated({ id: result.informe.id, acceso: result.acceso });
      await onCreated(result.informe.id, result.acceso);
    } catch (err) {
      setError(
        `${message(err)} Si perdiste la conexión, revisa Mis informes antes de crear otro.`,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="editor">
      <button className="back" disabled={busy} onClick={onCancel}>
        ← Mis informes
      </button>
      <p className="eyebrow">Paso {patient ? "2" : "1"} de 3 · Nuevo informe</p>
      <h1>{patient ? "Datos del estudio" : "Identifica al paciente"}</h1>
      <p className="muted">
        {patient
          ? "Después podrás adjuntar y revisar el PDF antes de publicarlo."
          : "Busca por un identificador exacto y confirma a quién pertenece el resultado."}
      </p>
      <Feedback error={error} />
      {!patient ? (
        <>
          <form onSubmit={search}>
            <label>
              CI o número PAC
              <input
                value={identifier}
                onChange={(e) => {
                  setIdentifier(e.target.value);
                  setRegister(false);
                }}
                required
                minLength={2}
                maxLength={40}
                autoComplete="off"
                autoCapitalize="characters"
                disabled={busy}
              />
              <small>
                Buscamos coincidencia exacta en los dos identificadores.
              </small>
            </label>
            <button className="primary" disabled={busy}>
              {busy ? "Buscando…" : "Buscar paciente"}
            </button>
          </form>
          {register && (
            <section className="section">
              <h2>No encontramos ese identificador</h2>
              <p>
                Comprueba que sea correcto. Si es un paciente nuevo, registra
                sus datos.
              </p>
              <form onSubmit={savePatient}>
                <label>
                  <span>
                    <strong>{identifier.trim().toUpperCase()}</strong> es un…
                  </span>
                  <select
                    value={kind}
                    disabled={busy}
                    onChange={(e) => setKind(e.target.value)}
                  >
                    <option value="ci">CI / carnet</option>
                    <option value="pac">Número PAC</option>
                  </select>
                </label>
                <label>
                  Nombre completo
                  <input
                    name="nombre"
                    autoComplete="off"
                    required
                    minLength={2}
                    maxLength={160}
                  />
                </label>
                <label>
                  WhatsApp del paciente{" "}
                  <span className="muted">(opcional)</span>
                  <input
                    name="telefono"
                    type="tel"
                    placeholder="+591…"
                    pattern="\+[1-9][0-9]{7,14}"
                  />
                  <small>
                    Incluye el código de país. Solo se usa si autorizas un
                    aviso.
                  </small>
                </label>
                <button disabled={busy}>Registrar paciente</button>
              </form>
            </section>
          )}
        </>
      ) : (
        <>
          <section className="identity">
            <strong>{patient.nombre}</strong>
            <span>
              {patient.ci ? `CI ${patient.ci}` : `PAC ${patient.pac}`}
            </span>
            {!created && (
              <button onClick={() => setPatient(null)} disabled={busy}>
                Cambiar paciente
              </button>
            )}
          </section>
          <form onSubmit={create}>
            <label>
              Nombre del estudio
              <input
                name="estudio"
                list="estudios-frecuentes"
                required
                minLength={3}
                maxLength={160}
                placeholder="Ej. Ecografía abdominal"
                disabled={!!created}
              />
              <datalist id="estudios-frecuentes">
                {(config?.estudiosFrecuentes ?? []).map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </label>
            <label>
              Fecha del estudio
              <input
                name="fecha"
                type="date"
                required
                defaultValue={today()}
                max={today()}
                min="1900-01-01"
                disabled={!!created}
              />
            </label>
            <button className="primary" disabled={busy}>
              {busy
                ? "Guardando…"
                : created
                  ? "Abrir borrador guardado"
                  : "Crear borrador y adjuntar PDF"}
            </button>
          </form>
        </>
      )}
    </section>
  );
}
