"use client";
import { useState } from 'react';
import { api } from '@/lib/client';
import { User } from '@/lib/types';
import { Feedback, message } from './shared';
export default function NewUser({ onBack }: { onBack: () => void }) {
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <section className="editor">
      <button onClick={onBack} disabled={busy}>
        ← Mis informes
      </button>
      <h1>Cuenta de médico</h1>
      <p>
        Usa una cuenta individual. Entrega las credenciales directamente al
        profesional.
      </p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const element = event.currentTarget,
            form = new FormData(element);
          setBusy(true);
          setError("");
          setNotice("");
          try {
            const user = await api<User>("v1/auth/usuarios", "POST", {
              nombre: form.get("nombre"),
              email: form.get("email"),
              password: form.get("password"),
              rol: "MEDICO",
            });
            element.reset();
            setNotice(
              `Cuenta creada para ${user.nombre}. Ya puede ingresar al portal.`,
            );
          } catch (err) {
            setError(message(err));
          } finally {
            setBusy(false);
          }
        }}
      >
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
          Correo electrónico
          <input
            name="email"
            type="email"
            required
            autoComplete="off"
            maxLength={254}
          />
        </label>
        <label>
          Contraseña
          <input
            name="password"
            type="password"
            required
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
          />
          <small>
            Entre 12 y 128 caracteres. No reutilices contraseñas del CRM.
          </small>
        </label>
        <Feedback error={error} notice={notice} />
        <button className="primary" disabled={busy}>
          {busy ? "Creando cuenta…" : "Crear cuenta de médico"}
        </button>
      </form>
    </section>
  );
}
