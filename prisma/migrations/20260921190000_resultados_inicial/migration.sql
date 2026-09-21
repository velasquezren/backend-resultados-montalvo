-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('ADMIN', 'MEDICO');

-- CreateEnum
CREATE TYPE "EstadoInforme" AS ENUM ('BORRADOR', 'PUBLICADO', 'RETIRADO');

-- CreateEnum
CREATE TYPE "EstadoAviso" AS ENUM ('PENDIENTE', 'ENVIANDO', 'ACEPTADO', 'ENTREGADO', 'LEIDO', 'FALLIDO', 'INCIERTO', 'CANCELADO');

-- CreateTable
CREATE TABLE "Usuario" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "nombre" VARCHAR(160) NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "rol" "Rol" NOT NULL DEFAULT 'MEDICO',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sesion" (
    "id" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "usuarioId" UUID,
    "accesoId" UUID,
    "expiraEn" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sesion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Paciente" (
    "id" UUID NOT NULL,
    "nombre" VARCHAR(160) NOT NULL,
    "ci" VARCHAR(40),
    "pac" VARCHAR(40),
    "telefono" VARCHAR(20),
    "referenciaCrm" VARCHAR(80),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Paciente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Informe" (
    "id" UUID NOT NULL,
    "pacienteId" UUID NOT NULL,
    "medicoId" UUID NOT NULL,
    "tipo" VARCHAR(40) NOT NULL DEFAULT 'ECOGRAFIA',
    "estudio" VARCHAR(160) NOT NULL,
    "fechaEstudio" DATE NOT NULL,
    "estado" "EstadoInforme" NOT NULL DEFAULT 'BORRADOR',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "archivoId" UUID,
    "publicadoEn" TIMESTAMP(3),
    "retiradoEn" TIMESTAMP(3),
    "motivoRetiro" VARCHAR(250),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Informe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Archivo" (
    "id" UUID NOT NULL,
    "informeId" UUID NOT NULL,
    "clave" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "paginas" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Archivo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccesoPaciente" (
    "id" UUID NOT NULL,
    "informeId" UUID NOT NULL,
    "codigoHash" TEXT NOT NULL,
    "expiraEn" TIMESTAMP(3) NOT NULL,
    "revocadoEn" TIMESTAMP(3),

    CONSTRAINT "AccesoPaciente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Aviso" (
    "id" UUID NOT NULL,
    "informeId" UUID NOT NULL,
    "telefono" VARCHAR(20) NOT NULL,
    "consentimientoEn" TIMESTAMP(3) NOT NULL,
    "consentimientoVersion" VARCHAR(40) NOT NULL,
    "autorizadoPor" UUID NOT NULL,
    "estado" "EstadoAviso" NOT NULL DEFAULT 'PENDIENTE',
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "proximoIntento" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metaId" TEXT,
    "codigoError" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Aviso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Auditoria" (
    "id" UUID NOT NULL,
    "actorId" VARCHAR(80) NOT NULL,
    "accion" VARCHAR(60) NOT NULL,
    "informeId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventoIntegracion" (
    "secuencia" SERIAL NOT NULL,
    "id" UUID NOT NULL,
    "tipo" VARCHAR(60) NOT NULL,
    "informeId" UUID NOT NULL,
    "referenciaCrm" VARCHAR(80) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventoIntegracion_pkey" PRIMARY KEY ("secuencia")
);

-- CreateTable
CREATE TABLE "LimiteIntentos" (
    "clave" TEXT NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL,
    "cantidad" INTEGER NOT NULL,

    CONSTRAINT "LimiteIntentos_pkey" PRIMARY KEY ("clave")
);

-- CreateTable
CREATE TABLE "CuotaAvisos" (
    "dia" VARCHAR(10) NOT NULL,
    "intentos" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CuotaAvisos_pkey" PRIMARY KEY ("dia")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Sesion_tokenHash_key" ON "Sesion"("tokenHash");

-- CreateIndex
CREATE INDEX "Sesion_expiraEn_idx" ON "Sesion"("expiraEn");

-- CreateIndex
CREATE UNIQUE INDEX "Paciente_ci_key" ON "Paciente"("ci");

-- CreateIndex
CREATE UNIQUE INDEX "Paciente_pac_key" ON "Paciente"("pac");

-- CreateIndex
CREATE UNIQUE INDEX "Paciente_referenciaCrm_key" ON "Paciente"("referenciaCrm");

-- CreateIndex
CREATE UNIQUE INDEX "Informe_archivoId_key" ON "Informe"("archivoId");

-- CreateIndex
CREATE INDEX "Informe_medicoId_createdAt_id_idx" ON "Informe"("medicoId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Informe_pacienteId_createdAt_idx" ON "Informe"("pacienteId", "createdAt");

-- CreateIndex
CREATE INDEX "Informe_estado_createdAt_idx" ON "Informe"("estado", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Archivo_clave_key" ON "Archivo"("clave");

-- CreateIndex
CREATE UNIQUE INDEX "AccesoPaciente_informeId_key" ON "AccesoPaciente"("informeId");

-- CreateIndex
CREATE UNIQUE INDEX "Aviso_informeId_key" ON "Aviso"("informeId");

-- CreateIndex
CREATE UNIQUE INDEX "Aviso_metaId_key" ON "Aviso"("metaId");

-- CreateIndex
CREATE INDEX "Aviso_estado_proximoIntento_idx" ON "Aviso"("estado", "proximoIntento");

-- CreateIndex
CREATE INDEX "Auditoria_informeId_createdAt_idx" ON "Auditoria"("informeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EventoIntegracion_id_key" ON "EventoIntegracion"("id");

-- CreateIndex
CREATE UNIQUE INDEX "EventoIntegracion_tipo_informeId_key" ON "EventoIntegracion"("tipo", "informeId");

-- CreateIndex
CREATE INDEX "LimiteIntentos_inicio_idx" ON "LimiteIntentos"("inicio");

-- AddForeignKey
ALTER TABLE "Sesion" ADD CONSTRAINT "Sesion_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sesion" ADD CONSTRAINT "Sesion_accesoId_fkey" FOREIGN KEY ("accesoId") REFERENCES "AccesoPaciente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Informe" ADD CONSTRAINT "Informe_pacienteId_fkey" FOREIGN KEY ("pacienteId") REFERENCES "Paciente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Informe" ADD CONSTRAINT "Informe_medicoId_fkey" FOREIGN KEY ("medicoId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Informe" ADD CONSTRAINT "Informe_archivoId_fkey" FOREIGN KEY ("archivoId") REFERENCES "Archivo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Archivo" ADD CONSTRAINT "Archivo_informeId_fkey" FOREIGN KEY ("informeId") REFERENCES "Informe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccesoPaciente" ADD CONSTRAINT "AccesoPaciente_informeId_fkey" FOREIGN KEY ("informeId") REFERENCES "Informe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Aviso" ADD CONSTRAINT "Aviso_informeId_fkey" FOREIGN KEY ("informeId") REFERENCES "Informe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
