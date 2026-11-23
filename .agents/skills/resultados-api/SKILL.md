---
name: resultados-api
description: Implementar, verificar o desplegar cambios en la API NestJS, Prisma, PostgreSQL, PDFs privados, autenticación, worker o dependencias de Resultados Montalvo. Úsalo antes de tocar src/, prisma/, package.json o un release del VPS.
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

Revisa el contrato HTTP, las rutas del portal que lo consumen y la documentación del flujo. Usa datos sintéticos en comprobaciones. La integración requiere exclusivamente la base local descartable `resultados_test`.

### Comprobaciones (todas deben quedar en verde)

| Área tocada | Comando |
|---|---|
| API (siempre) | `npm test` (compila y corre las unitarias) |
| Persistencia, permisos, archivos, concurrencia | aplicar migraciones a la base de prueba y luego la integración (abajo) |
| Portal | `cd portal && node --experimental-strip-types --test test/*.test.ts && npm run typecheck && npm run build` |
| Dependencias | `npm audit --omit=dev` en la raíz y en `portal/`; el único aviso aceptado es `effect` vía la CLI de Prisma |

```sh
RESULTADOS_DATABASE_URL=<url local de resultados_test> npx prisma migrate deploy
TEST_RESULTADOS_DATABASE_URL=<url local de resultados_test> npm run test:integration
```

Sin el `migrate deploy` previo la integración falla con `relation "Sesion" does not exist`: la suite vacía las tablas, no las crea.

### Dependencias

Versiones fijadas (sin `^`). El portal es público: un aviso de seguridad de Next.js o de `sharp` se trata como urgente y se despliega, no se acumula. Actualizar dentro de la misma mayor con `npm install --save-exact`, nunca a una versión candidata, y pasar todas las comprobaciones. Tras `npm audit fix --omit=dev` ejecutar `npm ci`: ese comando poda las dependencias de desarrollo de `node_modules` y el siguiente build falla por tipos ausentes.

### Desplegar (solo con petición explícita)

Producción atiende pacientes y no hay staging. El procedimiento vigente está en `ops/README.md` y `CONTEXTO_CONTINUIDAD.md`; en resumen:

1. Release nuevo en `/opt/montalvo-resultados/releases/<fecha>-<tema>-<sha>`, desde el commit ya verificado en `main`.
2. `npm ci` en la raíz y en `portal/`; `npm run build`; el portal con `npm run build -- --webpack` como `resultados-web`.
3. Respaldo y guion `revertir.sh` antes de tocar nada; migraciones compatibles con el release anterior.
4. Cambiar `current` y reiniciar **solo** `resultados-api`, `resultados-worker` y `resultados-portal`.
5. Verificar `/health/ready`, el portal público y un flujo sintético; registrar el despliegue arriba en la bitácora de `CONTEXTO_CONTINUIDAD.md`.

No reejecutar `ops/primer-despliegue.sh`, no regenerar claves ni recrear el administrador, y no tocar la configuración del CRM que comparte el VPS.
