"use client";
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/client';
import { Access, Config, Report, ReportSummary, User, dateLabel, reportLabels } from '@/lib/types';
import NewReport from './NewReport';
import ReportDetail from './ReportDetail';
import NewUser from './NewUser';
import PasswordForm from './PasswordForm';
import { Feedback, message } from './shared';
export default function DoctorPortal() {
  const [passwordScreen, setPasswordScreen] = useState(false);
  const [user, setUser] = useState<User | null>(null),
    [checking, setChecking] = useState(true),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [opening, setOpening] = useState<string | null>(null);
  const [reports, setReports] = useState<ReportSummary[]>([]),
    [total, setTotal] = useState(0),
    [page, setPage] = useState(1),
    [state, setState] = useState("");
  const [config, setConfig] = useState<Config | null>(null),
    [selected, setSelected] = useState<Report | null>(null),
    [creating, setCreating] = useState(false),
    [users, setUsers] = useState(false);
  const [access, setAccess] = useState<Access | null>(null),
    [busy, setBusy] = useState(false);
  // Una sola definición de la consulta: antes el efecto y `refresh` la repetían.
  const listPath = useCallback(
    () =>
      `v1/informes?pagina=${page}&limite=15${state ? `&estado=${state}` : ""}${search ? `&buscar=${encodeURIComponent(search)}` : ""}`,
    [page, state, search],
  );
  const refresh = useCallback(async () => {
    const result = await api<{ datos: ReportSummary[]; total: number }>(
      listPath(),
    );
    setReports(result.datos);
    setTotal(result.total);
  }, [listPath]);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch((previous) => {
        if (previous !== query.trim()) setPage(1);
        return query.trim();
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    let active = true;
    api<User>("v1/auth/yo")
      .then((value) => {
        if (active) setUser(value);
      })
      .catch((err) => {
        if (active && (!(err instanceof ApiError) || err.status !== 401))
          setError(message(err));
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!user) return;
    let active = true;
    api<Config>("v1/informes/configuracion")
      .then((value) => {
        if (active) setConfig(value);
      })
      .catch((err) => {
        if (active) setError(message(err));
      });
    return () => {
      active = false;
    };
  }, [user]);
  useEffect(() => {
    if (!user) return;
    let active = true;
    setLoading(true);
    api<{ datos: ReportSummary[]; total: number }>(listPath())
      .then((list) => {
        if (active) {
          setReports(list.datos);
          setTotal(list.total);
        }
      })
      .catch((err) => {
        if (active) setError(message(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user, listPath]);
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const result = await api<{ usuario: User }>("v1/auth/login", "POST", {
        email: form.get("email"),
        password: form.get("password"),
      });
      setUser(result.usuario);
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }
  async function open(report: ReportSummary) {
    if (opening) return;
    setError("");
    setOpening(report.id);
    try {
      setSelected(await api<Report>(`v1/informes/${report.id}`));
      setAccess(null);
    } catch (err) {
      setError(message(err));
    } finally {
      setOpening(null);
    }
  }
  if (!user)
    return (
      <section className="login">
        <p className="eyebrow">Acceso de médicos</p>
        <h1>
          Tus informes,
          <br />
          en un solo lugar.
        </h1>
        <p className="lead">
          Ingresa con tu cuenta de la clínica para preparar y entregar
          resultados.
        </p>
        {checking ? (
          <p role="status">Comprobando sesión…</p>
        ) : (
          <form onSubmit={login}>
            <label>
              Correo electrónico
              <input
                name="email"
                type="email"
                autoComplete="username"
                required
                maxLength={254}
              />
            </label>
            <label>
              Contraseña
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                maxLength={128}
              />
            </label>
            <Feedback error={error} />
            <button className="primary" disabled={busy}>
              {busy ? "Ingresando…" : "Ingresar"}
            </button>
            <p className="muted small">
              Si necesitas una cuenta o recuperar el acceso, contacta con el
              administrador de la clínica.
            </p>
          </form>
        )}
      </section>
    );
  return (
    <div className="workspace">
      <div className="toolbar">
        <span>{user.nombre}</span><button disabled={busy} onClick={() => setPasswordScreen(true)}>Cambiar contraseña</button>
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api("v1/auth/logout", "POST");
              setUser(null);
              setSelected(null);
              setAccess(null);
              setReports([]);
            } catch (err) {
              setError(message(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          Cerrar sesión
        </button>
      </div>
      {passwordScreen ? <PasswordForm onBack={() => setPasswordScreen(false)} onChanged={() => { setUser(null); setSelected(null); setAccess(null); setReports([]); setPasswordScreen(false); }} /> : selected ? (
        <ReportDetail
          key={selected.id}
          report={selected}
          initialAccess={access}
          onChange={setSelected}
          onBack={() => {
            setSelected(null);
            setAccess(null);
            void refresh().catch((err) => setError(message(err)));
          }}
        />
      ) : creating ? (
        <NewReport
          config={config}
          onCancel={() => setCreating(false)}
          onCreated={async (id, grant) => {
            const report = await api<Report>(`v1/informes/${id}`);
            setSelected(report);
            setAccess(grant);
            setCreating(false);
          }}
        />
      ) : users ? (
        <NewUser onBack={() => setUsers(false)} />
      ) : (
        <>
          <div className="page-heading">
            <div>
              <p className="eyebrow">Portal de médicos</p>
              <h1>Mis informes</h1>
              <p className="muted">
                Prepara, revisa y publica los resultados de tus pacientes.
              </p>
            </div>
            <button
              className="primary"
              onClick={() => {
                setError("");
                setCreating(true);
              }}
            >
              Nuevo informe
            </button>
          </div>
          <Feedback error={error} />
          <div className="filters">
            <label className="search">
              Buscar
              <input
                type="search"
                value={query}
                placeholder="Nombre del paciente o estudio"
                autoComplete="off"
                maxLength={160}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <label>
              Mostrar
              <select
                value={state}
                onChange={(e) => {
                  setPage(1);
                  setState(e.target.value);
                }}
              >
                <option value="">Todos los informes</option>
                <option value="BORRADOR">En preparación</option>
                <option value="PUBLICADO">Publicados</option>
                <option value="RETIRADO">Retirados</option>
              </select>
            </label>
            <button
              disabled={loading}
              onClick={() => {
                setError("");
                void refresh().catch((err) => setError(message(err)));
              }}
            >
              Actualizar
            </button>
            {user.rol === "ADMIN" && (
              <button onClick={() => setUsers(true)}>
                Crear cuenta de médico
              </button>
            )}
          </div>
          {loading ? (
            <div className="empty" role="status">
              Cargando tus informes…
            </div>
          ) : reports.length === 0 ? (
            <div className="empty">
              <h2>
                {search
                  ? `Sin resultados para “${search}”`
                  : state
                    ? "No hay informes con este estado"
                    : "Todavía no hay informes"}
              </h2>
              <p>
                {search
                  ? "Prueba con otra parte del nombre o cambia el filtro de estado."
                  : state
                    ? "Prueba otro filtro o crea un nuevo informe."
                    : "Empieza identificando al paciente y adjuntando su PDF."}
              </p>
            </div>
          ) : (
            <div className="report-list">
              {reports.map((report) => (
                <button
                  className="report-row"
                  key={report.id}
                  aria-busy={opening === report.id}
                  onClick={() => void open(report)}
                >
                  <div>
                    <strong>{report.paciente.nombre}</strong>
                    <span>
                      {report.estudio} · {dateLabel(report.fechaEstudio)}
                    </span>
                  </div>
                  <span className={`status estado-${report.estado.toLowerCase()}`}>
                    {reportLabels[report.estado]}
                  </span>
                  <span className="row-action">
                    {opening === report.id ? "Abriendo…" : "Revisar →"}
                  </span>
                </button>
              ))}
            </div>
          )}
          <div className="pagination">
            <span>
              {total} informes · Página {page}
            </span>
            <button
              disabled={page <= 1 || loading}
              onClick={() => setPage(page - 1)}
            >
              Anterior
            </button>
            <button
              disabled={page * 15 >= total || loading}
              onClick={() => setPage(page + 1)}
            >
              Siguiente
            </button>
          </div>
        </>
      )}
    </div>
  );
}
