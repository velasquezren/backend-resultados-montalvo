# Operación y activación

## Antes de producción

Este repositorio no configura dominios, infraestructura, facturación ni proveedores automáticamente. El arranque valida configuración obligatoria, pero no demuestra que una plantilla esté aprobada o un bucket sea privado. Validar cada conexión antes de habilitar el flujo clínico.

1. Crear PostgreSQL y usuario exclusivos, con backups cifrados y restauración ensayada. Restringir red; el nombre de base debe empezar por `resultados`.
2. Crear bucket R2 privado sin dominio público/r2.dev. Credencial limitada a ese bucket; nunca usar claves de la cuenta principal en Next. Mantener copias/restauración de PDF coordinadas con la base y acordar retención con la clínica. No borrar informes por edad automáticamente.
3. Instalar ClamAV actualizado en red privada. Su puerto TCP no ofrece autenticación propia: no exponer 3310 a Internet. Configurar límites de análisis al menos iguales a los PDF admitidos, detectar archivos que exceden límites y actualizar firmas con freshclam. Comprobar archivo limpio, detección de prueba y caída del servicio.
4. Configurar HTTPS, CORS exacto, clave HMAC, URL real del portal y credenciales independientes. Reverse proxy local compatible con `trust proxy=loopback`; si es remoto, configurar explícitamente los proxies confiables antes de usar límites por IP.
5. Ejecutar migración una sola vez antes de iniciar nuevas instancias. `NODE_ENV=production` obliga R2 privado o disco cifrado, y ClamAV; no desactivarlo para eludir un fallo de configuración.
6. Iniciar API y worker como procesos distintos, usuario sin privilegios, reinicio supervisado y límites de CPU/RAM. El API no ejecuta la cola al recibir una petición.
7. Crear usuarios individuales. Probar médico A/B, paciente, sesión vencida, código renovado y retiro. No reutilizar la cuenta de recepción del CRM.
8. Configurar y desplegar el portal Next de `portal/`. Comprobar que ninguna ruta privada esté en sitemap/robots indexable, caché compartida o analítica. El backend por sí solo no hace accesible la pantalla del enlace.

La memoria de ClamAV y el análisis PDF requieren dimensionamiento. Recomendación inicial: servicio de resultados en infraestructura separada del CRM cuando el presupuesto lo permita, sin introducir múltiples servicios de negocio. Un VPS compartido necesita límites efectivos y pruebas de saturación antes de confiarle carga clínica.

## Plantilla de aviso (especificación final)

Verificado el 2026-09-22 contra producción: `PATIENT_PORTAL_URL=https://resultados.107.175.132.15.nip.io/resultados`, y esa ruta más el UUID del acceso responde 200 pidiendo el código de 12 caracteres.

| Campo | Valor |
| --- | --- |
| Nombre | `montalvo_resultado_disponible` |
| Categoría | Utilidad |
| Idioma | Español (`es`) |
| Encabezado | ninguno |
| Pie | `No compartas tu código con nadie.` |
| Botón | Visitar sitio web · URL dinámica |
| Texto del botón | `Ver mi informe` |
| URL | `https://resultados.107.175.132.15.nip.io/resultados/{{1}}` |
| Ejemplo de `{{1}}` | `3d300296-db32-4238-85e4-58d02aeb534a` |

Cuerpo, **sin ninguna variable**:

> Clínica Montalvo: tu informe médico ya está disponible.
>
> Ábrelo con el botón de abajo e ingresa el código de 12 caracteres que te entregamos en la clínica.
>
> Si no tienes el código o necesitas ayuda, responde a este mensaje.

**El cuerpo no puede llevar variables.** `MetaTransport` envía un único componente —el botón URL en índice 0— y ningún parámetro de cuerpo. Si la plantilla aprobada tuviera un `{{1}}` en el texto, cada envío fallaría por número de parámetros. Cambiar eso obliga a tocar el transporte y su contrato antes de activar.

La parte dinámica es el **ID de acceso**, nunca el código: el enlace identifica, el código autoriza. No agregar diagnóstico, tipo de estudio, CI, PAC, PDF ni el código al mensaje; el paciente puede leerlo en un teléfono compartido.

Cerrar con «responde a este mensaje» no es adorno: es el patrón con el que las tres plantillas de citas de esta clínica fueron aprobadas el 2026-09-22, y además abre la ventana de 24 horas para que recepción resuelva por el mismo hilo a quien perdió el código.

**Riesgo conocido**: el botón apunta a un dominio comodín sobre IP (`nip.io`). Es el elemento con más probabilidad de rechazo y el que peor lee un paciente. Al adoptar un subdominio propio habrá que **editar la plantilla**, lo que la devuelve a revisión y reinicia su calificación de calidad: conviene tener el dominio definitivo antes de enviarla a aprobar. Si la rechazan, la variante sin botón —mismo cuerpo, sin enlace, resolviendo por respuesta dentro de la ventana de 24 h— tiene el precedente de las tres ya aprobadas.

La [política de WhatsApp](https://business.whatsapp.com/policy) exige los permisos aplicables para contactar y plantillas aprobadas para iniciar conversaciones conforme a sus reglas; no hace falta obligar al paciente a escribir primero cuando se cumple ese flujo. La [tarificación oficial](https://business.whatsapp.com/products/platform-pricing) depende de categoría y mercado: no se fija un precio inventado en bolivianos.

## Elegir línea y activar

Estado comprobado en producción el 2026-09-22, en este orden de bloqueo:

1. **La app de Meta está en modo desarrollo** (`CRM Montalvo`, `1026204626700838`: `is_live: false`, sin política de privacidad, sin App Review). En ese modo solo se puede escribir a números con rol en la app. Pasarla a Live exige una URL de política de privacidad, hoy vacía. **Nada de lo demás sirve hasta resolver esto.**
2. **`/etc/montalvo-resultados/api.env` no tiene ninguna variable de WhatsApp.** El CRM sí tiene la línea completa (`WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WABA_ID`, token). Resultados y el CRM comparten servidor, de modo que compartir la misma línea es posible y evita un segundo número.
3. **No existía `resultados-worker.service`.** Sin worker la cola `Aviso` se llena y no sale nada: `tick()` solo corre en ese proceso, nunca al atender una petición web. La unidad está versionada en `ops/resultados-worker.service`.

Completar entonces `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TOKEN` con permiso de mensajería, `WHATSAPP_TEMPLATE=montalvo_resultado_disponible`, idioma coincidente, `META_APP_SECRET` y `META_VERIFY_TOKEN`. No copiar tokens al frontend ni al repositorio.

**Conflicto de webhooks, a decidir antes de activar.** Meta entrega los eventos de estado a una sola URL por app, y la app actual ya los manda al CRM. Si Resultados envía con esa misma app, sus avisos se quedarán en `ACEPTADO` para siempre: nunca verán `ENTREGADO`, `LEIDO` ni `FALLIDO`. Dos salidas legítimas: una segunda app de Meta suscrita a la misma WABA con su propio `/webhooks/whatsapp`, o que el CRM reenvíe a Resultados los eventos cuyo `biz_opaque_callback_data` le corresponda. No cambiar la suscripción existente del CRM a ciegas.

Solo después: `NOTIFICATIONS_ENABLED=true`, reiniciar API/worker y realizar una prueba consentida controlada, con autorización de costo. Comprobar aceptado, entregado, fracaso y correlación del evento. No enviar una campaña ni notificar retrospectivamente todos los informes al activar.

La interfaz debe diferenciar “Publicar informe” de “Autorizar aviso por WhatsApp” y confirmar destinatario. El límite diario predeterminado es 100 **intentos** globales por día UTC; no constituye presupuesto monetario ni limita otros envíos que haga la misma WABA fuera de este servicio.

## Fallos y recuperación

| Caso | Conducta implementada / acción operativa |
| --- | --- |
| Meta acepta | Guardar ID y esperar webhook; no afirmar entrega inmediata |
| Rechazo transitorio explícito | Hasta tres intentos totales, separados por demora creciente |
| Rechazo permanente, incluido 130497 | Fallido, conservar código para diagnóstico; no repetir automáticamente |
| Timeout / respuesta ambigua / worker interrumpido tras reclamar | Incierto, no duplicar; esperar webhook y revisar proveedor |
| Límite diario agotado | Mantener pendientes hasta cuota disponible; observar antigüedad de cola |
| Acceso vence antes del envío | Cancelar tarea; renovar y revisar con el paciente por canal operativo |
| R2 / antivirus caído | Rechazar carga/descarga con error; no publicar archivo sin verificación |
| PDF equivocado | Retirar, explicar al paciente y crear nuevo informe corregido; conservar auditoría |
| Código perdido | Médico renueva, entrega código nuevo; se revocan sesiones anteriores |

No existe botón/API de reenvío de un aviso fallido o incierto en esta versión. Evita dobles cargos sin conciliación. La recuperación puede consistir en entregar enlace/código en clínica; cualquier reenvío futuro debe tener confirmación y un identificador de intento nuevo con conciliación explícita.

## Observabilidad y mantenimiento

Supervisar API, base, scanner, estado de bucket, worker y antigüedad de tareas; `/health/ready` solo verifica base, no todas esas dependencias. Alertar por avisos inciertos, fallidos o pendientes prolongados. La auditoría clínica está en PostgreSQL; no convertir cuerpos de solicitudes en logs.

Rotar secretos en el gestor del despliegue. Cambiar `SESSION_HMAC_KEY` invalida sesiones y códigos existentes: planificar renovación/entrega de accesos; no tratarla como una rotación transparente. No hay recuperación de contraseña por correo ni MFA en esta base; antes de ampliar acceso externo de administradores, definir el proceso operativo de cuentas.

El código no elimina PDFs históricos automáticamente. Un archivo puede quedar huérfano si el proceso cae entre almacenamiento y transacción: conciliar claves referenciadas antes de cualquier limpieza, con período de gracia y revisión. Ensayar restauración de base + archivos, no solo generar backups.

## Límites de validación de esta entrega

Pruebas automáticas con PostgreSQL y HTTP locales, transporte de avisos simulado y PDFs sintéticos. No se probó entrega real, almacenamiento R2 real, ClamAV real, restauración productiva, Docker en producción ni carga masiva. El portal Next cuenta con pruebas locales de navegador con datos sintéticos. La preparación del backend no equivale a autorización de puesta en marcha.

Referencias técnicas: [carga de archivos en Nest](https://docs.nestjs.com/techniques/file-upload), [guía OWASP de archivos](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html), [operación de ClamAV](https://docs.clamav.net/manual/Usage/Scanning.html), [URLs firmadas de R2](https://developers.cloudflare.com/r2/api/s3/presigned-urls/).


## Disco privado cifrado del servidor

Alternativa autorizada para esta instalación: `STORAGE_DRIVER=local-encrypted`, `PRIVATE_STORAGE_DIR` absoluta fuera de cualquier raíz web y `STORAGE_ENCRYPTION_KEY` exclusiva de 32 bytes hexadecimales. Cada PDF usa AES-256-GCM, nonce aleatorio y autenticación vinculada a su clave de archivo. Alterar bytes, renombrar un objeto o usar otra clave hace fallar la lectura. No reutilizar la clave de sesiones ni cambiarla sin migrar los documentos.

El proceso API escucha en loopback, con usuario del sistema propio y directorio privado. El portal tiene otro usuario y no lee archivos/credenciales del API. ClamAV escucha solo en loopback. Los servicios tienen límites de memoria y CPU. Esta modalidad permite comenzar sin configurar R2; una migración posterior a R2 exige trasladar/verificar los objetos, no solo cambiar la variable.

Endpoint de cambio de contraseña: POST `/v1/auth/password`, cuerpo `{actual,nueva}`; requiere sesión, valida la contraseña actual y revoca todas las sesiones al guardar. Disponible en el portal. El primer administrador recibe una contraseña aleatoria mediante un archivo local protegido, fuera del repositorio.

Las copias del servidor complementan los archivos privados; una copia en el mismo VPS no protege contra la pérdida del VPS. Conservar las claves y una copia externa fuera del servidor antes de acumular informes. El enlace `nip.io` es provisional y debe sustituirse por un subdominio propio cuando esté disponible.
