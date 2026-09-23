/*
 * El marco del portal de trabajo (médicos y administración). La página que abre
 * el paciente tiene el suyo en `app/resultados/layout.tsx`: no necesita la
 * cabecera de una herramienta interna.
 */
export default function LayoutMedico({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <header className="brand">
        <a href="/" aria-label="Clínica Montalvo, portal de resultados">
          <img src="/isotipo.svg" width="40" height="40" alt="" />
          <span>
            <small>CLÍNICA</small>
            <strong>MONTALVO</strong>
          </span>
        </a>
        <span className="brand-caption">Portal de resultados</span>
      </header>
      <main id="contenido">{children}</main>
      <footer>Clínica Montalvo · Resultados clínicos</footer>
    </>
  );
}
