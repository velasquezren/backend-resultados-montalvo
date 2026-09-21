# Verificación de entrega

21 de septiembre de 2026. Código verificado en entorno local aislado, sin acceso a datos del CRM.

- Compilación TypeScript estricta y generación Prisma: correctas.
- Dos migraciones aplicadas en PostgreSQL temporal con zona de servidor `America/La_Paz`.
- 27 pruebas aprobadas: 5 unitarias y 22 de integración HTTP/PostgreSQL.
- `npm audit`: 0 vulnerabilidades reportadas al comprobar el lockfile de esta entrega. Es una comprobación puntual del registro, no una garantía de ausencia de defectos.
- No hubo envíos reales ni llamadas al transporte Meta durante las pruebas: se sustituyó por una implementación simulada antes de iniciar la API de prueba.

Cobertura relevante: aislamiento entre médicos; tokens de paciente incompatibles con permisos médicos; validación y exclusión de contenido activo PDF; CI/PAC únicos; cargas/publicaciones simultáneas; un aviso por informe; consentimiento y teléfono confirmados; retiro, expiración y renovación de accesos; aviso posterior; worker concurrente; error permanente; máximo de reintentos; cuota diaria; timeout sin reenvío; firma de webhook y eventos fuera de orden; credencial CRM limitada a eventos; revocación de cuentas.

La prueba de worker detectó una comparación dependiente de la zona horaria de PostgreSQL; quedó corregida con comparación explícita UTC y verificada en el mismo entorno boliviano.

Pendientes de entorno real: R2, ClamAV, entrega Meta, plantilla aprobada, despliegue productivo de Next, consumidor CRM, Docker, backups/restauración, pruebas móviles con pacientes y dimensionamiento bajo carga. No se presenta ninguno de ellos como probado o desplegado.


## Portal independiente — comprobación adicional

Portal Next en `portal/`, compilación de producción correcta y TypeScript estricto sin variables/imports sin uso. Tres pruebas del proxy aprobadas (allowlist de rutas/métodos y validación de Origin). `npm audit` del portal reportó cero vulnerabilidades en esta comprobación.

Prueba de navegador local (Chromium, escritorio 1365×900 y móvil 390×844): iniciar sesión de administrador sintético, buscar CI inexistente, registrar paciente sintético, crear borrador, adjuntar PDF sintético, revisar/publicar, abrir enlace como paciente, descargar bytes idénticos y retirar con revocación efectiva. Sin errores de JavaScript del navegador. Verificado: cookie HttpOnly/SameSite Strict, token no disponible en `document.cookie`, localStorage vacío, CSRF rechazado, eventos CRM fuera del proxy, sesión del paciente sin acceso médico, ausencia de overflow horizontal y diálogo móvil de altura completa.

Las pruebas de navegador se ejecutaron localmente contra HTTP/PostgreSQL reales; los proveedores clínicos externos y el despliegue HTTPS siguen pendientes. GitHub Actions incluye las 27 pruebas backend y las 3 de política del portal, además de las compilaciones; no incluye automáticamente el recorrido de navegador descrito arriba.


## Preparación de despliegue: almacenamiento y cuentas

29 pruebas backend aprobadas (27 previas + cifrado autenticado + cambio de contraseña con revocación). Compilación backend y portal correctas. Recorrido de navegador repetido en escritorio/móvil con datos sintéticos antes de desplegar. ClamAV, TLS y comprobaciones en servidor se registrarán por separado al completar la puesta en marcha.


## Puesta en marcha comprobada

Portal público: https://resultados.107.175.132.15.nip.io/. Verificación HTTPS desde el servidor y desde fuera. Cuenta inicial `doctor@montalvo.com` con rol ADMIN. PDF sintético cargado a través del proxy público, examinado por ClamAV real, cifrado en disco (cabecera MNTV1), publicado y descargado con bytes idénticos. Retiro revocó acceso; datos/archivo sintéticos se eliminaron al terminar. Patrón EICAR de prueba rechazado por el antivirus. Cookies HttpOnly/Secure y CSRF comprobados. WhatsApp sigue desactivado.

ClamAV usa activación por socket de systemd en Debian: se añadió un listener exclusivamente 127.0.0.1:3310. API y Next también escuchan solo en loopback; Apache publica el portal con certificado válido. El servidor mantiene activo el CRM original.

Copias diarias cifradas configuradas; verificación de contenedores con pg_restore --list y tar. Esto no sustituye un ensayo completo de recuperación ni una copia externa recurrente. Las claves y la contraseña inicial no forman parte del repositorio.
