-- Conserva todas las referencias de ecografía; cada módulo tiene su espacio.
CREATE UNIQUE INDEX "Informe_tipo_referenciaExterna_key" ON "Informe"("tipo", "referenciaExterna");
DROP INDEX "Informe_referenciaExterna_key";
CREATE INDEX "Informe_tipo_estado_publicadoEn_id_idx" ON "Informe"("tipo", "estado", "publicadoEn", "id");
ALTER TABLE "Informe" ADD CONSTRAINT "Informe_tipo_valido"
  CHECK ("tipo" IN ('ECOGRAFIA', 'PAPANICOLAU', 'LABORATORIO', 'OTRO'));
