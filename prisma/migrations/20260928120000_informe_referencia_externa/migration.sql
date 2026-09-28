-- Idempotencia de la entrada desde FileMaker: el índice único es lo que evita
-- que un doble clic deje dos informes del mismo estudio. Nullable, así que los
-- informes creados desde el portal no se ven afectados.
ALTER TABLE "Informe" ADD COLUMN "referenciaExterna" VARCHAR(80);
CREATE UNIQUE INDEX "Informe_referenciaExterna_key" ON "Informe"("referenciaExterna");
