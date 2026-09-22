# Arquitectura del dominio de resultados

## Decisión

Backend independiente junto al frontend Next, con propiedad exclusiva de datos, usuarios y archivos. El CRM conserva recepción, conversaciones y ventas. Los médicos no necesitan cuenta ni sesión del CRM.

Se comparte la identidad visual mediante los tokens existentes de Next, no mediante imports entre aplicaciones. El portal se implementó como aplicación Next independiente en `portal/`, con acceso médico en `/` y consulta paciente en `/resultados/:id`. API y portal se despliegan como procesos distintos. La web institucional no recibe acceso privilegiado por compartir un repositorio.

## Límites del código

| Carpeta | Responsabilidad |
| --- | --- |
| `auth` | Cuentas propias, sesiones opacas, revocación, límite de intentos |
| `results` | Pacientes, ciclo del informe, permiso del médico y acceso del paciente |
| `files` | PDF, antivirus, integridad y almacenamiento privado |
| `notifications` | Transporte Meta, cola transaccional, reintentos y estados |
| `controllers.ts` | Contratos HTTP y aplicación de permisos a los adaptadores |

Un solo módulo Nest reúne estos servicios para evitar estructura ceremonial. No hay repositorio genérico, entidades de reservas ficticias ni un sistema extensible de plugins prematuro. Si un dominio futuro crece, tendrá su módulo y sus contratos propios.

## Integridad

- CI/PAC únicos, búsqueda exacta y normalización conservadora. No se fusionan pacientes automáticamente.
- `revision` exige actualización optimista para carga, publicación, aviso posterior y retiro. Una operación desactualizada responde 409.
- Archivo publicado inmutable. Se conserva historial de adjuntos; retirar no borra registros clínicos.
- Publicación, autorización del aviso, auditoría y evento CRM se guardan en una transacción. Un aviso por informe, protegido además por restricción única.
- El worker reclama una tarea con bloqueo de fila; varios workers no envían simultáneamente la misma tarea.
- Webhooks firmados, filtrados por línea y correlacionados con intento. No hacen retroceder `LEIDO` a `FALLIDO`.
- Los instantes se almacenan como UTC; `fechaEstudio` es fecha clínica sin hora y se valida con el calendario de Bolivia. La consulta SQL del worker compara explícitamente en UTC, independientemente de la zona del servidor PostgreSQL.

## Acceso y privacidad

Contraseñas scrypt; sesiones y códigos persistidos como HMAC. Clave HMAC exclusiva del servicio. Sesiones del médico, del paciente y credencial CRM no son intercambiables. Sesión médica de 8 horas; sesión paciente de 15 minutos; código válido 30 días y renovable.

No usar CI, PAC ni teléfono como contraseña. El enlace identifica el acceso; el código autoriza la consulta. Cambiar código revoca sesiones anteriores. No existe búsqueda pública de resultados por nombre o documento.

No se publican URLs directas de R2: la API verifica sesión y estado antes de entregar bytes. La integridad SHA-256 se comprueba al descargar. `Cache-Control: no-store, private`, `Referrer-Policy: no-referrer`, sin indexación. Nunca añadir analítica que capture contenido clínico, códigos, tokens o cuerpos HTTP.

Los médicos pueden localizar pacientes por identificador exacto, pero no explorar un directorio general. Los registros de auditoría anotan acción, actor, informe e instante; no copian el PDF ni sus datos clínicos.

## Integración CRM

`GET /v1/integraciones/crm/eventos` entrega eventos administrativos paginados con secuencia creciente. Credencial exclusiva de lectura. Solo pacientes vinculados por `referenciaCrm` producen eventos.

**El vínculo se deriva del PAC** (`claveCrm`: mayúsculas, sin separadores). El PAC es único en los dos sistemas y el CRM lo guarda también en mayúsculas, así que no es una inferencia: es la misma clave escrita en forma canónica. Se quitan guiones y espacios porque el médico lo teclea a mano. Un paciente sin PAC —identificado solo por CI— no se vincula y no produce eventos; eso es correcto, no un fallo. Un administrador puede seguir fijando `referenciaCrm` a mano y ese valor se respeta tal cual. Lo que sigue prohibido es inferir el vínculo por nombre o por coincidencias aproximadas.

Backfill de las fichas creadas antes de esta regla, idempotente y sin tocar las ya vinculadas:

```sql
UPDATE "Paciente"
   SET "referenciaCrm" = upper(regexp_replace(pac, '[^A-Za-z0-9]', '', 'g'))
 WHERE pac IS NOT NULL AND "referenciaCrm" IS NULL;
```

`GET /v1/integraciones/crm/informes` entrega la cola de informes publicados de pacientes vinculados, paginada, con `accesoId` y si el acceso sigue vigente. Es lectura administrativa: el ID de acceso identifica pero no autoriza —el código lo hace— y nunca viajan el código, el PDF ni datos clínicos. El CRM decide a quién avisar y guarda él mismo a quién ya avisó: Resultados no lleva esa cuenta cuando el emisor es el CRM.

Contrato: `RESULTADO_PUBLICADO` y `RESULTADO_RETIRADO`, con `informeId`, `referenciaCrm`, `id`, `secuencia`, `createdAt`. No incluye PDF, diagnóstico, código, teléfono, CI/PAC ni autorización para abrir el informe.

El futuro consumidor debe guardar el cursor después de aplicar eventos y deduplicar por `id`. No compartir tablas ni hacer joins entre bases. **El consumidor no está instalado en el CRM**, por lo que no aparece una nueva ficha ni una notificación allí todavía. La API está preparada para esa conexión.

## Escala y límites explícitos

PDF hasta 10 MB, dos cargas concurrentes por proceso, consultas paginadas, worker separado. R2 permite agregar instancias de API sin compartir disco. La cola utiliza PostgreSQL: no se introduce Redis solo para este volumen inicial.

La validación estructural de PDF ocurre en el proceso API. Antes de subir límites o asumir volúmenes altos, medir memoria, CPU, latencia y considerar mover análisis a un worker de archivos. No se realizaron pruebas de carga ni se garantiza una capacidad numérica.

Retirar impide nuevas descargas; no puede recuperar un archivo ya descargado ni cancelar una petición a Meta ya aceptada. Si el aviso está en tránsito puede llegar un enlace cuyo acceso ya esté bloqueado. Esto debe explicarse en la interfaz de retiro.

No hay garantía distribuida de envío exactamente una vez ante fallos de red externos. La decisión conservadora es no repetir resultados inciertos. Los intentos aceptados se concilian por webhook.

La creación de borrador no tiene clave de idempotencia: ante respuesta perdida, buscar el borrador en la lista antes de repetir. La publicación y los avisos sí tienen protección contra duplicación. No implementar retry automático indiscriminado en Next.

## Evolución

1. Validar flujo operativo de identificación, entrega del código y retiro.
2. Portal médico mínimo y consulta paciente implementados en `portal/`; validar ahora el uso con profesionales y pacientes antes de producción.
3. Probar almacenamiento y antivirus reales, backup/restauración, acceso móvil y envío consentido con línea elegida.
4. Activar producción con métricas y volumen limitado.
5. Incorporar reservas/pagos como dominios separados cuando se validen sus reglas. No usar estados del informe para representar citas.
