# Papanicolau: generar y enviar el PDF desde FileMaker Pro

Preparación local, 23 de octubre de 2026. No probado dentro de FileMaker ni enviado a producción.
El soporte nuevo de PAPANICOLAU debe desplegarse antes de probar este envío.

## Datos que hay que confirmar

- `Papanicolaou nueva::rkey pac` debe contener el PAC real del CRM. El guion lo usa sin añadir prefijos ni convertirlo en número. Si es otra clave, hay que sustituir ese campo por el PAC de la relación con pacientes.
- `Fecha` figura como fecha de creación en tu captura. El guion la envía como fecha del estudio: confirma que es la fecha que debe aparecer en el portal.
- `$medico` debe ser el correo de la cuenta activa del médico responsable en el portal. Especificarlo evita atribuir todos los Papanicolau al médico predeterminado de ecografías.
- `$token` es la credencial de la integración de PDF. No es la credencial de horarios.

## Crear el guion

Usa **generar pdf 2**, la copia del generador en el archivo Papanico. Reemplaza el contenido de esa copia por este guion y asigna el botón nuevo únicamente a **generar pdf 2**. No modifiques `Toggle`. Ejecutarlo desde una ficha de Papanicolau terminada, en modo Visualizar. FileMaker requiere añadir los pasos en su editor; este texto no se importa pegándolo entero.

La ventana auxiliar permite buscar e imprimir un único estudio sin cambiar la búsqueda de la ventana original. `Toggle` no es necesario: solo modifica la interfaz y el modo de visualización.

```text
Establecer captura de errores [ Activo ]
Permitir cancelación del usuario [ Inactivo ]

If [ Get ( WindowMode ) ≠ 0 or IsEmpty ( Papanicolaou nueva::pkey ) ]
    Mostrar cuadro de diálogo personalizado [ "Selecciona un Papanicolau" ; "Abre la ficha del estudio que quieres enviar, en modo Visualizar." ]
    Salir del guion [ Resultado de texto: 0 ]
End If

Consignar registros/peticiones [ Con diálogo: Inactivo ]
Establecer variable [ $error ; Valor: Get ( LastError ) ]
If [ $error ≠ 0 ]
    Mostrar cuadro de diálogo personalizado [ "No se guardó el registro" ; "Error de FileMaker: " & $error ]
    Salir del guion [ Resultado de texto: 0 ]
End If

Establecer variable [ $papId ; Valor: Papanicolaou nueva::pkey ]
Establecer variable [ $token ; Valor: "" ]
Establecer variable [ $medico ; Valor: "" ]

If [ IsEmpty ( $token ) or IsEmpty ( $medico ) ]
    Mostrar cuadro de diálogo personalizado [ "Falta configuración" ; "Configura la credencial de PDF y el correo de la cuenta del médico responsable antes de enviar." ]
    Salir del guion [ Resultado de texto: 0 ]
End If

Establecer variable [ $ventana ; Valor: "PDF-PAP-" & Get ( UUID ) ]
Establecer variable [ $ruta ; Valor: Get ( TemporaryPath ) & "pap-" & Get ( UUID ) & ".pdf" ]
Establecer variable [ $mensaje ; Valor: "" ]

Nueva ventana [ Estilo: Documento ; Nombre: $ventana ; Usando la presentación: "ImpresionDigital" (Papanicolaou nueva) ]
Establecer variable [ $error ; Valor: Get ( LastError ) ]
If [ $error ≠ 0 or Get ( WindowName ) ≠ $ventana ]
    Mostrar cuadro de diálogo personalizado [ "No se abrió la ventana del PDF" ; "Error de FileMaker: " & $error ]
    Salir del guion [ Resultado de texto: 0 ]
End If

# Este bucle se ejecuta una sola vez y permite cerrar siempre la ventana auxiliar.
Loop
    Modo Buscar [ Pausa: Inactivo ]
    Establecer campo [ Papanicolaou nueva::pkey ; "==" & $papId ]
    Ejecutar búsqueda [ ]
    Establecer variable [ $error ; Valor: Get ( LastError ) ]
    If [ $error ≠ 0 or Get ( FoundCount ) ≠ 1 or Papanicolaou nueva::pkey ≠ $papId ]
        Establecer variable [ $mensaje ; Valor: "No se encontró exactamente el Papanicolau seleccionado. No se generó ni envió el PDF. Error: " & $error ]
        Exit Loop If [ 1 ]
    End If

    Establecer variable [ $pac ; Valor: Trim ( Papanicolaou nueva::rkey pac ) ]
    Establecer variable [ $nombre ; Valor: Trim ( Papanicolaou nueva::Paciente ) ]
    Establecer variable [ $fechaRegistro ; Valor: Papanicolaou nueva::Fecha ]
    If [ IsEmpty ( $pac ) or IsEmpty ( $nombre ) or IsEmpty ( $fechaRegistro ) ]
        Establecer variable [ $mensaje ; Valor: "Falta el PAC, el nombre o la fecha del estudio. No se envió nada." ]
        Exit Loop If [ 1 ]
    End If

    Establecer variable [ $fecha ; Valor:
        Año ( $fechaRegistro ) & "-"
        & Derecha ( "0" & Mes ( $fechaRegistro ) ; 2 ) & "-"
        & Derecha ( "0" & Día ( $fechaRegistro ) ; 2 ) ]
    Establecer variable [ $referencia ; Valor: "PAP:" & $papId ]

    Guardar registros como PDF [ Con diálogo: Inactivo ; "$ruta" ; Registro actual ; Crear carpetas: Inactivo ]
    Establecer variable [ $error ; Valor: Get ( LastError ) ]
    If [ $error ≠ 0 ]
        Establecer variable [ $mensaje ; Valor: "No se pudo generar el PDF. Error de FileMaker: " & $error ]
    End If
    Exit Loop If [ 1 ]
End Loop

Cerrar ventana [ Nombre: $ventana ; Archivo actual ]

If [ not IsEmpty ( $mensaje ) ]
    Mostrar cuadro de diálogo personalizado [ "No se envió el Papanicolau" ; $mensaje ]
    Salir del guion [ Resultado de texto: 0 ]
End If

Insertar archivo [ Insertar ; No comprimir nunca ; Destino: $pdf ; "$ruta" ]
Establecer variable [ $error ; Valor: Get ( LastError ) ]
If [ $error ≠ 0 or IsEmpty ( $pdf ) ]
    Mostrar cuadro de diálogo personalizado [ "No se pudo cargar el PDF" ; "Error de FileMaker: " & $error ]
    Salir del guion [ Resultado de texto: 0 ]
End If

Establecer variable [ $url ; Valor: "https://resultados.107.175.132.15.nip.io/v1/integraciones/filemaker/informe" ]
Establecer variable [ $curl ; Valor:
    "--request POST --connect-timeout 15 --max-time 120 --FM-text-response"
    & " --header " & Quote ( "Authorization: Bearer " & $token )
    & " --form-string " & Quote ( "tipo=PAPANICOLAU" )
    & " --form-string " & Quote ( "medico=" & $medico )
    & " --form-string " & Quote ( "nombre=" & $nombre )
    & " --form-string " & Quote ( "pac=" & $pac )
    & " --form-string " & Quote ( "fechaEstudio=" & $fecha )
    & " --form-string " & Quote ( "estudio=Papanicolau" )
    & " --form-string " & Quote ( "referencia=" & $referencia )
    & " --form-string " & Quote ( "publicar=true" )
    & " --form " & Quote ( "archivo=@$pdf;type=application/pdf;filename=papanicolau.pdf" ) ]
Establecer variable [ $r ; Valor: "" ]

Insertar desde URL [ Seleccionar ; Con diálogo: Inactivo ; Destino: $r ; $url ; Verificar certificados SSL ; Opciones de cURL: $curl ]
Establecer variable [ $errorEnvio ; Valor: Get ( LastError ) ]

# Ventana temporal para comprobar la primera respuesta completa.
Mostrar cuadro de diálogo personalizado [ "Respuesta del portal" ; $r ]

If [ $errorEnvio ≠ 0 ]
    Mostrar cuadro de diálogo personalizado [ "No se confirmó el envío" ; "Error de FileMaker: " & $errorEnvio & ". Revisa el portal antes de reintentar. Mantén la misma referencia del estudio." ]
    Salir del guion [ Resultado de texto: 0 ]
End If

If [ JSONGetElement ( $r ; "estado" ) = "PUBLICADO"
    and JSONGetElement ( $r ; "tipo" ) = "PAPANICOLAU"
    and Upper ( JSONGetElement ( $r ; "paciente.pac" ) ) = Upper ( $pac )
    and not IsEmpty ( JSONGetElement ( $r ; "informeId" ) ) ]
    Mostrar cuadro de diálogo personalizado [ "Papanicolau publicado" ; "El servidor confirmó la publicación para este PAC. Revisa Resultados en el CRM." ]
    Salir del guion [ Resultado de texto: 1 ]
Else
    Mostrar cuadro de diálogo personalizado [ "Revisar respuesta" ; $r ]
    Salir del guion [ Resultado de texto: 0 ]
End If
```

## Opciones que se configuran en los cuadros de FileMaker

1. **Guardar registros como PDF → Especificar archivo de salida:** escribe solamente `$ruta`, sin comillas, en el cuadro grande de tu primera captura. La variable debe estar definida por el paso anterior del guion. Deja desactivados abrir automáticamente y crear correo.
2. **Guardar registros como PDF:** desmarca **Añadir a PDF existente**, selecciona **Registro actual** y todas las páginas. Mantén papel y orientación correspondientes a ImpresionDigital. Este ajuste es para este guion, que verifica un único registro; no es una instrucción para cambiar todos tus guiones de ecografía.
3. **Insertar archivo:** destino Variable `$pdf`; origen `$ruta`; almacenamiento Insertar, no referencia; No comprimir nunca.
4. **Insertar desde URL:** destino Variable `$r`; URL por cálculo `$url`; opciones de cURL por cálculo `$curl`; diálogo inactivo y verificación SSL activada. No añadas manualmente Content-Type.
5. El botón nuevo ejecuta este guion una sola vez, sin llamar además al guion antiguo.

## Comprobación después de configurar y desplegar

Primero confirma que el PDF de ImpresionDigital contiene todas las páginas del resultado elegido y el paciente correcto. Después prueba un informe autorizado para publicación. La respuesta debe incluir PUBLICADO, PAPANICOLAU, informeId y el PAC esperado.

El mismo `PAP:pkey` identifica el estudio al reenviarlo. Con el nuevo backend desplegado, un PDF modificado sustituye el anterior conservando el informe y el historial; requiere mantener paciente, médico, fecha y estudio. Generarlo localmente por sí solo no reemplaza el del servidor.

Publicar no equivale a enviar un WhatsApp: ese envío se realiza desde el CRM. Puedes quitar la ventana temporal «Respuesta del portal» después de verificar la primera prueba.

Referencias: [Guardar registros como PDF](https://help.claris.com/es/pro-help/content/save-records-as-pdf.html), [Insertar archivo](https://help.claris.com/es/pro-help/content/insert-file.html), [cURL](https://help.claris.com/es/pro-help/content/curl-options.html), [Nueva ventana](https://help.claris.com/es/pro-help/content/new-window.html).
