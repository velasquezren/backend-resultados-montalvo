# Operación y activación

## Antes de producción

Este repositorio no configura dominios, infraestructura, facturación ni proveedores automáticamente. El arranque valida configuración obligatoria, pero no demuestra que una plantilla esté aprobada o un bucket sea privado. Validar cada conexión antes de habilitar el flujo clínico.

1. Crear PostgreSQL y usuario exclusivos, con backups cifrados y restauración ensayada. Restringir red; el nombre de base debe empezar por `resultados`.
2. Crear bucket R2 privado sin dominio público/r2.dev. Credencial limitada a ese bucket; nunca usar claves de la cuenta principal en Next. Mantener copias/restauración de PDF coordinadas con la base y acordar retención con la clínica. No borrar informes por edad automáticamente.
3. Instalar ClamAV actualizado en red privada. Su puerto TCP no ofrece autenticación propia: no exponer 3310 a Internet. Configurar límites de análisis al menos iguales a los PDF admitidos, detectar archivos que exceden límites y actualizar firmas con freshclam. Comprobar archivo limpio, detección de prueba y caída del servicio.
4. Configurar HTTPS, CORS exacto, clave HMAC, URL real del portal y credenciales independientes. Reverse proxy local compatible con `trust proxy=loopback`; si es remoto, configurar explícitamente los proxies confiables antes de usar límites por IP.
5. Ejecutar migración una sola vez antes de iniciar nuevas instancias. `NODE_ENV=production` obliga R2 y ClamAV; no desactivarlo para eludir un fallo de configuración.
6. Iniciar API y worker como procesos distintos, usuario sin privilegios, reinicio supervisado y límites de CPU/RAM. El API no ejecuta la cola al recibir una petición.
7. Crear usuarios individuales. Probar médico A/B, paciente, sesión vencida, código renovado y retiro. No reutilizar la cuenta de recepción del CRM.
8. Configurar y desplegar el portal Next de `portal/`. Comprobar que ninguna ruta privada esté en sitemap/robots indexable, caché compartida o analítica. El backend por sí solo no hace accesible la pantalla del enlace.

La memoria de ClamAV y el análisis PDF requieren dimensionamiento. Recomendación inicial: servicio de resultados en infraestructura separada del CRM cuando el presupuesto lo permita, sin introducir múltiples servicios de negocio. Un VPS compartido necesita límites efectivos y pruebas de saturación antes de confiarle carga clínica.

## Plantilla propuesta (no enviada a aprobación)

Nombre sugerido: `resultado_disponible_montalvo`, idioma `es`, categoría solicitada `UTILITY` (Meta determina la aprobación y categoría final).

Texto propuesto:

> Clínica Montalvo: tu resultado está disponible. Puedes consultarlo con el código que te entregamos en la clínica. Si necesitas ayuda, comunícate con atención al paciente.

Botón: **Consultar resultado**. URL dinámica: `https://DOMINIO-REAL/resultados/{{1}}`, donde la parte dinámica es el ID de acceso, no el código. La base debe coincidir con `PATIENT_PORTAL_URL`. Esta implementación espera un botón URL en índice 0 y ningún parámetro en el cuerpo; si Meta aprueba otra estructura, adaptar transporte y contrato antes de activar.

No agregar diagnóstico, tipo de patología, CI, PDF o código secreto al mensaje. El paciente puede seguir recibiendo notificaciones en un teléfono compartido: el texto debe ser discreto.

La [política de WhatsApp](https://business.whatsapp.com/policy) exige los permisos aplicables para contactar y plantillas aprobadas para iniciar conversaciones conforme a sus reglas; no hace falta obligar al paciente a escribir primero cuando se cumple ese flujo. La [tarificación oficial](https://business.whatsapp.com/products/platform-pricing) depende de categoría y mercado: no se fija un precio inventado en bolivianos.

## Elegir línea y activar

Preferencia propuesta: línea dedicada a avisos de resultados para aislar configuración y operación. La elección del usuario sigue pendiente. Si se usa la recepción actual, coordinar la app, suscripción y distribución de webhooks sin reemplazar el webhook existente del CRM; no cambiar suscripciones a ciegas.

Completar `WHATSAPP_PHONE_NUMBER_ID`, token con permiso adecuado, plantilla aprobada y mismo idioma, versión Graph soportada, `META_APP_SECRET` y `META_VERIFY_TOKEN`. Registrar `/webhooks/whatsapp`, verificar challenge y eventos de estado. No copiar tokens al frontend ni al repositorio.

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
