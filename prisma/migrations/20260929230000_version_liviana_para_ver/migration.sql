-- La versión del informe para VER, con las fotos recomprimidas. El original
-- ("archivoId") no se toca. Aditiva y opcional: el código anterior la ignora.
-- AlterTable
ALTER TABLE "Informe" ADD COLUMN     "archivoVistaId" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "Informe_archivoVistaId_key" ON "Informe"("archivoVistaId");

-- AddForeignKey
ALTER TABLE "Informe" ADD CONSTRAINT "Informe_archivoVistaId_fkey" FOREIGN KEY ("archivoVistaId") REFERENCES "Archivo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

