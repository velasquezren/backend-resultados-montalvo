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
