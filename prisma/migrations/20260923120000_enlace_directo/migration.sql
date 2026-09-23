-- El enlace es la llave (decidido con la clínica el 2026-09-23): el paciente
-- toca el botón del WhatsApp y ve su informe, sin el código de 12 caracteres
-- en papel, que era el paso que más lo frenaba. El hash del código ya no se usa.
ALTER TABLE "AccesoPaciente" DROP COLUMN "codigoHash";
-- Primera apertura por el paciente: el CRM la muestra para que recepción siga
-- solo a quien no abrió su resultado.
ALTER TABLE "AccesoPaciente" ADD COLUMN "abiertoEn" TIMESTAMP(3);
