# Portal de resultados Montalvo

Aplicación Next independiente: médicos en `/`; pacientes en `/resultados/:id`. Comparte colores, Montserrat e isotipo con la web institucional, sin agregar menús al CRM ni modificar la landing.

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

El botón de imprimir genera un comprobante de acceso. El código solo se muestra al crear/renovar; no es recuperable luego. Renovar y retirar explican sus consecuencias en un diálogo de pantalla completa en móvil.

El administrador puede crear cuentas médicas; no existe recuperación por email ni envío automático de credenciales. No usar cuentas compartidas. Los avisos no se habilitan automáticamente al arrancar el portal.

## Comprobaciones

- `npm run build`: compilación y tipos estrictos.
- `node --experimental-strip-types --test test/policy.test.ts`: métodos/rutas y comprobación de Origin del proxy.
- GitHub Actions comprueba backend/PostgreSQL y compilación del portal en cada push/PR.

Las pruebas de navegador de esta entrega usan solo pacientes/PDF sintéticos. Falta validar proveedores reales, HTTPS/dominio productivo y el flujo operativo con personal de la clínica antes de cargar documentos reales.
