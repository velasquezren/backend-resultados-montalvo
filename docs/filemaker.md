# Entrada desde FileMaker

El médico pulsa un botón en FileMaker y el informe queda montado en el portal,
**en borrador**, con el PDF adjunto. Una sola llamada.

## Por qué queda en borrador y no publicado

Publicar exige confirmar que ese PDF corresponde a ese paciente, y eso no lo
puede afirmar un guion: que FileMaker genere el PDF correcto no es lo mismo que
comprobar que se adjuntó a la ficha correcta. Publicar además no tiene vuelta
atrás —el enlace del paciente queda vivo al instante y corregir obliga a retirar
y crear otro—. El médico abre el portal, ve el informe ya montado y publica de
un clic; el trabajo tedioso (buscar al paciente, crear, subir 7 MB) ya está
hecho.

## El endpoint

```
POST /v1/integraciones/filemaker/informe
Authorization: Bearer <FILEMAKER_API_TOKEN>
Content-Type: multipart/form-data
```

| Campo | Obligatorio | Nota |
| --- | --- | --- |
| `archivo` | sí | El PDF. Hasta 10 MB y 300 páginas; se valida y pasa por ClamAV |
| `medico` | sí | Correo de un médico **activo**; es a quien se atribuye y quien lo ve |
| `nombre` | sí | Nombre del paciente, por si hay que registrarlo |
| `pac` / `ci` | al menos uno | Identificadores; se normalizan a mayúsculas |
| `estudio` | sí | Ej. «Ecografía abdominal» |
| `fechaEstudio` | sí | `AAAA-MM-DD`, no futura (calendario de Bolivia) |
| `referencia` | recomendado | Id del registro en FileMaker — ver abajo |

Respuesta `201`:

```json
{ "informeId": "…", "estado": "BORRADOR", "repetido": false,
  "paciente": { "id": "…", "nombre": "…", "ci": null, "pac": "PAC33009" },
  "estudio": "Ecografía abdominal", "fechaEstudio": "2026-09-28T00:00:00.000Z",
  "archivo": { "paginas": 6, "bytes": 7223104 },
  "acceso": { "id": "…", "url": "https://…/resultados/…", "expiraEn": "…" } }
```

**`referencia` hace la llamada idempotente.** Sin ella, pulsar el botón dos
veces deja dos informes del mismo estudio. Con ella, la segunda llamada
devuelve el primero y responde `repetido: true`. Lo garantiza un índice único,
no una comprobación previa: dos pulsaciones a la vez también quedan en uno.

Errores: el mensaje siempre está en `error.mensaje`. `401` credencial, `404`
médico inexistente o inactivo, `400` PDF inválido, identificador ausente o
fecha futura, `413` PDF de más de 10 MB.

Un PDF rechazado **no deja rastro**: se valida antes de crear nada, así que no
quedan borradores ni pacientes a medias.

## Configuración

```
FILEMAKER_API_TOKEN=<32+ caracteres>   # openssl rand -hex 32
```

Sin esa variable el endpoint responde 401 a todo, que es el comportamiento
seguro por defecto. Apache tiene que publicar la ruta: hoy solo expone el
portal, y la API vive en loopback.

## El guion de FileMaker

Un solo `Insertar desde URL`. Antes, guardar el PDF en un contenedor global
(`g_pdf`), **sin** marcar «solo referencia».

```
Definir variable [ $ruta ; Obtener ( RutaTemporal ) & "informe.pdf" ]
Guardar registros como PDF [ Con diálogo: No ; "$ruta" ; Registro actual ]
Insertar archivo [ g_pdf ; "$ruta" ]

Insertar desde URL [ Con diálogo: No ; Destino: $r ;
  "https://resultados.107.175.132.15.nip.io/api/v1/integraciones/filemaker/informe" ;
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
