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
| `mantenimiento` | Purga horaria de sesiones vencidas y contadores de intentos (proceso worker) |
| `controllers.ts` | Contratos HTTP y aplicación de permisos a los adaptadores |

Un solo módulo Nest reúne estos servicios para evitar estructura ceremonial. No hay repositorio genérico, entidades de reservas ficticias ni un sistema extensible de plugins prematuro. Si un dominio futuro crece, tendrá su módulo y sus contratos propios.

## Integridad

- CI/PAC únicos, búsqueda exacta y normalización conservadora. No se fusionan pacientes automáticamente.
- `revision` exige actualización optimista para carga, publicación, renovación y retiro. Una operación desactualizada responde 409.
- Archivo publicado inmutable. Se conserva historial de adjuntos; retirar no borra registros clínicos.
- Publicación y auditoría se guardan en una transacción; dos publicaciones simultáneas dejan una sola.
- Los instantes se almacenan como UTC; `fechaEstudio` es fecha clínica sin hora y se valida con el calendario de Bolivia. Quien la muestre debe formatearla en UTC, o en Bolivia aparece el día anterior.

## Acceso y privacidad

Contraseñas scrypt; sesiones persistidas como HMAC. Clave HMAC exclusiva del servicio. Sesiones del médico, del paciente y credencial CRM no son intercambiables. Sesión médica de 8 horas; sesión paciente de 15 minutos; código válido 30 días y renovable.

**El enlace es la llave (desde el 2026-09-23).** El ID de acceso es un UUID aleatorio de 122 bits: no se adivina ni se recorre (límites por IP y por acceso). Quien tenga el mensaje ve el informe; la clínica lo asumió a cambio de quitarle al paciente el código de 12 caracteres en papel. Lo que protege: vencimiento a 30 días, retiro inmediato del informe, registro de la primera apertura (`abiertoEn`) y que el PDF no viaja en el chat. No usar CI ni PAC como contraseña. No existe búsqueda pública de resultados por nombre o documento.

No se publican URLs directas de R2: la API verifica sesión y estado antes de entregar bytes. La integridad SHA-256 se comprueba al descargar. `Cache-Control: no-store, private`, `Referrer-Policy: no-referrer`, sin indexación. Nunca añadir analítica que capture contenido clínico, códigos, tokens o cuerpos HTTP.

Los médicos pueden localizar pacientes por identificador exacto, pero no explorar un directorio general. Los registros de auditoría anotan acción, actor, informe e instante; no copian el PDF ni sus datos clínicos.

## Integración CRM

El CRM es el único emisor de WhatsApp. Lee la cola con `GET /v1/integraciones/crm/informes`: informes **publicados**, paginados, con credencial exclusiva (`CRM_INTEGRATION_TOKEN`) que solo lee la cola y renueva enlaces de informes publicados, por loopback en el mismo servidor. Cada fila lleva `informeId`, `estudio`, `fechaEstudio`, `publicadoEn`, `accesoId`, `accesoVigente`, `accesoExpiraEn`, `abiertoEn` y `paciente: { nombre, pac, ci }`. Nunca viajan el código, su hash, el PDF, el médico ni nada clínico. El ID de acceso identifica; el código autoriza. Con `?informeId=` devuelve solo ese, para que el CRM revalide justo antes de enviar.

**El vínculo lo resuelve el CRM, no este sistema.** Con los identificadores de la fila busca entre sus fichas: primero el PAC (único allí), y si no hay o no cruza, el CI **solo si coincide con exactamente una ficha** en forma canónica (mayúsculas, sin separadores). Un CI repetido en el CRM no se vincula a ninguna: se le muestra a recepción para corregir las fichas. Con CI, el CRM enseña el nombre del portal junto al de la ficha para que recepción confirme antes de enviar. Lo que sigue prohibido es vincular por nombre o por coincidencias aproximadas.

Hasta el 2026-09-22 el vínculo era una columna `referenciaCrm` derivada del PAC, y los pacientes registrados solo con CI no llegaban nunca al CRM (los dos que había en producción, justamente). Esa columna, la tabla `EventoIntegracion` y su endpoint de eventos —que nadie consumía— se retiraron.

El CRM lleva él mismo la cuenta de a quién avisó (`AvisoResultado`, con índice único por informe contra el doble envío). No se comparten tablas ni se hacen joins entre bases.

## Escala y límites explícitos

PDF hasta 10 MB, dos cargas concurrentes por proceso, consultas paginadas. R2 permite agregar instancias de API sin compartir disco. No se introduce Redis para este volumen.

La validación estructural de PDF ocurre en el proceso API. Antes de subir límites o asumir volúmenes altos, medir memoria, CPU, latencia y considerar mover análisis a un worker de archivos. No se realizaron pruebas de carga ni se garantiza una capacidad numérica.

Retirar impide nuevas descargas; no puede recuperar un archivo ya descargado ni un WhatsApp ya enviado por el CRM. Si el paciente ya recibió el enlace, al abrirlo encontrará el acceso bloqueado. La interfaz de retiro lo dice.

La creación de borrador no tiene clave de idempotencia: ante respuesta perdida, buscar el borrador en la lista antes de repetir. La publicación sí tiene protección contra duplicación. No implementar retry automático indiscriminado en Next.

## Evolución

1. Validar flujo operativo de identificación, envío del enlace y retiro.
2. Portal médico mínimo y consulta paciente implementados en `portal/`; validar ahora el uso con profesionales y pacientes antes de producción.
3. Probar almacenamiento y antivirus reales, backup/restauración y acceso móvil. El envío por WhatsApp lo prueba el CRM con la plantilla aprobada.
4. Activar producción con métricas y volumen limitado.
5. Incorporar reservas/pagos como dominios separados cuando se validen sus reglas. No usar estados del informe para representar citas.
