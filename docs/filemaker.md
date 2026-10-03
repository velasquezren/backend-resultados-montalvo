# Entrada desde FileMaker

El médico pulsa un botón en FileMaker y el informe queda montado en el portal,
**en borrador**, con el PDF adjunto. Una sola llamada.

## Borrador o publicado: lo decide `publicar`

Por omisión queda en **borrador**: el médico abre el portal, ve el informe ya
montado y publica de un clic. El trabajo tedioso —buscar al paciente, crear el
borrador, subir 7 MB— ya está hecho.

Con `publicar=true` queda **publicado en la misma llamada** y entra directo en
la cola del CRM.

Lo que se pierde, para decidirlo a conciencia: publicar es la única
confirmación de que ese PDF corresponde a ese paciente, y **no tiene vuelta
atrás** —el enlace queda alcanzable al instante y corregir obliga a retirar y
crear otro informe—. Que FileMaker genere el PDF correcto no es lo mismo que
comprobar que se adjuntó a la ficha correcta. Con la bandera puesta, nadie hace
esa comprobación. La validación del PDF y el antivirus corren igual: publicar no
se salta nada.

## El endpoint

```
POST /v1/integraciones/filemaker/informe
Authorization: Bearer <FILEMAKER_API_TOKEN>
Content-Type: multipart/form-data
```

| Campo | Obligatorio | Nota |
| --- | --- | --- |
| `archivo` | sí | El PDF. Hasta 10 MB y 300 páginas; se valida y pasa por ClamAV |
| `medico` | si no hay defecto | Correo de un médico **activo**. Si el servidor define `FILEMAKER_MEDICO_POR_DEFECTO`, puede omitirse |
| `nombre` | sí | Nombre del paciente, por si hay que registrarlo |
| `pac` / `ci` | al menos uno | Identificadores; se normalizan a mayúsculas |
| `estudio` | no | Ej. «Ecografía abdominal». Sin él se usa «Ecografía» |
| `fechaEstudio` | sí | `AAAA-MM-DD`, no futura (calendario de Bolivia) |
| `referencia` | recomendado | Id del registro en FileMaker — ver abajo |
| `publicar` | no | `true` publica en la misma llamada; por omisión, borrador |

Respuesta `201`:

```json
{ "informeId": "…", "estado": "BORRADOR", "repetido": false, "actualizado": false,
  "paciente": { "id": "…", "nombre": "…", "ci": null, "pac": "PAC33009" },
  "estudio": "Ecografía abdominal", "fechaEstudio": "2026-09-28T00:00:00.000Z",
  "archivo": { "paginas": 6, "bytes": 7223104 },
  "acceso": { "id": "…", "url": "https://…/resultados/…", "expiraEn": "…" } }
```

**`referencia` identifica una ecografía concreta y debe mantenerse fija.** Sin
ella, cada envío crea otro informe. Con ella, el primer envío crea el informe;
los siguientes sustituyen su PDF si el contenido cambió y devuelven
`repetido: true, actualizado: true`. Si es exactamente el mismo archivo,
`actualizado: false` y no se añade una versión. Dos pulsaciones simultáneas
se procesan en orden y dejan un solo informe.

El reemplazo conserva el informe, su fila en el CRM y el enlace del paciente,
con su vencimiento y revocación originales. Guarda el archivo anterior para
el historial y regenera la vista liviana. No envía un WhatsApp. Un enlace ya
vencido o revocado sigue necesitando la renovación habitual.

El PAC/CI enviado, médico, fecha y nombre de estudio (si se envía) deben
coincidir con el informe existente; si no, se rechaza con `409`. Un informe
retirado tampoco se reemplaza. `publicar=true` permite publicar un borrador
existente; omitirlo no retira uno que ya estaba publicado.

No hace falta cambiar los guiones actuales que ya envían una referencia
estable, por ejemplo `FM-Ecografia-` seguido del ID del registro. La sustitución
ocurre al enviar el PDF al portal; generar únicamente un archivo local no
realiza un envío.

Errores: el mensaje siempre está en `error.mensaje`. `401` credencial, `404`
médico inexistente o inactivo, `400` PDF inválido, identificador ausente o
fecha futura, `413` PDF de más de 10 MB.

Un PDF rechazado **no deja rastro**: se valida antes de crear nada, así que no
quedan borradores ni pacientes a medias.

## Configuración

```
FILEMAKER_API_TOKEN=<32+ caracteres>          # openssl rand -hex 32
FILEMAKER_MEDICO_POR_DEFECTO=doctor@ejemplo   # opcional
```

**El médico por defecto tiene un coste**: todos los informes de FileMaker caen
en esa cuenta, así que los demás médicos no ven los suyos en el portal y la
auditoría dice siempre el mismo nombre. Si FileMaker tiene el correo del médico
a mano, mándalo en el campo `medico` y no configures el defecto.

Sin esa variable el endpoint responde 401 a todo, que es el comportamiento
seguro por defecto.

**Apache tiene que publicar la ruta.** Hoy solo expone el portal Next; la API
vive en loopback y el proxy `/api/*` del portal no admite esta ruta (su lista
blanca es para el navegador, con cookie y `Origin`). Un guion no es un
navegador, así que va directo:

```apache
# En el vhost de resultados.107.175.132.15.nip.io
<Location /v1/integraciones/filemaker>
    ProxyPass        http://127.0.0.1:3010/v1/integraciones/filemaker
    ProxyPassReverse http://127.0.0.1:3010/v1/integraciones/filemaker
</Location>
```

Solo esa ruta: el resto de la API sigue sin salir a internet. La credencial es
lo único que la protege, así que si se filtra, se rota la variable y se
reinicia `resultados-api`.

## Qué pasa después de publicar

El informe aparece en `/resultados` del CRM con el paciente ya cruzado por su
PAC (o por CI único) contra las fichas del CRM, que es de donde sale su número
de WhatsApp — **por eso el teléfono no viaja desde FileMaker**: el CRM ya tiene
uno mejor mantenido.

Desde ahí, **un asistente pulsa «Enviar por WhatsApp»**. Ese clic sigue
existiendo aunque FileMaker publique solo: es donde se ve a qué número va y
dónde se decide gastar el mensaje. Que el CRM envíe sin que nadie mire sería
otro cambio —un barrido automático— y no está hecho.

## FileMaker es local: limita la ruta a la clínica

El servidor es un VPS remoto, así que la llamada sale por internet igual. Pero
si la clínica tiene IP fija, conviene que esa ruta solo la acepte desde ahí:

```apache
<Location /v1/integraciones/filemaker>
    ProxyPass        http://127.0.0.1:3010/v1/integraciones/filemaker
    ProxyPassReverse http://127.0.0.1:3010/v1/integraciones/filemaker
    Require ip 200.105.0.0          # la IP pública de la clínica
</Location>
```

Con eso la credencial deja de ser lo único que separa a un desconocido de poder
subir informes.

## El guion de FileMaker

Un solo `Insertar desde URL`. Antes, guardar el PDF en un contenedor global
(`g_pdf`), **sin** marcar «solo referencia».

```
Definir variable [ $ruta ; Obtener ( RutaTemporal ) & "informe.pdf" ]
Guardar registros como PDF [ Con diálogo: No ; "$ruta" ; Registro actual ]
Insertar archivo [ g_pdf ; "$ruta" ]

Insertar desde URL [ Con diálogo: No ; Destino: $r ;
  "https://resultados.107.175.132.15.nip.io/v1/integraciones/filemaker/informe" ;
  Opciones cURL:
    "-X POST"
  & " -H \"Authorization: Bearer " & $token & "\""
  & " -F \"medico="       & TuTabla::CorreoMedico & "\""
  & " -F \"nombre="       & TuTabla::NombrePaciente & "\""
  & " -F \"pac="          & TuTabla::PAC & "\""
  & " -F \"estudio="      & TuTabla::Estudio & "\""
  & " -F \"fechaEstudio=" & $fecha & "\""
  & " -F \"referencia=FM-" & Obtener ( IDRegistro ) & "\""
  & " -F \"archivo=@g_pdf\""
  & " -F \"publicar=true\""        // quítalo para que quede en borrador
  & " --FM-text-response" ]

Definir variable [ $err ; JSONGetElement ( $r ; "error.mensaje" ) ]
Si [ no EsVacío ( $err ) ]
    Ventana personalizada [ "No se pudo: " & $err ]
Si no
    Ventana personalizada [ "Informe cargado. Ábrelo en el portal y publícalo." ]
Fin de si
```

La fecha, desde un campo de fecha de FileMaker:

```
Año ( TuTabla::FechaEstudio ) & "-"
& Derecha ( "0" & Mes ( TuTabla::FechaEstudio ) ; 2 ) & "-"
& Derecha ( "0" & Día ( TuTabla::FechaEstudio ) ; 2 )
```

No pongas `Content-Type` a mano: al usar `-F`, FileMaker arma el multipart él
solo y fijarlo lo rompe.
