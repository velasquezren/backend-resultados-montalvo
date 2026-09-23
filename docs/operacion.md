# Operación

## Antes de producción

Este repositorio no configura dominios, infraestructura, facturación ni proveedores automáticamente. El arranque valida configuración obligatoria, pero no demuestra que una plantilla esté aprobada o un bucket sea privado. Validar cada conexión antes de habilitar el flujo clínico.

1. Crear PostgreSQL y usuario exclusivos, con backups cifrados y restauración ensayada. Restringir red; el nombre de base debe empezar por `resultados`.
2. Crear bucket R2 privado sin dominio público/r2.dev. Credencial limitada a ese bucket; nunca usar claves de la cuenta principal en Next. Mantener copias/restauración de PDF coordinadas con la base y acordar retención con la clínica. No borrar informes por edad automáticamente.
3. Instalar ClamAV actualizado en red privada. Su puerto TCP no ofrece autenticación propia: no exponer 3310 a Internet. Configurar límites de análisis al menos iguales a los PDF admitidos, detectar archivos que exceden límites y actualizar firmas con freshclam. Comprobar archivo limpio, detección de prueba y caída del servicio.
4. Configurar HTTPS, CORS exacto, clave HMAC, URL real del portal y credenciales independientes. Reverse proxy local compatible con `trust proxy=loopback`; si es remoto, configurar explícitamente los proxies confiables antes de usar límites por IP.
5. Ejecutar migración una sola vez antes de iniciar nuevas instancias. `NODE_ENV=production` obliga R2 privado o disco cifrado, y ClamAV; no desactivarlo para eludir un fallo de configuración.
6. Iniciar API y worker de mantenimiento como procesos distintos, usuario sin privilegios, reinicio supervisado y límites de CPU/RAM. El worker solo purga cada hora sesiones vencidas y contadores de intentos.
7. Crear usuarios individuales. Probar médico A/B, paciente, enlace vencido y extendido, y retiro. No reutilizar la cuenta de recepción del CRM.
8. Configurar y desplegar el portal Next de `portal/`. Comprobar que ninguna ruta privada esté en sitemap/robots indexable, caché compartida o analítica. El backend por sí solo no hace accesible la pantalla del enlace.

La memoria de ClamAV y el análisis PDF requieren dimensionamiento. Recomendación inicial: servicio de resultados en infraestructura separada del CRM cuando el presupuesto lo permita, sin introducir múltiples servicios de negocio. Un VPS compartido necesita límites efectivos y pruebas de saturación antes de confiarle carga clínica.

## Plantilla de aviso (la envía el CRM)

**Creada en Meta el 2026-09-22** en la WABA de la línea *Recepción Clínica Montalvo*, id `2137598870221549`, nombre `montalvo_resultado_disponible`, en revisión. La usa el CRM (`RESULTADOS_PLANTILLA`). Este proyecto no envía WhatsApp.

| Campo | Valor |
| --- | --- |
| Categoría / idioma | Utilidad / `es` |
| Botón | Visitar sitio web · URL dinámica · `Ver mi informe` |
| URL | `https://resultados.107.175.132.15.nip.io/resultados/{{1}}` (`{{1}}` = ID de acceso) |

**Pendiente en cuanto Meta la apruebe: editar su texto.** Se envió con el cuerpo de la versión con código («…ingresa el código de 12 caracteres que te entregamos en la clínica», pie «No compartas tu código con nadie.»), y desde el 2026-09-23 el paciente abre el informe sin código. Meta no permite editar una plantilla en revisión; al aprobarse se edita la misma —conserva nombre y botón, vuelve a una revisión corta y la versión aprobada sigue enviándose mientras tanto— con:

> Clínica Montalvo: tu informe médico ya está disponible.
>
> Toca el botón de abajo para verlo y descargarlo.
>
> Si necesitas ayuda, responde a este mensaje.

Pie: `El enlace es personal. No lo reenvíes.` Mientras no se edite, el mensaje pide un código que la página ya no pide: el paciente toca el botón y ve su informe igual.

**El cuerpo no lleva variables**: el CRM (`ResultadosService`) manda un único componente, el botón URL con el ID de acceso. No agregar diagnóstico, tipo de estudio, CI, PAC ni el PDF al mensaje: puede leerse en un teléfono compartido. Cerrar con «responde a este mensaje» abre la ventana de 24 horas para resolver dudas por el mismo hilo, y es el patrón con el que se aprobaron las plantillas de citas de esta clínica.

**Riesgo conocido**: el botón apunta a un dominio sobre IP (`nip.io`). Al adoptar un subdominio propio habrá que editar la plantilla, lo que la devuelve a revisión.

La [política de WhatsApp](https://business.whatsapp.com/policy) exige los permisos aplicables para contactar y plantillas aprobadas para iniciar conversaciones conforme a sus reglas; no hace falta obligar al paciente a escribir primero cuando se cumple ese flujo. La [tarificación oficial](https://business.whatsapp.com/products/platform-pricing) depende de categoría y mercado: no se fija un precio inventado en bolivianos.

## Activar la entrega

La configuración vive en el CRM y está puesta desde el 2026-09-22: `PORTAL_RESULTADOS_URL` (loopback `:3010`), `PORTAL_RESULTADOS_TOKEN` (el mismo valor que `CRM_INTEGRATION_TOKEN` de aquí, generado en el servidor), `RESULTADOS_LINEA_ID` y `RESULTADOS_PLANTILLA`. Falta, en orden:

1. **Que Meta apruebe la plantilla.** Hasta entonces el envío falla y el CRM lo muestra como «No se entregó», con opción de reenviar.
2. **Una cuenta del CRM con rol `ASISTENTE`** y acceso a la línea de Recepción. El permiso es esa membresía, no el rango del rol.
3. **Una prueba controlada** a un número propio antes de avisar a pacientes. No notificar retrospectivamente todos los informes al activar.

La app de Meta en modo desarrollo no bloquea este envío: la línea es un número de producción de la WABA y la línea comercial ya escribe a pacientes con la misma app.

## Fallos y recuperación

| Caso | Conducta implementada / acción operativa |
| --- | --- |
| Meta rechaza el aviso (plantilla sin aprobar, número sin WhatsApp) | El CRM lo muestra como «No se entregó» y permite reenviar: consta que no salió nada |
| Envío sin confirmar (red caída con el POST en viaje) | «Sin confirmar»: el CRM no permite reenviar hasta que Meta resuelva el estado, para no mandar dos |
| Paciente sin ficha en el CRM, o con su CI en dos fichas | El CRM lo señala y no envía; corregir la ficha o registrar el PAC |
| Enlace vencido | En el CRM, «Renovar y enviar»: 30 días más, mismo enlace, aviso nuevo. El mensaje anterior vuelve a abrir |
| R2 / antivirus caído | Rechazar carga/descarga con error; no publicar archivo sin verificación |
| PDF equivocado | Retirar, explicar al paciente y crear nuevo informe corregido; conservar auditoría |
| El paciente no encuentra el mensaje | Recepción usa «Renovar y enviar» si venció; si no, le reenvía el enlace desde el historial del chat |

## Observabilidad y mantenimiento

Supervisar API, base, scanner, estado de bucket y worker; `/health/ready` solo verifica base, no todas esas dependencias. Los avisos y su estado se observan en el CRM. La auditoría clínica está en PostgreSQL; no convertir cuerpos de solicitudes en logs.

Rotar secretos en el gestor del despliegue. Cambiar `SESSION_HMAC_KEY` invalida las sesiones abiertas (los enlaces siguen valiendo). No hay recuperación de contraseña por correo ni MFA en esta base; antes de ampliar acceso externo de administradores, definir el proceso operativo de cuentas.

El código no elimina PDFs históricos automáticamente. Un archivo puede quedar huérfano si el proceso cae entre almacenamiento y transacción: conciliar claves referenciadas antes de cualquier limpieza, con período de gracia y revisión. Ensayar restauración de base + archivos, no solo generar backups.

## Límites de validación de esta entrega

Pruebas automáticas con PostgreSQL y HTTP locales y PDFs sintéticos. No se probó almacenamiento R2 real, ClamAV real, restauración productiva, Docker en producción ni carga masiva. El portal Next cuenta con pruebas locales de navegador con datos sintéticos. La preparación del backend no equivale a autorización de puesta en marcha.

Referencias técnicas: [carga de archivos en Nest](https://docs.nestjs.com/techniques/file-upload), [guía OWASP de archivos](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html), [operación de ClamAV](https://docs.clamav.net/manual/Usage/Scanning.html), [URLs firmadas de R2](https://developers.cloudflare.com/r2/api/s3/presigned-urls/).


## Disco privado cifrado del servidor

Alternativa autorizada para esta instalación: `STORAGE_DRIVER=local-encrypted`, `PRIVATE_STORAGE_DIR` absoluta fuera de cualquier raíz web y `STORAGE_ENCRYPTION_KEY` exclusiva de 32 bytes hexadecimales. Cada PDF usa AES-256-GCM, nonce aleatorio y autenticación vinculada a su clave de archivo. Alterar bytes, renombrar un objeto o usar otra clave hace fallar la lectura. No reutilizar la clave de sesiones ni cambiarla sin migrar los documentos.

El proceso API escucha en loopback, con usuario del sistema propio y directorio privado. El portal tiene otro usuario y no lee archivos/credenciales del API. ClamAV escucha solo en loopback. Los servicios tienen límites de memoria y CPU. Esta modalidad permite comenzar sin configurar R2; una migración posterior a R2 exige trasladar/verificar los objetos, no solo cambiar la variable.

Endpoint de cambio de contraseña: POST `/v1/auth/password`, cuerpo `{actual,nueva}`; requiere sesión, valida la contraseña actual y revoca todas las sesiones al guardar. Disponible en el portal. El primer administrador recibe una contraseña aleatoria mediante un archivo local protegido, fuera del repositorio.

Las copias del servidor complementan los archivos privados; una copia en el mismo VPS no protege contra la pérdida del VPS. Conservar las claves y una copia externa fuera del servidor antes de acumular informes. El enlace `nip.io` es provisional y debe sustituirse por un subdominio propio cuando esté disponible.
