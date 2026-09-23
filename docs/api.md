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
| GET `/v1/informes/:id` | Informe, paciente, médico, archivo sin clave de almacenamiento, acceso con vencimiento y primera apertura |
| POST `/v1/informes/:id/pdf` | `multipart/form-data`: `archivo` PDF y `revision`. Devuelve informe con revisión incrementada; 201 |
| GET `/v1/informes/:id/pdf` | PDF adjunto; también permite revisión médica del borrador |
| POST `/v1/informes/:id/publicar` | Contrato de publicación debajo; 200 |
| POST `/v1/informes/:id/retirar` | `{revision,motivo}` de 5–250 caracteres; revoca acceso; 200 |
| POST `/v1/informes/:id/acceso/renovar` | Sin cuerpo → `{id,expiraEn,url}`: el **mismo** enlace, 30 días más desde hoy. Para cortarlo, retirar |

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
| GET `/v1/portal/informe` | Sesión paciente → `{estado,estudio,fechaEstudio,medico,disponible,mensaje}`. Si está publicado, marca la primera apertura |
| GET `/v1/portal/informe/pdf` | Sesión paciente, informe publicado → `application/pdf` `inline`: se abre en el visor del teléfono |
| POST `/v1/portal/salir` | Revoca sesión paciente |

El token de paciente no autentica al médico ni viceversa. Acceso vencido/retirado: 401 con mensaje orientado a recuperación; borrador: consulta permitida con estado de preparación y descarga 409. 

## Errores

Errores uniformes: `{error:{codigo,mensaje,campos?,requestId}}`. Usar `mensaje` para contexto general y mapear validaciones de campos a etiquetas humanas. Nunca mostrar trazas ni el cuerpo bruto del proveedor. HTTP: 400 datos inválidos, 401 sesión/acceso, 403 permiso administrativo, 404 no disponible para actor, 409 conflicto/estado, 413 tamaño, 429 intentos, 503 dependencia/capacidad.

## Integraciones

GET `/v1/integraciones/crm/informes?pagina=1&limite=50[&informeId=<uuid>]`, Bearer exclusivo `CRM_INTEGRATION_TOKEN` → `{datos:[{informeId,paciente:{nombre,pac,ci},estudio,fechaEstudio,publicadoEn,accesoId,accesoVigente,accesoExpiraEn,abiertoEn}],total,pagina,limite,totalPaginas}`. POST `/v1/integraciones/crm/informes/:id/acceso/renovar` extiende 30 días el enlace de un informe **publicado** (404 si no lo está, 409 si fue retirado). Solo informes publicados; nunca el PDF. Esa credencial no abre la API de los médicos. El vínculo con las fichas del CRM lo resuelve el CRM (ver [arquitectura](arquitectura.md#integración-crm)).

Este proyecto no expone webhook de WhatsApp: el único receptor de eventos de Meta es el CRM.
