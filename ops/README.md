# Operación del servidor de resultados

Estos archivos documentan el bootstrap de esta instalación concreta; no ejecutarlos nuevamente sobre una instalación existente. `primer-despliegue.sh` crea usuario/base, claves y administrador una sola vez y se detiene si encuentra configuración previa. No es un actualizador idempotente.

Orden: infraestructura → socket local ClamAV (Debian usa activación por systemd) → compilar/desplegar una versión comprobada → esperar `/health/ready` y respuesta antivirus PONG → verificar carga/consulta/retiro de un PDF sintético → copia cifrada.

Los servicios son `resultados-api`, `resultados-portal` y `resultados-backup.timer`. Las variables privadas viven en `/etc/montalvo-resultados/`, fuera del código. El portal y la API usan cuentas Linux diferentes; ambos escuchan en loopback. Apache publica solo el portal por HTTPS. No sustituir las configuraciones del CRM.

Para actualizar: preparar una nueva carpeta en `releases`, instalar con lockfiles, compilar, aplicar migraciones compatibles y verificar permisos de lectura antes de cambiar `current` y reiniciar solo los servicios de resultados. Conservar la versión anterior para volver atrás. No regenerar claves ni volver a crear al administrador.

Las copias son diarias, cifradas y locales al VPS; el cifrado de los PDF no sustituye las copias. Mantener una copia externa y las claves fuera del servidor. Revisar espacio y antigüedad; este bootstrap no borra automáticamente copias ni informes clínicos.

El dominio `resultados.107.175.132.15.nip.io` es una dirección inicial con TLS. Al adoptar un subdominio propio, actualizar certificado, Apache, PORTAL_ORIGIN, CORS_ORIGINS y PATIENT_PORTAL_URL, preservando redirecciones de los enlaces entregados a pacientes.
