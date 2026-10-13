---
name: resultados-api
description: Implementar o revisar cambios en la API NestJS, Prisma, PostgreSQL, PDFs privados, autenticación o worker de Resultados Montalvo.
---

# API de Resultados Montalvo

Lee `docs/arquitectura.md` y el contrato pertinente de `docs/api.md` antes de modificar un flujo. Para despliegue o recuperación lee `docs/operacion.md` y `CONTEXTO_CONTINUIDAD.md`.

## Límites que determinan el diseño

- Este servicio posee sus cuentas, sesiones, pacientes, informes y archivos. El CRM solo consulta la cola y envía WhatsApp; no compartas tablas, sesiones ni lógica de autorización entre servicios.
- Mantén el dominio en los servicios existentes bajo `src/`. No añadas capas genéricas ni módulos vacíos por anticipación. El controlador traduce HTTP y delega las reglas del dominio.
- Autoriza cada operación en el servidor según el actor: médico, paciente o integración CRM. El enlace del paciente es una credencial de acceso; evita exponerlo en logs, analítica o referencias externas.
- Conserva la búsqueda exacta por CI/PAC y la unicidad. No fusiones pacientes por parecido de nombres. Usa `revision` y responde 409 ante escrituras desactualizadas; publicación y auditoría deben conservar su atomicidad.
- Guarda PDFs en almacenamiento privado y sirve sus bytes solo después de verificar sesión, estado e integridad. Conserva el historial clínico y la revocación de acceso al retirar.
- Si cambias `prisma/schema.prisma`, incluye la migración correspondiente y revisa su SQL. No apliques migraciones a producción durante desarrollo local.

## Para entregar un cambio

Revisa el contrato HTTP, las rutas del portal que lo consumen y la documentación del flujo. Usa datos sintéticos en comprobaciones. Ejecuta `npm run build` para cambios de API y las pruebas pertinentes descritas en `README.md`; la integración requiere exclusivamente la base local descartable `resultados_test`.
