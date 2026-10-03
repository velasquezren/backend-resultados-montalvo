# API v1 — contrato para Next

Base de desarrollo: `http://localhost:3010`. JSON salvo carga multipart y descarga PDF. Los campos no declarados se rechazan. IDs UUID. Fechas del estudio `YYYY-MM-DD`; instantes ISO 8601 UTC.

Sesiones: `Authorization: Bearer <token>`. Usar un adaptador servidor de Next con cookies HttpOnly/Secure/SameSite y protección CSRF para el navegador; no guardar tokens en localStorage. Ese adaptador y las pantallas están implementados en `portal/`; el proxy permite únicamente rutas del portal, comprueba Origin y conserva sesiones en cookies HttpOnly/SameSite=Strict. Si se consume directamente durante desarrollo, mantener token en memoria. No cachear respuestas clínicas.

## Autenticación

| Método / ruta | Acceso | Entrada / resultado |
| --- | --- | --- |
| GET `/health` | Público | Estado del proceso |
| GET `/health/ready` | Público | Estado de PostgreSQL; 503 si falla |
| POST `/v1/auth/login` | Público, limitado | `{email,password}` → `{token,expiraEn,usuario:{id,nombre,rol}}` |
| GET `/v1/auth/yo` | Médico/admin | `{id,nombre,email,rol}` |
| POST `/v1/auth/logout` | Médico/admin | Revoca sesión actual |
| POST `/v1/auth/usuarios` | Admin | `{email,nombre,password,rol:"MEDICO"|"ADMIN"}` → usuario sin contraseña |
| POST `/v1/auth/usuarios/:id/desactivar` | Otro admin | Desactiva cuenta y revoca sus sesiones |

Alta inicial por CLI. La recuperación de contraseña mediante email y la administración visual de cuentas quedan fuera del portal mínimo; no simularlas como funcionalidad existente.

## Pacientes e informes

| Método / ruta | Entrada / comportamiento |
| --- | --- |
| POST `/v1/pacientes/buscar` | `{ci}` **o** `{pac}` exacto → paciente; 404 si no existe |
| POST `/v1/pacientes` | `{nombre,ci?,pac?}`. CI o PAC obligatorio; conviene el PAC si se conoce, porque es la clave con la que el CRM reconoce al paciente sin dudas. Cualquier otro campo es 400 |
| GET `/v1/informes/configuracion` | Límite de PDF, modo de acceso del paciente y estudios frecuentes |
| GET `/v1/informes` | Query `pagina=1`, `limite=25` (máximo 100), `estado?`, `pacienteId?`. Resultado `{datos,total,pagina,limite,totalPaginas}` |
| POST `/v1/informes` | `{pacienteId,estudio,fechaEstudio}` → `{informe,acceso:{id,expiraEn,url}}`; 201 |
| GET `/v1/informes/:id` | Informe, paciente, médico, archivo sin clave de almacenamiento, acceso con vencimiento y primera apertura, y `adjuntos: [{id,tipo:"VIDEO"\|"IMAGEN",mime,nombre,bytes,createdAt}]` |
| POST `/v1/informes/:id/pdf` | `multipart/form-data`: `archivo` PDF y `revision`. Devuelve informe con revisión incrementada; 201 |
| GET `/v1/informes/:id/pdf` | PDF adjunto; también permite revisión médica del borrador |
| POST `/v1/informes/:id/publicar` | Contrato de publicación debajo; 200 |
| POST `/v1/informes/:id/retirar` | `{revision,motivo}` de 5–250 caracteres; revoca acceso; 200 |
| POST `/v1/informes/:id/acceso/renovar` | Sin cuerpo → `{id,expiraEn,url}`: el **mismo** enlace, 30 días más desde hoy. Para cortarlo, retirar |
| POST `/v1/informes/:id/adjuntos` | `multipart/form-data` con un solo campo `archivo` (video o imagen, hasta 100 MB). Borrador **o publicado**; retirado → 409. El tipo se decide por los primeros bytes (MP4, MOV, WebM, GIF, JPG, PNG, WebP); otro formato → 400 `FORMATO_NO_ADMITIDO` con cómo convertirlo. Más de 6 por informe → 409 `LIMITE_ADJUNTOS`. Devuelve el informe con `adjuntos`; 201 |
| GET `/v1/informes/:id/adjuntos/:adjuntoId` | El archivo, con `Range` (206 + `Content-Range`), para la vista previa del médico |
| POST `/v1/informes/:id/adjuntos/:adjuntoId/eliminar` | Lo quita: los bytes se borran del almacenamiento, la fila queda marcada. Devuelve el informe; 200 |

Todas estas rutas requieren sesión médica o admin. Médico: solo informes propios; otro médico recibe 404. Los pacientes son fichas compartidas que se localizan por identificador exacto. No existe listado público de fichas.

Publicación:

```json
{"revision":2,"pacienteYPdfConfirmados":true}
```

Publicar no envía nada: pone el informe en la cola que recepción ve en el CRM, que es quien avisa al paciente por WhatsApp. Los campos de aviso que aceptaba esta ruta hasta el 2026-09-22 (`notificar`, `consentimientoWhatsApp`…) ahora son 400: un cliente viejo que los mande no publica creyendo que avisó.

Después de cualquier mutación, usar la nueva revisión. Tras 409 volver a consultar y explicar lo que cambió; no repetir automáticamente la operación. El enlace se reconstruye siempre con el ID de acceso; no hay secreto que se muestre una sola vez.

## Consulta del paciente

| Método / ruta | Entrada / resultado |
| --- | --- |
| POST `/v1/portal/accesos/:id/ingresar` | Sin cuerpo: el enlace es la llave → `{token,expiraEn}`. 401 si venció, se revocó o se retiró el informe |
| GET `/v1/portal/informe` | Sesión paciente → `{estado,estudio,fechaEstudio,medico,disponible,mensaje,adjuntos:[{id,tipo,mime,bytes}]}`. `adjuntos` va vacío mientras no esté publicado y nunca lleva el nombre del archivo. Si está publicado, marca la primera apertura |
| GET `/v1/portal/informe/adjuntos/:adjuntoId` | Sesión paciente, informe publicado → el video o imagen `inline`, con `Range` (206 + `Content-Range`; 416 si el tramo no cabe): sin eso Safari en el iPhone no reproduce. `?descargar=1` lo entrega `attachment` para guardarlo, y es lo único que se audita (`ADJUNTO_DESCARGADO_PACIENTE`). Cupo propio de 600 por minuto e IP: un video pide decenas de tramos |
| GET `/v1/portal/informe/pdf` | Sesión paciente, informe publicado → `application/pdf` `inline`: se abre en el visor del teléfono. Sirve la **versión liviana** si ya existe (ver arquitectura), si no el original |
| GET `/v1/portal/informe/pdf/original` | Igual, pero el archivo tal cual lo publicó el médico, `attachment`: para imprimir o guardar en máxima calidad |
| POST `/v1/portal/salir` | Revoca sesión paciente |

El token de paciente no autentica al médico ni viceversa. Acceso vencido/retirado: 401 con mensaje orientado a recuperación; borrador: consulta permitida con estado de preparación y descarga 409. 

## Errores

Errores uniformes: `{error:{codigo,mensaje,campos?,requestId}}`. Usar `mensaje` para contexto general y mapear validaciones de campos a etiquetas humanas. Nunca mostrar trazas ni el cuerpo bruto del proveedor. HTTP: 400 datos inválidos, 401 sesión/acceso, 403 permiso administrativo, 404 no disponible para actor, 409 conflicto/estado, 413 tamaño, 429 intentos, 503 dependencia/capacidad.

## Integraciones

GET `/v1/integraciones/crm/informes?pagina=1&limite=50[&informeId=<uuid>][&ids=<uuid>,<uuid>…][&buscar=<nombre|PAC|CI>][&abierto=true|false][&vigente=true|false]`, Bearer exclusivo `CRM_INTEGRATION_TOKEN` → `{datos:[{informeId,paciente:{nombre,pac,ci},estudio,fechaEstudio,publicadoEn,accesoId,accesoVigente,accesoExpiraEn,abiertoEn}],total,pagina,limite,totalPaginas}`. POST `/v1/integraciones/crm/informes/:id/acceso/renovar` extiende 30 días el enlace de un informe **publicado** (404 si no lo está, 409 si fue retirado). Solo informes publicados; nunca el PDF. Esa credencial no abre la API de los médicos. El vínculo con las fichas del CRM lo resuelve el CRM (ver [arquitectura](arquitectura.md#integración-crm)).

Este proyecto no expone webhook de WhatsApp: el único receptor de eventos de Meta es el CRM.

**Filtros y panorama de la cola (desde el 2026-09-30).** Los filtros se resuelven en el portal, donde se corta la página: `buscar` (nombre, PAC o CI, sin distinguir mayúsculas), `abierto`, `vigente` (enlace no vencido ni revocado) e `ids` (hasta 100, devueltos en el orden pedido). GET `/v1/integraciones/crm/informes/panorama[?buscar=…]` → `{totales:{todos,abiertos,vencidosSinAbrir}, vigentesSinAbrir:[ids], truncado, coinciden?:[ids]}`: los ids vigentes y sin abrir, enteros y ordenados como la cola, para que el CRM parta ese conjunto según sus avisos —«por avisar» / «esperando lectura»— y pagine sobre la lista exacta. Tope 5.000 (el enlace dura 30 días); si se supera, `truncado: true` en vez de cortar callado. `buscar` no mueve los totales: solo marca `coinciden`.

**Revisión desde el CRM (desde el 2026-09-29).** POST `/v1/integraciones/crm/informes/:id/revision` (credencial CRM) → `{url, expiraEn}`: un enlace al visor del portal, `<origen>/revision/<informeId>.<vence>.<firma>`, firmado con `SESSION_HMAC_KEY` y un prefijo propio, válido 10 minutos y solo para informes publicados (404 si no). El portal carga el PDF con GET `/v1/revision/<enlace>/pdf` —público; la firma es la credencial, 401 si no vale o venció, 404 si se retiró—, `inline`, versión liviana, auditado como `PDF_REVISADO_CRM` y **sin tocar `abiertoEn`**. El CRM recibe el enlace, nunca el PDF: la ruta anterior `GET /v1/integraciones/crm/informes/:id/pdf` se retiró.
