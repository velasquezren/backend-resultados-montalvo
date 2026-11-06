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
`Res.prt  PDF2.Firma` (dos espacios). La usa también «genera un solo PDF»
(botón «Generar PDFs del Lab.»).

**Desde el 05/11/2026, una hoja y una firma por familia.** La parte de la firma es
un subsumario posterior por `FamiliaEx` con salto de página después: cada familia
(Hematología, Urianálisis…) empieza en hoja nueva y termina con la firma de
**quien marcó su nombre en «Responsables del llenado»** de esa familia. La
cabecera del paciente se repite en todas las hojas.

- Relación nueva `LIn.Lab → Llenado.FirmaFam` (`rk.lab = lab.pk` y
  `FamiliaEx = familia`, tabla `Labtrio_llenado`) y `Llenado.FirmaFam →
  _Medico.FirmaFam` (`personal.py = pkey`, tabla `_Medico` del archivo Medico).
- Portal de una fila con filtro `Llenado.FirmaFam::lleno = "Si"`: firma
  (`_Medico.FirmaFam::firma`, centrada). Desde el 05/11 por la tarde mide
  138×69 pt con «Reducir o ampliar imagen para encajar» y proporciones
  conservadas. Ya no lleva el nombre debajo: el campo
  `Labtrio_llenado::firma_nombre` (cálculo sin almacenar
  `Trim ( Dr & " " & Nombre )` en contexto `Llenado.FirmaFam`) sigue existiendo
  por si se vuelve a poner. Si se pone, debe ir como campo dentro del portal: un
  texto combinado no queda dentro del portal y mostraría a otra persona.
- Familia sin nadie marcado: la hoja sale **sin firma** (ya no se pone la firma
  fija de `_Medico.FirmaLab`). Por eso «generar PDF al CRM» avisa **antes de
  publicar y enviar** (pasos 38–45, tras validar los datos): con `ExecuteSQL`
  busca las `FamiliaEx` del laboratorio que no tienen ningún `lleno = "Si"` en
  `Labtrio_llenado` y, si hay alguna, muestra «Familias sin responsable» con
  [Volver] (sale sin enviar) y [Enviar sin firma]. Si la consulta falla, avisa
  igual. Si marcan dos personas en la misma familia, sale solo una firma.
- Para que una familia larga entre con su firma en una hoja, la fila de
  resultados bajó de 18 a 16 pt (cuerpo 185–201, celdas de 16 pt desde 185) y el
  bloque de firma mide 72 pt. Con LAB88928, Hemograma y Urianálisis completos
  caben; con 75 pt Urianálisis ya pasaba la firma sola a una octava hoja. El
  blanco que se ve bajo la última fila no se puede usar entero, así que hay que
  medir en vista previa. Una familia más larga pasa la firma a la hoja
  siguiente sin cortarla.
- Respaldo de la versión anterior (firma fija al final):
  `Res.prt  PDF2.Firma antes 05-11`. La de antes del 04/11 sigue en
  `Res.prt  PDF2.Firma Copia`.

Comprobado en vista previa, sin publicar ni enviar, con LAB88928: 7 familias,
7 hojas, cada una con la firma de quien la marcó (Rocabado en Bioquímica e
Inmunoserología, Escalera en Coagulograma, Hematología y Urianálisis) y sin firma
en Bacteriología y Serología, que nadie marcó.

Comprueba que todas las líneas son del mismo
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

## La página del paciente es de Laboratorio Climon (06/11/2026)

El paciente abre su laboratorio en `/laboratorio/<acceso>`, con la marca de
Laboratorio Climon y no la de Clínica Montalvo; `acceso.url` de la respuesta ya
trae esa dirección. Los enlaces enviados antes por `/resultados/` siguen
funcionando. El texto del WhatsApp sigue siendo el de la plantilla de la clínica
hasta crear la de Climon ([operación](operacion.md#plantilla-de-aviso-la-envía-el-crm)).

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
