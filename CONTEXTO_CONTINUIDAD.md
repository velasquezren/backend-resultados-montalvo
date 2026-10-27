# Contexto de continuidad — Resultados Montalvo

Para retomar desde otra máquina. **Lo vigente es la primera sección**; la
bitácora de debajo registra qué se hizo en cada fecha y no son instrucciones.
El documento original del 21/09 está en
[docs/historial/contexto-2026-09-21.md](docs/historial/contexto-2026-09-21.md):
describe la primera instalación y casi todo su estado operativo ya cambió.
Sin contraseñas, tokens, claves ni datos de pacientes. Antes de tocar producción,
comprobar su estado: esto es una foto, no una garantía.

## Estado vigente (comprobado en el servidor el 27/10/2026)

- **Qué es:** portal independiente para médicos y pacientes. API NestJS 12 y
  portal Next 16 en este repositorio; base propia `resultados_prod`. No comparte
  base, usuarios ni sesiones con el CRM. Los médicos no usan el CRM.
- **En producción:** release `/opt/montalvo-resultados/releases/20261025-multitipo-4cb6ada`
  (`current`), servicios `resultados-api` (:3010), `resultados-worker` (limpieza
  horaria) y `resultados-portal` (:3011), Node 22.23.1, ClamAV y
  `STORAGE_DRIVER=local-encrypted` (PDF cifrados `MNTV1`/`MNTV2`). Portal en
  `https://resultados.107.175.132.15.nip.io/`; certificado hasta el 20/12/2026
  con renovación de Certbot. Releases conservados para revertir: `20261013`
  (API) y `20261016` (su portal); `revertir.sh` en
  `/root/backup-resultados-20261025-203601-multitipo/`.
- **Datos:** 241 informes publicados y 3 retirados; un administrador y una
  cuenta médica. Tipos `ECOGRAFIA`, `PAPANICOLAU`, `LABORATORIO`, `OTRO`
  (hoy todos los informes son ecografías).
- **Aviso al paciente:** lo envía **el CRM**, no este proyecto, con la plantilla
  aprobada `montalvo_informe_disponible` (botón con el enlace; el enlace es la
  llave, sin código). Este proyecto ya no tiene transporte de WhatsApp.
  `CRM_AUTOSERVICIO_INFORMES=on`: el CRM ofrece «Mis informes» en Prueba y Recepción.
- **FileMaker:** el guion de ecografía está en uso ([filemaker.md](docs/filemaker.md)).
  Papanicolau tiene guion preparado y no ejecutado ([filemaker-papanicolau.md](docs/filemaker-papanicolau.md));
  laboratorio espera las capturas de René. Contrato en [api.md](docs/api.md).
- **Respaldos:** copia local cifrada diaria (`resultados-backup.timer`, 03:15,
  retiene 7 días en `/root/backups-resultados`) y respaldo externo nocturno en
  `gs://crm-clinica-montalvo-respaldos` (volcado cifrado con age, PDF
  incrementales; ver `respaldo-externo.sh` y §4 de la guía de infraestructura
  del CRM). Restauración externa probada el 26/10.
- **Pendiente:** guiones de FileMaker de Papanicolau y laboratorio; dominio
  propio en vez de `nip.io` (exige editar la plantilla de Meta y conservar los
  enlaces entregados); validar el recorrido con personal de la clínica.

Cómo actualizar: [ops/README.md](ops/README.md) y [docs/operacion.md](docs/operacion.md)
(release nuevo, lockfiles, build, migración compatible, cambiar `current`,
reiniciar solo los servicios de Resultados). No reejecutar el bootstrap ni
regenerar claves. El portal se compila con `npm run build -- --webpack` como
`resultados-web`.

## Bitácora (más reciente arriba)

> **25/10/2026, 20:39 La Paz — informes multítipo DESPLEGADOS (`4cb6ada`).**
> Release `/opt/montalvo-resultados/releases/20261025-multitipo-4cb6ada` con API,
> worker y portal propios (portal compilado con `--webpack` como `resultados-web`;
> `20-pdf-cache.conf` apunta a su `.next/cache`). Migración
> `20261023120000_tipos_informe_referencia` aplicada: 227 informes, todos
> ECOGRAFIA, referencias sin duplicados. Respaldo y reversión en
> `/root/backup-resultados-20261025-203601-multitipo/` (`revertir.sh` vuelve al
> release del 13/10; la migración es compatible con él). En el VPS: 22 unitarias,
> 21 del portal y builds aprobados; `/health/ready` 200, panorama y listado
> filtran por `tipo` y un tipo desconocido da 400; HTTPS del portal 200. Luego se
> desplegaron CRM `d22ef19` y Angular `7893a4e`. Los guiones de Papanicolau y
> laboratorio en FileMaker siguen pendientes. El mismo día se borraron 23
> releases antiguos (~19 GB); quedan `20261025` (actual), `20261013` (reversión)
> y `20261016` (portal de esa reversión). El 26/10: respaldo externo nocturno en
> `gs://crm-clinica-montalvo-respaldos` y copias locales `/root/backups-resultados`
> con retención de 7 días. El `revertir.sh` del 16/10 quedó obsoleto
> (apuntaba a un release borrado); usar el del 25/10.

> **24/10/2026 — continuación de informes multítipo** (preparación; se desplegó el 25/10, entrada de arriba). El trabajo
> de API/portal Resultados, backend CRM y Angular se conserva en la rama
> `feat/informes-multitipo` de los tres repositorios, basada en sus respectivos
> `main` actualizados. No confundir tener el código en GitHub con producción.
> Incluye filtros ECOGRAFIA/PAPANICOLAU/LABORATORIO/OTRO, referencias por tipo,
> comprobación de identidad y mejoras de la cola. Contrato y orden de despliegue
> en [API](docs/api.md#tipos-clínicos-y-filemaker).
>
> El [guion completo de Papanicolau](docs/filemaker-papanicolau.md) se prepara en
> **generar pdf 2**, sin cambiar Toggle. Falta confirmar el PAC contenido en
> `rkey pac`, la fecha y la cuenta médica; no se ejecutó en FileMaker. Usa la
> referencia estable `PAP:pkey`. René continuará con laboratorio y proporcionará
> sus capturas: no inventar campos ni reutilizar este mapeo automáticamente.
> Token PDF, secretos y capturas clínicas no viajan con Git.
>
> Validación local del 23/10: 187 pruebas y builds de las cuatro aplicaciones
> aprobados. Base de pruebas aislada, sin PDFs de pacientes. Migración
> `20261023120000_tipos_informe_referencia` pendiente en producción. Publicar
> primero API Resultados y CRM backend; luego los frontends. Un push a `main`
> de Angular activa Vercel: mantener esta rama hasta coordinar ese orden.


> **16/10/2026 — corrección de apertura de PDFs DESPLEGADA (`caa9a28`).** La
> captura Android muestra el 401 del proxy por falta de cookie, no evidencia de
> PDF corrupto. Los botones publicados apuntaban a rutas genéricas sin renovar
> la sesión de 15 minutos. El portal ahora vincula cada apertura al acceso del
> informe e intercambia el enlace por una sesión solo en servidor. Mantiene la
> API, permisos, plazos y PDFs existentes; errores legibles en vez de JSON.
> Ver `portal/README.md` y `docs/api.md`. Portal activo:
> `/opt/montalvo-resultados/releases/20261016-pdf-sesion-caa9a28/portal`, enlazado
> desde `current/portal`. La API y el worker conservan su release del 13/10.
> Reiniciado solamente `resultados-portal`; su caché escribible está declarada
> en `resultados-portal.service.d/20-pdf-cache.conf`. Versión anterior conservada;
> reversión: `/root/backup-resultados-portal-20261016-caa9a28/revertir.sh`.
> Validación: 21 pruebas del portal aprobadas y `next build --webpack` correcto;
> HTTP contra Next compilado + API sintética confirma PDF inline/original sin
> cookies, bloqueo 401 con ayuda HTML, HEAD/POST 405 y exclusión del PDF en
> robots. No se usaron informes reales ni se probó un dispositivo Android físico.
> En VPS: 21 pruebas y build aprobados. HTTPS confirma ayuda HTML 401 para un
> acceso sintético inexistente, cabeceras privadas, y JS con los nuevos botones.
> API/base saludables; portal, API, worker y CRM activos. Sin cambios de base,
> credenciales o archivos clínicos; los enlaces de WhatsApp existentes se conservan.

> **13/10/2026, 13:48 La Paz — autoconsulta DESPLEGADA:** API `1604ded` en
> `/opt/montalvo-resultados/releases/20261013-informes-whatsapp-1604ded`,
> `CRM_AUTOSERVICIO_INFORMES=on`. CRM `ed7f204` habilita exclusivamente Prueba y
> Recepción. El menú general de Recepción sigue apagado: se solicita por texto.
> Teléfono vinculado a PAC → selección explícita del PDF; sin PAC → pide número
> de carnet y revisión humana, sin autorizar por CI aislado. Respaldo verificado
> `/root/backup-informes-20261013-174423-resultados.sql.gz` y configuración
> `-resultados.env`; release anterior conservado. El subdirectorio `portal` del
> release nuevo enlaza al portal anterior, sin recompilarlo ni cambiarlo.
> Siete migraciones al día; 22 unitarias y 54 integraciones sintéticas aprobadas.
> Health/DB y consulta privada desde CRM verificados; no hubo envíos reales de
> prueba a Meta. Estado detallado en `backend-crm-montalvo/docs/ESTADO_ACTUAL.md`.
> Esta entrada sustituye el estado local/apagado de la implementación inicial.


> **13/10/2026 — cambios locales, SIN despliegue:** autoconsulta de informes
> por WhatsApp desde el CRM. Dos rutas privadas nuevas, apagadas mediante
> `CRM_AUTOSERVICIO_INFORMES=off`. El paciente puede elegir su PDF; la IA no lo
> recibe. No hay migración propia. Contrato y límites en `docs/api.md` y
> `docs/arquitectura.md`; recorrido y activación por línea en
> `backend-crm-montalvo/docs/informes-por-whatsapp.md` del workspace hermano.
> Los estados de despliegue anteriores no incluyen esta preparación.

> **Actualización 3 de octubre de 2026.** El médico suma videos e imágenes al
> informe (también ya publicado) y el paciente los ve, guarda y comparte desde
> su enlace. Tabla `Adjunto`, cifrado por trozos `MNTV2`, ClamAV y Apache con
> límites de 110 MB. Detalle en [arquitectura](docs/arquitectura.md#videos-e-imágenes-del-informe)
> y [operación](docs/operacion.md#videos-e-imágenes). Retención de las copias
> locales: 7 días desde el 26/10 (ver la entrada del 25/10 arriba).

> **Actualización 23 de septiembre de 2026** (corregía el documento original del 21/09).
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

> **Actualización 22 de septiembre de 2026** (corregía el documento original del 21/09).
> El camino de avisos por WhatsApp de este proyecto (transporte Meta, webhook
> `/webhooks/whatsapp`, consentimiento al publicar, tablas `Aviso`,
> `CuotaAvisos` y `EventoIntegracion`, columnas `Paciente.referenciaCrm` y
> `Paciente.telefono`) **se retiró**: nunca se encendió y el emisor es el CRM.
> El worker solo hace la limpieza horaria. El CRM lee la cola publicada y
> vincula por PAC o, si no hay, por CI único. La plantilla
> de aviso vigente es `montalvo_informe_disponible`.
> Donde el original diga otra cosa, mandan [docs/operacion.md](docs/operacion.md)
> y [docs/arquitectura.md](docs/arquitectura.md).
