# Laboratorio de FileMaker → Resultados y CRM

## Estado y continuidad

El 26/10/2026 quedó guardado en **Labtrio (ServidorFM19.local)** el guion
**generar PDF al CRM**, con 141 pasos y configuración privada de la integración.
La captura posterior de René muestra el botón asociado a ese guion, desde el
archivo actual, sin parámetro. No se cambió el generador original.

El guion y el botón viven en el archivo alojado de FileMaker: al abrir ese mismo
archivo desde otra máquina ya están allí. `git pull` actualiza el código y esta
documentación; no modifica FileMaker ni transporta credenciales.

No se conserva en Git una exportación nativa de los 141 pasos. La copia temporal
usada durante la configuración ya no está disponible. Para reconstruir o migrar
el guion, exportarlo desde el archivo alojado y retirar credenciales antes de
versionarlo. No se debe confundir esta guía con un respaldo del archivo FileMaker.

## Datos y PDF

| Dato | Origen |
| --- | --- |
| Laboratorio | `Labtrio::pk` |
| PAC | `Labtrio::rk pac` |
| Nombre | `Labtrio::Nom.Pac` |
| Fecha enviada | `Labtrio::Fecha` |
| Estado permitido | `Labtrio::estado = "FINALIZO"` |
| Tipo / estudio | `LABORATORIO` / `Laboratorio` |
| Referencia estable | `"LAB:" & $labId` |

El mapeo de fecha instalado es `Labtrio::Fecha`; una captura posterior muestra
`fecha_exa` en Fecha. Examen. Antes de cambiarlo, confirmar cuál es la fecha
clínica requerida y cómo afecta informes ya enviados: la API exige conservar la
fecha asociada a una referencia existente.

Usa `Year`, `Month`, `Day` y `Right` para el cálculo de fecha; no traducir los
nombres de funciones a Año/Mes/Día/Derecha. El contexto inicial debe ser la ficha
Labtrio en modo Visualizar y la cuenta debe cumplir el permiso heredado del
original. El guion guarda el registro y rechaza laboratorios no finalizados.

Abre una ventana auxiliar, busca exactamente `LIn.Lab::rk.lab = $labId`, ordena
por familia y orden, conserva la configuración de impresión y exporta desde
`Res.prt  PDF2` (dos espacios). Comprueba que todas las líneas son del mismo
laboratorio. Guarda **todos los registros encontrados y todas las páginas**,
sin añadir a un PDF previo, en una ruta temporal única. Aquí cada registro es
un análisis: exportar solo el registro actual dejaría el informe incompleto.

Cierra la ventana auxiliar y carga el archivo en `$pdf`, insertado y sin
compresión. La ficha y la búsqueda originales se conservan.

## Envío y uso

Una llamada multipart a `POST /v1/integraciones/filemaker/informe` con la
credencial **PDF**, `tipo=LABORATORIO`, médico responsable, PAC, nombre, fecha,
estudio, referencia y `publicar=true`. El campo archivo es
`archivo=@$pdf;type=application/pdf;filename=laboratorio.pdf`.

Solo confirma éxito si el servidor devuelve `PUBLICADO`, tipo LABORATORIO,
PAC coincidente e `informeId`. La variable `$mostrarRespuesta=1` mantiene el
diálogo técnico de primera comprobación; ponerla en `0` cuando se confirme el
primer envío real. Se conserva el aviso final de éxito o error.

1. Abrir el laboratorio finalizado y revisar paciente y resultados.
2. Pulsar el botón que ejecuta **generar PDF al CRM**, sin parámetro.
3. Confirmar el número en la pregunta (o cambiarlo) y enviar.

**Desde el 04/11/2026 el mismo botón también avisa por WhatsApp**, igual que el
de ecografía: tras publicar, el guion pregunta al CRM a qué ficha y número iría
el aviso y la asistente elige [Enviar] [Cambiar número] [No enviar]. Llena
`estado_envio`, `fecha_envio`, `hora_envio`, `usu_envio` y `telf_envio` de
Labtrio (no toca `estado`, que sigue en FINALIZO). Este portal no manda nada; el
contrato está en `backend-crm-montalvo/docs/filemaker-avisos-ecografia.md`. El
guion anterior quedó como «generar PDF al CRM Copia». `$mostrarRespuesta` quedó
en `0`. Reenviar la misma referencia reemplaza el PDF si cambió, manteniendo el
informe y el enlace. No cambiar referencia, PAC, fecha o cuenta responsable para
forzar una actualización; una discrepancia de identidad debe revisarse.

## Comprobación realizada el 26/10/2026

- Los 141 pasos se pegaron en FileMaker, se leyeron de nuevo y se compararon;
  guardado confirmado, sin cálculos inválidos.
- Una copia temporal sin envío generó un PDF local de dos páginas con 25 análisis
  y 192234 bytes. El validador del portal aceptó ese PDF local. La copia temporal
  fue retirada. No se subió ese informe ni se contactó al paciente.
- Con un PDF sintético se comprobaron recepción, reenvío idéntico sin duplicado,
  publicación, reemplazo conservando enlace, presencia en la cola privada que
  consume el CRM y descarga íntegra del original sin cookies.
- El informe sintético se retiró mediante el servicio del dominio: dejó de estar
  en la cola y su enlace quedó revocado. No se enviaron mensajes de WhatsApp.

Esto verifica por separado la generación nativa y el recorrido del servidor;
no registra todavía un envío clínico completo mediante el botón de René ni
una revisión visual de todas las familias de laboratorio. No se desplegó de
nuevo: el soporte multítipo ya estaba publicado desde el 25/10.
