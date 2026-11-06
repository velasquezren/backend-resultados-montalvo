-- El PDF de un informe pasa de 10 MB a 40 MB (06/11/2026): las ecografías con
-- fotos en calidad máxima que exporta FileMaker superaban los 10 MB y no se
-- publicaban. Mismo tope que `MAX_PDF_BYTES` (src/files/files.ts). Solo afloja
-- el CHECK: no toca filas, y el código anterior (tope de 10 MB) sigue cumpliéndolo.
ALTER TABLE "Archivo" DROP CONSTRAINT "Archivo_limites";
ALTER TABLE "Archivo" ADD CONSTRAINT "Archivo_limites"
  CHECK (bytes > 0 AND bytes <= 41943040 AND paginas > 0 AND paginas <= 300);
