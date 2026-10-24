# Portal de resultados Montalvo

Aplicación Next independiente: médicos en `/`; pacientes en `/resultados/:id`. Comparte colores, Montserrat e isotipo con la web institucional, sin agregar menús al CRM ni modificar la landing.

Para modificar el portal desde otra máquina, usa Node `22.23.2` (`.nvmrc`) y consulta las instrucciones del repositorio en `../AGENTS.md`. El skill de React/Next vive en `../.agents/skills/react-best-practices/`; la documentación de Next que corresponde a la versión instalada se encuentra en `node_modules/next/dist/docs/` después de `npm ci`.

## Arranque

1. Ejecutar y configurar primero la API del directorio superior.
2. Desde `portal/`, ejecutar `npm ci --ignore-scripts`.
3. Copiar `.env.example` a `.env.local` y definir `RESULTADOS_API_URL` y `PORTAL_ORIGIN`.
4. `npm run build` y `npm start`, o `npm run dev` durante desarrollo.
5. Abrir `http://localhost:3011`. La cuenta inicial se crea con el comando `npm run usuario` del backend; el administrador puede crear cuentas médicas desde el portal.

Mantener `PATIENT_PORTAL_URL` del backend igual a `PORTAL_ORIGIN` + `/resultados`. No incluir las variables de backend, R2 o Meta en el navegador. El proxy Next usa cookies HttpOnly/SameSite=Strict y Secure cuando el origen es HTTPS, valida Origin en las mutaciones, limita el tamaño del cuerpo y expone solo rutas permitidas.

El proceso escucha únicamente en 127.0.0.1. En producción colocarlo detrás de HTTPS, con el proxy inverso sobrescribiendo `X-Real-IP` con la IP del cliente, nunca pasando un valor arbitrario recibido. Esto permite que los límites por IP del backend sigan distinguiendo usuarios. La API debe quedar en red privada/loopback y protegida por firewall.

## Uso

Buscar paciente por CI/PAC exacto → confirmar identidad → crear borrador → adjuntar PDF → descargar y revisar → publicar. El borrador se conserva en servidor. Antes de publicar, se puede reemplazar el archivo. El paciente recibe un comprobante con código y enlace; WhatsApp, cuando esté configurado, solo envía el enlace.

El informe muestra el enlace del paciente y su vencimiento; no hay código ni comprobante que entregar: el enlace lo envía recepción por WhatsApp y abre el informe directamente. Renovar y retirar explican sus consecuencias en un diálogo de pantalla completa en móvil.

El administrador puede crear cuentas médicas; no existe recuperación por email ni envío automático de credenciales. No usar cuentas compartidas. El portal no envía WhatsApp: al publicar, el informe aparece en la cola de recepción del CRM, que es quien avisa al paciente.

## Comprobaciones

- `npm run build`: compilación y tipos estrictos.
- `node --experimental-strip-types --test test/*.test.ts`: políticas del proxy y apertura/descarga de PDF contra una API HTTP sintética (sin datos clínicos).

Los botones del paciente abren `/resultados/:accesoId/pdf` (vista liviana) y
`?original=1` (descarga original). El servidor intercambia el enlace por una
sesión de ese informe en cada petición: no depende de que el visor móvil reciba
la cookie de la pestaña ni de que siga vigente la sesión inicial de 15 minutos.
No prolonga la vigencia del enlace ni permite informes retirados. Los fallos
muestran una página de ayuda y regreso al informe, nunca JSON como descarga.
No enviar a pacientes la antigua ruta genérica `/api/v1/portal/informe/pdf`:
depende de una cookie y no identifica un informe. Compartir solo el enlace del
portal que genera el sistema. No registrar URLs completas de resultados.
- GitHub Actions comprueba backend/PostgreSQL y compilación del portal en cada push/PR.

Las pruebas de navegador de esta entrega usan solo pacientes/PDF sintéticos. Falta validar proveedores reales, HTTPS/dominio productivo y el flujo operativo con personal de la clínica antes de cargar documentos reales.

## Preparación multítipo (23/10/2026, sin despliegue)

El médico selecciona Ecografía, Papanicolau, Laboratorio u Otro estudio al crear
el borrador; la lista filtra por tipo y estado y busca por paciente, PAC, CI o
estudio. El tipo acompaña al informe y su vista del paciente. Una consulta fallida
muestra error y reintento en vez de una lista vacía. El refresco comparte el mismo
ciclo de carga y descarta respuestas de filtros anteriores. La búsqueda exacta
permite elegir PAC o CI cuando el identificador resulta ambiguo.

Requiere la API multítipo y su migración antes de publicar este portal. No cambia
el acceso al PDF ni habilita envíos, IA o automatizaciones de WhatsApp.
