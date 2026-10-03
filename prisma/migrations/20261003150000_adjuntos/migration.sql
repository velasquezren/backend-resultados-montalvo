-- Videos e imágenes que acompañan a un informe (ver src/results/adjuntos.ts).
CREATE TYPE "TipoAdjunto" AS ENUM ('VIDEO', 'IMAGEN');

CREATE TABLE "Adjunto" (
    "id" UUID NOT NULL,
    "informeId" UUID NOT NULL,
    "tipo" "TipoAdjunto" NOT NULL,
    "mime" VARCHAR(40) NOT NULL,
    "nombre" VARCHAR(160) NOT NULL,
    "clave" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "subidoPor" VARCHAR(80) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminadoEn" TIMESTAMP(3),

    CONSTRAINT "Adjunto_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Adjunto_clave_key" ON "Adjunto"("clave");
CREATE INDEX "Adjunto_informeId_createdAt_idx" ON "Adjunto"("informeId", "createdAt");

ALTER TABLE "Adjunto" ADD CONSTRAINT "Adjunto_informeId_fkey" FOREIGN KEY ("informeId") REFERENCES "Informe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Un tamaño imposible no entra ni por error de código: el límite real es 100 MB.
ALTER TABLE "Adjunto" ADD CONSTRAINT "Adjunto_bytes_check" CHECK ("bytes" > 0 AND "bytes" <= 104857600);
