# Papanicolau: publicar el PDF y avisar por WhatsApp desde FileMaker

## Estado (07/11/2026)

En el archivo **Papanico** (ServidorFM19) está guardado el guion
**generar PDF PAP al CRM** (carpeta «carpeta de René», 211 pasos) y el botón
**Enviar PAP por WhatsApp** de la presentación **Ingreso**, a la derecha del
recuadro de «Generar Doc. Digital (PDF)». Es una copia del guion de laboratorio
(«generar PDF al CRM» de Labtrio, ver [filemaker-laboratorio.md](filemaker-laboratorio.md)):
mismo envío al portal, misma pregunta del número y mismo aviso desde el CRM.

No hizo falta cambiar ningún servidor: el portal acepta `PAPANICOLAU` desde el
25/10 y el CRM avisa de cualquier tipo de informe. El aviso sale por la línea
de Recepción con la plantilla genérica («su informe médico ya está
disponible»); solo los `LABORATORIO` tienen línea aparte (Climon).

Probado el 07/11 en el depurador con PAP14888, detenido antes de publicar:
encuentra solo ese estudio, genera el PDF de ImpresionDigital (3 páginas: la
colposcopía con el diagnóstico y el informe escaneado de CATEDRAL, cuya cola
ocupa una tercera hoja casi vacía, igual que con el botón de siempre) y cierra
la ventana auxiliar. **No se publicó ni se envió nada.** Falta la prueba
completa con un PAP de prueba cuyo PAC tenga la ficha del CRM con el número de
René.

Los guiones viven en el archivo alojado, no en Git. Para reconstruirlo:
exportarlo desde FileMaker y quitar las credenciales antes de versionarlo.

## Qué hace el botón

1. Solo desde una ficha de `Papanicolaou nueva` en modo Visualizar.
2. Exige **diagnóstico cargado** (`Papanicolaou nueva::diagnostico`): sin él el
   resultado de ONCOS/CATEDRAL todavía no llegó y no se envía nada. Ojo:
   `estado` (ENVIAR/ENVIADO) es el envío de la muestra al laboratorio de
   citología, no el resultado.
3. Datos: `pkey` (PAP…), `rkey pac` (PAC del CRM), `Paciente`, `Fecha`.
   Referencia estable `PAP:` & `pkey`; tipo `PAPANICOLAU`, estudio
   `Papanicolau`, médico del portal `doctor@montalvo.com` (como laboratorio).
4. Ventana auxiliar en **ImpresionDigital**, busca `pkey == $papId` y exige un
   único registro; guarda el PDF en una ruta temporal (sin «Añadir»), cierra la
   ventana y lo sube con la credencial de PDF.
5. Si el portal confirma `PUBLICADO`, `PAPANICOLAU`, el PAC y el `informeId`,
   pregunta al CRM a qué ficha y número iría el aviso: [Enviar]
   [Cambiar número] [No enviar]. El contrato está en
   `backend-crm-montalvo/docs/filemaker-avisos-ecografia.md`.
6. Llena los campos nuevos de envío al paciente: `estado_envio`
   (PUBLICADO/ENVIADO), `fecha_envio_pac`, `hora_envio_pac`, `user_envio_pac`
   y `celular_envio` («Cambiar número» escribe ahí). Uno ya ENVIADO no vuelve a
   PUBLICADO ni cambia quién lo envió. **No toca** `estado`, `enviado`,
   `fecha_envio` ni `quien_envio` (envío de la muestra).

Reenviar el mismo PAP reemplaza el PDF del portal conservando informe y enlace;
si el paciente ya tenía el aviso, no se manda otro WhatsApp.

## Lo que queda en el archivo

- «generar pap digital» (el PDF local de siempre) y «Toggle» siguen igual.
- En «carpeta de René» quedan borradores anteriores: «ENVIAR PDF AL PORTAL»
  (sin uso, con una credencial en texto: conviene borrarlo o vaciarla) y
  «generar pap digital 2».
- `$mostrarRespuesta = 0`; ponerlo en 1 muestra la respuesta cruda del portal.
