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
| POST `/v1/pacientes` | `{nombre,ci?,pac?,telefono?,referenciaCrm?}`. CI o PAC obligatorio; referencia CRM solo admin; teléfono E.164 (`+591…`) |
| GET `/v1/informes/configuracion` | Límites PDF, disponibilidad de avisos, aviso de costo y modo de acceso paciente |
| GET `/v1/informes` | Query `pagina=1`, `limite=25` (máximo 100), `estado?`, `pacienteId?`. Resultado `{datos,total,pagina,limite,totalPaginas}` |
| POST `/v1/informes` | `{pacienteId,estudio,fechaEstudio}` → `{informe,acceso:{id,codigo,expiraEn,url}}`; 201 |
| GET `/v1/informes/:id` | Informe, paciente, médico, archivo sin clave de almacenamiento, aviso sin credenciales, acceso sin código/hash |
| POST `/v1/informes/:id/pdf` | `multipart/form-data`: `archivo` PDF y `revision`. Devuelve informe con revisión incrementada; 201 |
| GET `/v1/informes/:id/pdf` | PDF adjunto; también permite revisión médica del borrador |
| POST `/v1/informes/:id/publicar` | Contrato de publicación debajo; 200 |
| POST `/v1/informes/:id/notificar` | `{revision,telefonoConfirmado:true,consentimientoWhatsApp:true,consentimientoVersion}`; solo publicado, sin aviso anterior; 200 |
| POST `/v1/informes/:id/retirar` | `{revision,motivo}` de 5–250 caracteres; revoca acceso; 200 |
| POST `/v1/informes/:id/acceso/renovar` | Sin cuerpo → nuevo `{id,codigo,expiraEn,url}`; revoca sesiones anteriores e incrementa revisión del informe |

Todas estas rutas requieren sesión médica o admin. Médico: solo informes propios; otro médico recibe 404. Los pacientes son fichas compartidas que se localizan por identificador exacto. No existe listado público de fichas.

Publicación sin WhatsApp:

```json
{"revision":2,"pacienteYPdfConfirmados":true,"notificar":false}
```

Publicación con autorización de aviso:

```json
{
  "revision":2,
  "pacienteYPdfConfirmados":true,
  "notificar":true,
  "telefonoConfirmado":true,
  "consentimientoWhatsApp":true,
  "consentimientoVersion":"resultados-v1"
}
```

`consentimientoVersion` identifica el texto realmente aceptado en clínica; no es una autorización inventada por el frontend. Registrar el aviso sin evidencia operativa de consentimiento no es válido aunque el JSON lo permita.

Después de cualquier mutación, usar la nueva revisión. Tras 409 volver a consultar y explicar lo que cambió; no repetir automáticamente la operación. Solo la creación/renovación devuelve el código en claro. La ficha permite reconstruir el enlace con el ID de acceso, pero no recuperar su código; si se perdió, renovar y entregarlo nuevamente.

## Consulta del paciente

| Método / ruta | Entrada / resultado |
| --- | --- |
| POST `/v1/portal/accesos/:id/ingresar` | `{codigo}` de 12 caracteres; tolera espacios/guiones → `{token,expiraEn}` |
| GET `/v1/portal/informe` | Sesión paciente → `{estado,estudio,fechaEstudio,medico,disponible,mensaje}` |
| GET `/v1/portal/informe/pdf` | Sesión paciente, informe publicado → `application/pdf`, descarga `informe.pdf` |
| POST `/v1/portal/salir` | Revoca sesión paciente |

El token de paciente no autentica al médico ni viceversa. Acceso vencido/retirado: 401 con mensaje orientado a recuperación; borrador: consulta permitida con estado de preparación y descarga 409. Nunca mostrar información clínica antes de verificar el código.

## Avisos y errores

| Estado aviso | Texto recomendado |
| --- | --- |
| PENDIENTE | Aviso pendiente |
| ENVIANDO | Enviando aviso |
| ACEPTADO | WhatsApp aceptó el aviso; entrega pendiente |
| ENTREGADO | Aviso entregado |
| LEIDO | Aviso leído |
| FALLIDO | No se pudo enviar. Puedes entregar el acceso en la clínica |
| INCIERTO | No pudimos confirmar el envío. No lo repetiremos automáticamente |
| CANCELADO | Aviso cancelado |

No llamar “Entregado” a `ACEPTADO`. La lectura depende de los eventos que Meta efectivamente entregue.

Errores uniformes: `{error:{codigo,mensaje,campos?,requestId}}`. Usar `mensaje` para contexto general y mapear validaciones de campos a etiquetas humanas. Nunca mostrar trazas ni el cuerpo bruto del proveedor. HTTP: 400 datos inválidos, 401 sesión/acceso, 403 permiso administrativo, 404 no disponible para actor, 409 conflicto/estado, 413 tamaño, 429 intentos, 503 dependencia/capacidad.

## Integraciones

GET `/v1/integraciones/crm/eventos?despues=0&limite=50`, Bearer exclusivo `CRM_INTEGRATION_TOKEN` → `{datos:[{secuencia,id,tipo,informeId,referenciaCrm,createdAt}],siguiente}`. Cursor persistido por consumidor, entrega repetible; deduplicar por ID. Esa credencial no abre informes.

GET `/webhooks/whatsapp` verifica el challenge de Meta. POST en la misma ruta valida `X-Hub-Signature-256` sobre cuerpo original, acepta eventos de la línea configurada y actualiza estados. Un cuerpo con firma inválida devuelve 401.
