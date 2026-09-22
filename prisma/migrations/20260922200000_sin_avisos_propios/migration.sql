-- El CRM es el único emisor de WhatsApp (decidido el 2026-09-22): una sola app
-- de Meta, un solo webhook, y el mensaje queda en la conversación del paciente.
-- El camino de avisos propio nunca se encendió: en producción las tres tablas
-- estaban vacías al retirarlo, así que no se pierde nada.
DROP TABLE "Aviso";
DROP TABLE "CuotaAvisos";
-- Nadie consumía los eventos: el CRM lee la cola publicada directamente.
DROP TABLE "EventoIntegracion";
DROP TYPE "EstadoAviso";

-- `referenciaCrm` era el PAC reescrito en forma canónica: el CRM ahora vincula
-- por PAC y, si no hay, por CI único, a partir de los identificadores del
-- propio paciente. El teléfono solo servía para el aviso retirado; el CRM usa
-- el de la conversación real y aquí no se guarda un dato que no se usa.
DROP INDEX "Paciente_referenciaCrm_key";
ALTER TABLE "Paciente" DROP COLUMN "referenciaCrm", DROP COLUMN "telefono";
