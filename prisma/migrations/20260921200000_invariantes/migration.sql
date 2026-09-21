-- Invariantes de dominio, también ante escrituras administrativas directas.
ALTER TABLE "Sesion" ADD CONSTRAINT "Sesion_un_solo_tipo"
  CHECK (("usuarioId" IS NOT NULL) <> ("accesoId" IS NOT NULL));
ALTER TABLE "Paciente" ADD CONSTRAINT "Paciente_identificador_requerido"
  CHECK (NULLIF(TRIM(ci), '') IS NOT NULL OR NULLIF(TRIM(pac), '') IS NOT NULL);
ALTER TABLE "Informe" ADD CONSTRAINT "Informe_revision_positiva" CHECK (revision > 0);
ALTER TABLE "Informe" ADD CONSTRAINT "Informe_publicado_con_pdf"
  CHECK (estado <> 'PUBLICADO' OR ("archivoId" IS NOT NULL AND "publicadoEn" IS NOT NULL));
ALTER TABLE "Archivo" ADD CONSTRAINT "Archivo_limites"
  CHECK (bytes > 0 AND bytes <= 10485760 AND paginas > 0 AND paginas <= 300);
ALTER TABLE "Aviso" ADD CONSTRAINT "Aviso_intentos_limitados" CHECK (intentos >= 0 AND intentos <= 3);
