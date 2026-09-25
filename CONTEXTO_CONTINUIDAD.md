# Contexto de continuidad — Montalvo

> **Actualización 23 de septiembre de 2026 — manda sobre todo lo de abajo.**
>
> - **Todo está en `main` y desplegado.** Ningún repositorio tiene cambios
>   locales: clonar GitHub basta para continuar. Versión activa en el servidor:
>   `releases/20260923-1911-pagina-paciente`.
> - **El enlace es la llave**: el paciente abre su informe desde el botón del
>   WhatsApp, sin código. El aviso lo manda el CRM con la plantilla aprobada
>   `montalvo_informe_disponible` (desde el 24-09; sin código ni imagen).
> - **Página del paciente rediseñada** al estilo del CRM, con su propio marco
>   (`portal/app/resultados/layout.tsx`, Poppins, tokens en `.pac`). El portal
>   de médicos está en `portal/app/(medico)/`; las URL no cambiaron.
> - **Vista previa en WhatsApp**: `portal/app/resultados/opengraph-image.tsx`
>   (genérica, sin datos del paciente). `robots.txt` solo deja pasar a los
>   lectores de vista previa de WhatsApp/Facebook en `/resultados/`; sigue el
>   `noindex`.
> - **Imagen de cabecera** para la plantilla futura con imagen:
>   `/resultados/imagen-aviso` (PNG 1200×628). Plantillas preparadas y sin
>   enviar a Meta: `docs/plantillas-whatsapp.md` del **backend del CRM**.
> - Borrados de producción (con respaldo previo) los informes de prueba
>   «Rene»/«ppe». Queda un informe de prueba «Clinica Montalvo»
>   (PAC `PRUEBA-7761`), vinculado en el CRM a la ficha del 77617610.
> - La contraseña inicial de `doctor@montalvo.com` **ya no es válida** (se
>   cambió). No existe cuenta de médico de prueba: crearla quedó pendiente de
>   autorización del propietario.

> **Actualización 22 de septiembre de 2026 — lo que cambió respecto de lo de abajo.**
> El camino de avisos por WhatsApp de este proyecto (transporte Meta, webhook
> `/webhooks/whatsapp`, consentimiento al publicar, tablas `Aviso`,
> `CuotaAvisos` y `EventoIntegracion`, columnas `Paciente.referenciaCrm` y
> `Paciente.telefono`) **se retiró**: nunca se encendió y el emisor es el CRM.
> El worker solo hace la limpieza horaria. El CRM lee la cola publicada y
> vincula por PAC o, si no hay, por CI único. La plantilla
> de aviso vigente es `montalvo_informe_disponible`.
> Donde lo de abajo diga otra cosa, manda [docs/operacion.md](docs/operacion.md)
> y [docs/arquitectura.md](docs/arquitectura.md).

Actualizado: **21 de septiembre de 2026**, zona horaria `America/La_Paz`.

Este documento permite continuar desde otra máquina. Resume decisiones del usuario, implementación, despliegue, verificaciones y pendientes. **No contiene contraseñas, tokens, claves privadas ni datos de pacientes.** El estado de producción corresponde a la última verificación de esta sesión; antes de modificarla, comprobar su estado actual.

## 1. Leer primero

- El producto actual es **Resultados Montalvo**, un portal independiente para médicos y pacientes. Los médicos **no deben usar el CRM** para subir ecografías.
- El backend y el portal están implementados, publicados en GitHub y desplegados. No hay que empezar de cero ni crear otro backend vacío.
- Portal: **https://resultados.107.175.132.15.nip.io/**.
- Primer administrador: **Doctor**, `doctor@montalvo.com`. La contraseña inicial se entregó al propietario y está en un archivo privado indicado más adelante; no asumir que sigue vigente.
- Landing: **https://clinicamontalvo.vercel.app/**. Su pie de página tiene el enlace **Acceso para médicos** al portal independiente.
- **WhatsApp de resultados está desactivado** (`NOTIFICATIONS_ENABLED=false`). Publicar funciona; enviar avisos reales requiere configuración y aprobación pendientes. No se envió ningún WhatsApp real desde este proyecto.
- Producción usa PDFs privados **cifrados en el servidor**, con ClamAV. R2 tiene adaptador, pero no está configurado ni verificado en producción.
- El CRM conserva sus repositorios, datos, autenticación y procesos. No se instaló todavía un consumidor de eventos de resultados en el CRM.
- Hay cambios locales sin commit en ambos repositorios del CRM. Se detallan al final: **clonar GitHub no recupera esos cambios**.

## 2. Repositorios y ubicaciones

Todos usan la rama `main`. Las rutas siguientes corresponden a la Mac original; en otra máquina pueden cambiar.

| Proyecto | Repositorio | Último commit de código registrado |
| --- | --- | --- |
| Resultados: API y portal Next | https://github.com/velasquezren/backend-resultados-montalvo | `4a9833c170c1a5671cad4c580de66811232fe86e` |
| Landing institucional Next | https://github.com/velasquezren/landing-montalvo | `802f0ef` |
| Backend CRM | https://github.com/velasquezren/backend-crm-montalvo | `e2c707a`, más cambios locales |
| Frontend CRM Angular | https://github.com/velasquezren/frontend-crm-montalvo | `b6bca9e`, más cambios locales |

El commit que incorpora este documento es posterior al commit de código de resultados indicado arriba. Resultados y landing estaban limpios y sincronizados antes de guardar este contexto.

```text
/Users/macmini2024/Documents/CARPETA RENE/
├── landing montalvo/
│   ├── backend-resultados-montalvo/     ← API en raíz; portal Next en portal/
│   ├── landing-montalvo/               ← web institucional, otro repositorio
│   ├── Acceso inicial - Resultados Montalvo.txt       [PRIVADO]
│   └── Respaldo privado Resultados Montalvo/         [PRIVADO]
└── CRM/
    ├── backend-crm-montalvo/
    └── frontend-crm-montalvo/
```

Para continuar con resultados:

```sh
git clone https://github.com/velasquezren/backend-resultados-montalvo.git
cd backend-resultados-montalvo
```

Leer este documento, `README.md`, `docs/arquitectura.md`, `docs/api.md`, `docs/operacion.md`, `docs/verificacion.md` y `portal/README.md`. Leer también los `AGENTS.md` aplicables en la nueva ubicación. `docs/verificacion.md` contiene entradas históricas: algunos pendientes antiguos se resolvieron en entradas posteriores. El README del portal también conserva una advertencia anterior a la verificación HTTPS; consultar el estado actual descrito aquí y la evidencia posterior.

## 3. Qué pidió y decidió el usuario

El objetivo inmediato es que médicos de ecografía identifiquen al paciente mediante CI o PAC, carguen su PDF y publiquen el resultado para consulta privada del paciente. Debe ser sencillo, separado del CRM y preparado para crecer sin añadir módulos vacíos ni microservicios innecesarios.

El usuario autorizó usar R2 o almacenamiento del servidor. Se eligió almacenamiento local cifrado y privado. También autorizó publicar el repositorio y desplegar para comenzar a utilizar el portal.

Preservar la identidad visual existente: en Next, Montserrat, verde principal `#006156`, acento `#39ada3`, fondos claros, líneas discretas y radios contenidos. No reemplazar el branding por preferencias personales ni trasladar automáticamente los componentes Angular al portal Next.

Prioridad UX: claridad → facilidad de uso → confianza → velocidad → accesibilidad → consistencia → estética. Cada pantalla debe explicar dónde está la persona, qué puede hacer y el siguiente paso. Lenguaje humano, etiquetas persistentes, errores recuperables, estados vacíos útiles, buen uso con el pulgar, scroll y safe areas correctos. En móvil, los diálogos pueden ocupar toda la pantalla; en escritorio deben ajustarse al contenido sin grandes espacios vacíos.

La gran V2 de reservas, médicos, horarios, pagos y experiencia del paciente es **posterior**. No implementarla por inercia. Primero arquitectura, dominio, contratos y flujos; después componentes, estados, responsive, accesibilidad y pulido. Se documentó la auditoría en `docs/ux-audit-v2.md`; también existe una copia en la landing. No es una auditoría WCAG exhaustiva ni un estudio con pacientes reales.

Cada WhatsApp puede generar un costo. Exigir consentimiento, teléfono confirmado y autorización explícita para avisar; no enviar mensajes reales durante pruebas ni activar notificaciones históricas automáticamente.

## 4. Arquitectura implementada

- Backend modular Nest `12.0.4`, Prisma `7.10.0`, PostgreSQL exclusivo. Node requerido `>=22.12`; Node 24 recomendado para desarrollo/CI. Producción usa Node `22.23.1`.
- Portal independiente en `portal/`: Next `16.3.4`, React `19.2.8`, TypeScript estricto. API y portal comparten repositorio, no proceso ni sesiones con el CRM.
- El navegador habla con el proxy del portal Next; este llama a la API privada. Rutas y métodos permitidos explícitamente, comprobación de `Origin` en mutaciones y límites de cuerpo/subidas.
- Cookies médicas y del paciente `HttpOnly`, `SameSite=Strict`, `Secure` en HTTPS. No guardar tokens en `localStorage` ni exponer claves del backend mediante variables públicas Next.
- Base separada para usuarios, pacientes, informes, archivos privados, accesos, sesiones, auditoría, avisos/outbox, cuotas y eventos administrativos del CRM.
- Autenticación propia con contraseñas scrypt y tokens opacos almacenados mediante HMAC. Sesión médica de 8 horas; sesión de paciente de 15 minutos.
- Roles `ADMIN` y `MEDICO`. El médico consulta sus informes; el administrador todos y puede crear cuentas médicas.
- No hay reservas, pagos, agenda clínica ni tablas preparatorias vacías para esos dominios.

## 5. Flujo disponible y límites del dominio

1. Iniciar sesión con una cuenta individual.
2. Buscar paciente por CI o PAC exacto. Si no existe, registrar nombre y al menos uno de esos identificadores. Teléfono opcional salvo para avisos.
3. Crear un borrador con estudio y fecha. Se entrega una sola vez el enlace y un código de acceso; puede imprimirse el comprobante.
4. Adjuntar PDF de hasta 10 MB y 300 páginas. Se valida estructura, se rechazan archivos cifrados/contenido activo y se analiza con antivirus. Máximo dos subidas simultáneas por proceso.
5. Revisar identidad y documento; publicar. La API no interpreta el contenido médico ni acredita identidad civil: la revisión humana sigue siendo necesaria.
6. El paciente entra a `/resultados/<accessUUID>` con código independiente de su CI/PAC. El acceso dura 30 días; puede renovarse, revocando sesiones y código anteriores.
7. Un informe publicado es inmutable. Para corregirlo, retirar y crear uno nuevo. Retirar revoca el acceso y cancela avisos todavía pendientes; no puede retirar un WhatsApp ya enviado o en curso.

Estados de informe: `BORRADOR` → `PUBLICADO` → `RETIRADO`. Las operaciones sensibles comprueban `revision` para evitar sobrescrituras concurrentes. La descarga revalida permisos y estado después de leer el archivo.

Cambiar contraseña está implementado en el portal y en `POST /v1/auth/password`: exige contraseña actual, una nueva distinta de 12–128 caracteres y revoca todas las sesiones. No se fuerza todavía el cambio en el primer ingreso. No hay recuperación por correo, MFA ni envío automático de credenciales.

Otros límites actuales: sin edición de datos de paciente desde el portal, sin botón de reenvío manual de avisos fallidos, sin idempotencia de cliente al crear informes. Si se pierde la respuesta al crear, revisar la lista antes de repetir. El almacenamiento local corresponde a un único servidor; escalar a varias instancias requiere almacenamiento compartido/R2 y revisar límites globales. El análisis de PDF ocurre en la API con límites, sin benchmark de carga clínica realizado.

## 6. WhatsApp y conexión con el CRM

Estado real: **desactivado y sin worker productivo instalado**. El código del worker existe (`npm run worker`), pero no basta para afirmar que los pacientes reciben mensajes.

La plantilla vigente es `montalvo_informe_disponible` (idioma `es`, utilidad), y la envía el CRM. El transporte espera un botón URL dinámico de índice 0 con el identificador de acceso; no parámetros de cuerpo. No incluir PDF, diagnóstico, CI, PAC ni código secreto en el aviso.

Antes de activar: elegir la línea emisora, comprobar requisitos actuales de Meta, aprobación y contrato exacto de plantilla, configurar secretos, consentimiento y costos, probar con autorización y después habilitar el worker y `NOTIFICATIONS_ENABLED`. Tener tarjeta no acredita que todo esto esté listo.

Un aviso por informe; límite predeterminado de 100 intentos por día UTC, que **no representa un presupuesto monetario**. Reintentos solamente ante rechazos transitorios explícitos (`4`, `17`, `32`, `613`, `130429`), máximo tres intentos. Timeout o envío de resultado incierto queda `INCIERTO`, sin repetición automática. Rechazos permanentes, incluido `130497`, no se reintentan automáticamente. Webhook con firma, filtrado por línea y protección contra carreras/regresión de estados.

La integración futura con CRM usa `GET /v1/integraciones/crm/eventos?despues=...&limite=...` y un token exclusivo. Emite eventos mínimos `RESULTADO_PUBLICADO`/`RESULTADO_RETIRADO` con identificador de informe y referencia CRM, sin PDF ni datos de acceso. El consumidor debe guardar cursor y deduplicar por identificador. **No hay consumidor desplegado en el CRM ni tarjeta de resultados conectada allí.**

Contexto histórico del WhatsApp del CRM: recepción `+59175031306`, phone ID `1327334883795338`, WABA `1110803964711622`. Hubo rechazos `130497` al responder a `+55`. No asumir que agregar tarjeta o aprobar una plantilla resuelve ese rechazo; verificar el error vigente con documentación oficial y la cuenta. El estado actual de las plantillas y demás líneas no se volvió a consultar durante este cierre documental.

## 7. Producción: mapa operativo

Servidor `107.175.132.15`, Debian 12, Apache 2, PostgreSQL 16. Se usó SSH como `root` mediante una clave autorizada existente. Otra máquina necesitará acceso SSH autorizado; no copiar claves privadas a GitHub.

| Elemento | Ubicación o valor |
| --- | --- |
| Portal HTTPS | `https://resultados.107.175.132.15.nip.io/` |
| Directorio base | `/opt/montalvo-resultados` |
| Release desplegada | `/opt/montalvo-resultados/releases/20260921-portal-v1` |
| Enlace de release activa | `/opt/montalvo-resultados/current` |
| API | `resultados-api.service`, `127.0.0.1:3010`, usuario `resultados` |
| Portal | `resultados-portal.service`, `127.0.0.1:3011`, usuario `resultados-web` |
| Base / rol | `resultados_prod` / `resultados_app` |
| Variables API privadas | `/etc/montalvo-resultados/api.env` |
| Variables portal privadas | `/etc/montalvo-resultados/portal.env` |
| PDFs privados | `/var/lib/montalvo-resultados/files` |
| Apache | `/etc/apache2/sites-available/resultados.conf`, `resultados-ssl.conf` |
| Certificado | `/etc/letsencrypt/live/resultados.107.175.132.15.nip.io/` |
| Antivirus | `clamav-daemon`, `clamav-freshclam`, TCP `127.0.0.1:3310` |
| Copias | `resultados-backup.timer`, `resultados-backup.service` |

API y portal tienen límites de memoria de 512 MB cada uno y CPU de 100%, con endurecimiento systemd. La API escucha únicamente en loopback. Apache publica el portal, sobrescribe `X-Real-IP`, permite hasta 11 MB de cuerpo y evita registrar URLs/códigos/cookies en el log específico de acceso. El CRM sigue usando su proceso y puerto 3001; no reiniciarlo al actualizar resultados.

HTTPS Let's Encrypt con renovación por el temporizador existente de Certbot; certificado inicial con vencimiento 20/12/2026. El dominio nip.io es provisional. Para migrar a un subdominio propio, actualizar DNS/certificado/Apache y `PORTAL_ORIGIN`, `CORS_ORIGINS`, `PATIENT_PORTAL_URL`; conservar redirecciones para los enlaces ya entregados.

PDFs con `STORAGE_DRIVER=local-encrypted`, AES-256-GCM, nonce aleatorio, AAD vinculada al objeto y comprobación SHA-256 del contenido al descargar. La clave de cifrado es independiente de la clave de sesiones. El formato empieza por `MNTV1`; no cambiar ni regenerar la clave de archivos existentes.

ClamAV 1.4.3 con firmas descargadas. Debian usa activación por socket: se añadió `/etc/systemd/system/clamav-daemon.socket.d/resultados.conf` con `ListenStream=127.0.0.1:3310`, conservando el socket Unix. Cambiar únicamente `clamd.conf` no bastó. Límite de memoria 2 GB, CPU 75%, dos hilos. Se comprobó PONG y rechazo de la firma inocua EICAR.

En el primer despliegue hubo reinicios por permisos de lectura del código; se corrigieron en la release. No aplicar permisos abiertos a secretos ni PDFs. El contador histórico de 27 reinicios no significaba un fallo persistente después de corregirlo.

### Copias y secretos que NO viajan con Git

Copias cifradas mediante `/usr/local/sbin/montalvo-resultados-backup`, diariamente a las 03:15 del servidor más un retraso aleatorio de hasta 600 segundos. Destino `/root/backups-resultados/<fecha UTC>/`: `base.dump.enc`, `archivos.tar.enc`, `SHA256SUMS`. Clave de copia: `/etc/montalvo-resultados/backup.key`, solo root. Cifrado de copias con OpenSSL AES-256-CBC/PBKDF2; distinto del cifrado autenticado de PDFs.

Se verificó descifrado y lectura de índices con `pg_restore --list` y listado del tar. **No se hizo un simulacro completo de restauración**, ni se configuró copia externa recurrente o limpieza de retención. Última copia limpia registrada: `20260921T211211Z`, después de eliminar datos sintéticos de la prueba.

En la Mac original hay una copia privada adicional:

```text
/Users/macmini2024/Documents/CARPETA RENE/landing montalvo/
  Acceso inicial - Resultados Montalvo.txt
  Respaldo privado Resultados Montalvo/
    api.env
    backup.key
    20260921T211211Z/
      base.dump.enc
      archivos.tar.enc
      SHA256SUMS
```

Carpeta privada con permisos 0700, archivos 0600. El archivo inicial del servidor es `/root/resultados-acceso-inicial.txt` (0600). Estos archivos contienen secretos: transferirlos por un canal privado si se necesitan en la otra máquina. **Nunca añadirlos al repositorio ni pegar su contenido en este documento.** La copia del `api.env` incluye la clave necesaria para descifrar PDFs; respaldar solo los archivos cifrados sin esa clave no permite recuperarlos.

### Actualizaciones

Leer `ops/README.md`. Los scripts de infraestructura y `primer-despliegue.sh` son de instalación concreta; **no ejecutarlos ciegamente en el servidor ya instalado**, ni recrear administrador/base/claves.

Para actualizar: revisar estado y backup, preparar otra release, instalar desde lockfiles, compilar y verificar, evaluar migraciones y compatibilidad, cambiar `current` y reiniciar únicamente servicios de resultados. Mantener la release anterior para rollback de código; una migración de datos puede requerir su propia estrategia. El Dockerfile no describe el despliegue productivo real, que usa systemd.

Comprobaciones de lectura útiles desde una sesión SSH autorizada:

```sh
systemctl is-active resultados-api.service resultados-portal.service clamav-daemon
curl -fsS http://127.0.0.1:3010/health/ready
systemctl list-timers resultados-backup.timer
```

No imprimir archivos `.env` o contraseñas como parte de un diagnóstico rutinario.

## 8. Desarrollo y pruebas

Seguir los `.env.example` y README. Crear una base y usuario locales exclusivos; nunca reutilizar la base o credenciales del CRM ni copiar producción para pruebas.

Backend: `npm ci --ignore-scripts`, configurar `.env`, `npm run build`, `npm run migrate`, provisionar un administrador **local** mediante `npm run usuario` y arrancar `npm start`. El comando de usuario lee la contraseña por stdin; no ponerla como argumento o en historial.

Portal: entrar a `portal/`, `npm ci --ignore-scripts`, configurar `.env.local`, `npm run dev` o `npm run build` y `npm start`. `RESULTADOS_API_URL` apunta a la API privada y `PORTAL_ORIGIN` al origen del portal. `PATIENT_PORTAL_URL` en backend corresponde al origen del portal más `/resultados`.

Pruebas versionadas:

- Backend unitarias: `npm test`.
- Integración: preparar y migrar una base local desechable llamada **exactamente `resultados_test`**, definir `TEST_RESULTADOS_DATABASE_URL` y ejecutar `npm run test:integration`. **Estas pruebas truncan tablas. Nunca usar una base productiva.**
- Portal: `npm run build`; `node --experimental-strip-types --test test/policy.test.ts`.
- CI en `.github/workflows/ci.yml`: backend con PostgreSQL 16 aislado, build, migraciones y pruebas; portal con build y pruebas de políticas. No afirmar estado verde del último workflow sin consultarlo.

Evidencia de la entrega anterior al documento:

- Backend: 29 pruebas aprobadas, incluyendo cifrado, alteración/clave incorrecta, permisos, concurrencia y cambio de contraseña con revocación de sesiones.
- Portal: 3 pruebas de políticas aprobadas y compilación estricta satisfactoria. Compilación backend satisfactoria.
- Auditoría npm sin vulnerabilidades reportadas en ese momento; no es una garantía permanente.
- Chromium local en escritorio 1365×900 y móvil 390×844: login, paciente sintético, borrador, PDF, publicación, acceso de paciente, descarga idéntica y retirada. Sin errores JS ni desbordamiento horizontal en los recorridos comprobados; diálogo móvil de altura completa.
- Producción HTTPS: cookies seguras, bloqueo CSRF, subida por proxy, análisis ClamAV real, archivo cifrado sin contenido legible, descarga idéntica y revocación tras retirada. EICAR rechazado. Se eliminaron los pacientes/informes/archivos sintéticos al terminar.
- Se comprobaron salud de resultados y CRM, base accesible, portal HTTPS y enlace público de la landing.

Las pruebas de navegador fueron scripts temporales, no una suite E2E portable versionada. No equivalen a pruebas de carga ni aceptación con personal clínico. La instancia PostgreSQL temporal local en el puerto 55441 quedó detenida. `/tmp/resultados-*` y `/private/tmp/backend-resultados-montalvo` no son la fuente de código para continuar: usar el repositorio Git.

## 9. Pendientes priorizados

**Antes de ampliar uso clínico:** validar el recorrido con personal de la clínica, crear cuentas individuales, comprobar acceso del administrador y cambio de contraseña, acordar entrega separada del código, soporte y correcciones. Verificar salud, firmas antivirus y copia diaria actuales. Planificar copia externa recurrente, retención y prueba completa de restauración.

**WhatsApp:** completar aprobación/configuración de plantilla y línea, consentimiento/costos y prueba autorizada; luego activar worker. No presentar esta parte como terminada.

**Después:** dominio propio, consumidor mínimo de eventos en CRM si se necesita, recuperación segura de cuentas y mejoras de operación. Evaluar idempotencia de creación y pruebas E2E versionadas. R2 solo si aporta disponibilidad o crecimiento; requiere prueba real antes de cambiar almacenamiento.

**Más adelante:** V2 de reservas/agenda/pagos conforme a la auditoría y arquitectura acordadas. No mezclarla con la entrega inmediata de ecografías.

## 10. Contexto del CRM y trabajo local pendiente

Lo publicado anteriormente incluyó preservación de errores de WhatsApp y límites de reintentos (`e2c707a`), y modales adaptables/calendario vinculado al inbox (`b6bca9e`). Frontend conocido: https://crm-montalvo.vercel.app/. Existía copia previa del CRM en `/root/backups-crm/crm-20260921-140006.sql.gz`; no restaurarla automáticamente.

Al preparar este contexto se encontraron cambios adicionales **sin commit**, ajenos a la documentación de resultados. No se modificaron, probaron, publicaron ni desplegaron durante este cierre. El documento local `backend-crm-montalvo/docs/recepcion-atencion-compartida-2026-09-21.md` describe acceso compartido de recepción a conversaciones de sus líneas, incluso si otro agente respondió, y acceso a actividades propias. Indica que backend y frontend deben publicarse juntos, sin migración. Sus resultados de pruebas son reportados por ese documento, no verificados de nuevo aquí.

Backend CRM, archivos modificados:

```text
src/common/auth/roles.ts
src/modules/actividades/actividades.controller.ts
src/modules/actividades/actividades.service.ts
src/modules/conversaciones/acceso-conversacion.ts
src/modules/conversaciones/conversaciones.gateway.ts
src/modules/lineas-whatsapp/lineas-whatsapp.integracion.spec.ts
src/modules/lineas-whatsapp/lineas-whatsapp.service.ts
```

Archivo nuevo sin seguimiento:

```text
docs/recepcion-atencion-compartida-2026-09-21.md
```

Frontend CRM, archivos modificados:

```text
src/app/app.routes.ts
src/app/core/auth/preload-por-rol.strategy.spec.ts
src/app/features/actividades/actividades.page.html
src/app/features/actividades/actividades.service.ts
src/app/features/actividades/components/selector-cliente-express/selector-cliente-express.component.html
src/app/features/actividades/components/selector-cliente-express/selector-cliente-express.component.spec.ts
src/app/features/actividades/components/selector-cliente-express/selector-cliente-express.component.ts
src/app/features/conversaciones/components/conversacion-sidebar/conversacion-sidebar.component.html
src/app/shared/components/layout/layout.component.html
src/app/shared/components/layout/nav-items.ts
src/app/shared/components/layout/navegacion-shell.spec.ts
```

**Este Markdown no contiene esos cambios de código.** Antes de abandonar la Mac original, preservarlos mediante revisión y commit en su repositorio correspondiente, o copia privada del trabajo. No hacer `reset`, `clean`, reemplazar carpetas ni dar por hecho que están en GitHub. Un parche de `git diff` por sí solo no incluye el documento nuevo sin seguimiento.

## 11. Instrucción para la siguiente sesión

> Lee CONTEXTO_CONTINUIDAD.md y los documentos enlazados antes de actuar. Continúa Resultados Montalvo desde el repositorio existente: API y portal Next están desplegados, los médicos no usan el CRM y WhatsApp sigue desactivado. Comprueba estado actual antes de cambiar producción. Conserva branding y límites entre sistemas. No reejecutes bootstrap ni regeneres claves. No publiques secretos ni envíes avisos reales sin autorización. La V2 de reservas es posterior. Revisa también los cambios locales pendientes del CRM si fueron transferidos a esta máquina.
