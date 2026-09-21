# Auditoría UX V2 — Clínica Montalvo

Fecha: 21 de septiembre de 2026. Primera etapa: auditoría de código, propuesta y prioridades. **No rediseño implementado ni prueba con pacientes.** Prioridad inmediata: entrega de ecografías; reservas y pagos son una fase posterior.

## Alcance y evidencia

Revisión del frontend Next existente `landing-montalvo`: `PROJECT_CONTEXT.md`, `app/globals.css`, `content/site.ts`, `lib/links.ts`, `components/ui/button.tsx`, `components/layout/MobileNav.tsx` y rutas institucionales. Se distingue lo observado en código de lo que requiere medición en dispositivos o validación con usuarios. No hay métricas de conversión, tiempos medidos, auditoría visual exhaustiva ni certificación de accesibilidad.

Identidad que debe preservarse: Montserrat, verde principal `#006156`, acento `#39ada3`, fondos blancos/wash, líneas sutiles, radios pequeños y animación discreta. El propio CSS advierte que el acento no sirve para texto pequeño sobre blanco. No trasladar automáticamente fuentes o componentes Angular del CRM a Next.

## Journey actual

```text
Google / enlace → Inicio → Servicios / Especialidades / información
                         → Reservar cita → URL externa configurada o WhatsApp
                         → Atención al paciente → teléfono / WhatsApp
```

Evidencia: `lib/links.ts` deriva a WhatsApp cuando no hay URL válida; `content/site.ts` tiene el marcador de reserva y la dirección exacta vacía. `app/staff-medico/page.tsx` contiene `PagePlaceholder`. No hay flujo interno de reserva, formulario de datos clínicos, agenda disponible, pago ni consulta de resultados en las rutas revisadas. La web informa y deriva al equipo; no debe presentar ese recorrido como una cita ya confirmada.

La ruta `/staff-medico` es un directorio público propuesto, **no** el acceso de los médicos. Deben diferenciarse por nombre y navegación.

## Journey propuesto inmediato

### Médico

```text
Acceso de médicos → Mis informes → Nuevo informe
→ Buscar paciente por CI o PAC
→ Confirmar nombre e identificador / registrar si no existe
→ Estudio y fecha → Adjuntar PDF
→ Revisar paciente + PDF + teléfono si se notificará
→ Publicar [sin aviso / autorizar aviso de WhatsApp]
→ Informe publicado + estado separado del aviso
```

La búsqueda usa una sola elección CI/PAC; no dos campos obligatorios. El nombre y el identificador visibles acompañan la revisión del PDF. No preseleccionar consentimiento, teléfono confirmado ni envío con costo. Entregar enlace y código de consulta al paciente en clínica; la operación debe tener responsable y momento definidos.

### Paciente

```text
Aviso discreto o comprobante entregado en clínica
→ Abrir “Mis resultados” → Introducir código
→ Identificar estudio y fecha → Descargar PDF
→ Ayuda de la clínica / Cerrar consulta
```

No crear una cuenta obligatoria ni pedir CI nuevamente para abrir un informe. No revelar nombre, estudio ni datos clínicos antes de validar el código. Un enlace vencido debe explicar cómo solicitar uno nuevo. El código se entrega por una vía separada del aviso; si la clínica no puede sostener esa entrega, validar otro mecanismo antes de producción, sin sustituirlo por CI/PAC como contraseña.

## Mapa de vistas y siguiente acción

| Vista propuesta | ¿Dónde estoy? | ¿Qué puedo hacer? | Siguiente acción principal |
| --- | --- | --- | --- |
| Acceso médico | Portal de médicos | Ingresar con mi cuenta | Ingresar |
| Mis informes | Informes a mi cargo | Retomar o crear | Nuevo informe |
| Identificar paciente | Nuevo informe, paso 1 | Buscar o registrar | Confirmar paciente |
| Adjuntar resultado | Informe del paciente confirmado | Elegir PDF y fecha | Revisar informe |
| Revisión | Antes de publicar | Ver PDF, verificar identidad y aviso | Publicar informe |
| Informe publicado | Resultado disponible | Revisar estado, obtener enlace, retirar | Ver informe |
| Acceso paciente | Resultados de la clínica | Introducir código entregado | Consultar resultado |
| Resultado paciente | Mi estudio | Descargar y obtener ayuda | Descargar PDF |

Necesario para decidir: identidad, estudio, fecha, PDF correcto y si se autoriza el aviso. Útil: páginas/tamaño del PDF y fecha de publicación. Secundario: IDs internos, intentos y códigos del proveedor; no exponerlos en la pantalla principal.

## Friction points y navegación

| Evidencia | Fricción / riesgo | Propuesta |
| --- | --- | --- |
| Reserva deriva a WhatsApp (`lib/links.ts`) | El paciente puede esperar disponibilidad y confirmación inmediata | Hasta implementar reservas, indicar que solicita una cita por WhatsApp; confirmación la realiza recepción |
| Staff usa placeholder | No permite elegir un médico real | Completar directorio cuando haya datos; no inventar disponibilidad |
| Dirección vacía (`content/site.ts`) | Falta información concreta para llegar | Validar y completar dirección antes de la confirmación clínica |
| No hay resultados ni acceso médico | No existe recorrido de entrega digital | Dos entradas claras: acceso de médicos y mis resultados; el paciente llega directamente por enlace |
| Registro CI/PAC | Posible confusión entre identificadores | Selector simple y ejemplo de formato; confirmar identidad antes del PDF |
| Publicación y WhatsApp son procesos distintos | “Publicado” puede interpretarse como “entregado” | Estados separados y textos inequívocos |
| Código mostrado una vez | Pérdida de acceso si se omite entrega | Paso explícito de entrega; renovación accesible y explicación de revocación |

La navegación del portal médico será corta: Mis informes, Nuevo informe y sesión. Evitar incorporar ventas, conversaciones, dashboards de facturación o el menú completo del CRM.

## Mobile issues y propuesta responsive

Observado: `Button` tiene variantes de 36, 40, 44 y 48 px; no todas las variantes sirven para acciones críticas al pulgar. No constituye por sí solo un incumplimiento WCAG: hace falta revisar contexto y separación. Usar al menos 44 px como objetivo del portal. `MobileNav` ya cuenta con patrón de drawer; conservar su lenguaje visual.

Formularios de resultados como página o selector de pantalla completa móvil, con cabecera breve y un único contenedor de scroll. `100dvh`, safe areas, acción inferior que no cubra el contenido, teclado visible y foco al campo con error. Un modal con poco contenido no necesita un gran vacío en escritorio: ancho de lectura acotado y altura según contenido. La preferencia por pantalla completa móvil se conserva sin forzar tarjetas vacías en escritorio.

No depender de hover ni drag-and-drop. El botón “Adjuntar PDF” abre el selector del teléfono. Mostrar nombre, tamaño, progreso real si el transporte lo permite, cancelar antes de terminar y reintentar explícitamente. No prometer recuperación del archivo local después de recargar: el navegador puede exigir seleccionarlo de nuevo.

PDF: descarga directa tras autorización y vista previa opcional al revisar, sin obligar a cargar un visor pesado en un teléfono económico. No bloquear la navegación completa mientras carga el documento.

## Component issues y estados

| Componente propuesto | Estados y recuperación |
| --- | --- |
| Búsqueda de paciente | Inicial, buscando, encontrado, no encontrado, identificador inválido, conexión fallida; conservar entrada y ofrecer registro cuando corresponde |
| Adjuntar PDF | Vacío, cargando, verificando, listo, rechazado, capacidad ocupada; explicar tamaño/formato y conservar los datos del informe |
| Revisión/publicación | Borrador, confirmaciones pendientes, publicando, publicado, conflicto; ante 409 recargar estado sin repetir autorización |
| Estado del aviso | Pendiente, enviando, aceptado, entregado, leído, fallido, incierto, cancelado; nunca un spinner indefinido ni “reenviar” automático |
| Consulta paciente | Código vacío, inválido, verificando, preparando, disponible, vencido, retirado, sin conexión; siempre una salida clara |
| Retiro | Motivo obligatorio, confirmación concreta, procesando y retirado; advertir que archivos descargados no pueden recuperarse |

Loading localizado, `aria-live="polite"` para confirmaciones y errores junto al campo con `aria-describedby`. Mensajes deben explicar qué ocurrió, qué significa y cómo continuar. Deshabilitar temporalmente el CTA al enviar no reemplaza las garantías de concurrencia del backend.

## Formularios

Labels persistentes y ayudas breves; placeholder solo como ejemplo. Nombre con autocomplete apropiado; teléfono `type="tel"`; CI/PAC alfanumérico sin forzar teclado numérico si bloquea letras. Código pegable completo, con tolerancia a espacios/guiones; no 12 casillas pequeñas. Contraseña con gestor/autocomplete y opción accesible de visibilidad.

No solicitar dirección, fecha de nacimiento, diagnósticos ni datos de pago para entregar este PDF. Teléfono opcional mientras no se autorice WhatsApp. Una búsqueda por CI/PAC exacto reduce exposición; no introducir un buscador que muestre pacientes por fragmentos de nombre.

Preservar borrador en servidor una vez creado. No persistir información clínica ni tokens en localStorage. Si vence la sesión, volver a ingresar y retomar el borrador guardado. Si se pierde la respuesta al crear, consultar la lista antes de repetir, ya que crear borrador no tiene idempotencia de cliente en esta versión.

## Booking UX — posterior, no implementado

Propuesta de recorrido: servicio → médico si aplica → fecha/horario → datos mínimos → revisión/precio → pago si corresponde → confirmación. Mostrar preparación, ubicación y precio antes del compromiso económico. Defaults seguros: próxima fecha disponible y datos ya ingresados; nunca servicios adicionales ni pagos preseleccionados.

Resumen editable conserva selecciones válidas al volver atrás; cambiar servicio invalida solo lo incompatible. Mobile: indicador compacto “Paso 2 de 4”, selector horizontal Hoy/Mañana/próximos días cuando aporte claridad y calendario completo solo al necesitarlo. Diferenciar disponible, sin horarios, no atiende y fecha pasada mediante texto, no solo color.

`DoctorCard`: nombre, especialidad y disponibilidad real cuando exista; biografía secundaria. `ServiceCard`: descripción entendible, duración/preparación y precio verificado. `TimeSlot`: área táctil generosa, estado seleccionado accesible. `BookingSummary`: servicio, médico, fecha/hora, ubicación y precio con enlaces de edición.

Concurrencia futura: confirmar contra backend; si se ocupó el horario, “Ese horario acaba de ser reservado” y alternativas reales cercanas. Nunca crear disponibilidad ficticia. Pérdida de conexión: conservar progreso permitido y revisar disponibilidad al retomar. Cancelación visible sin obstáculos ni falsas urgencias.

## Accessibility

Evidencia positiva: foco global definido en `globals.css`, componentes Radix, estilos para `prefers-reduced-motion`. Pendiente de validación: orden de foco, anuncios de carga/error, lector de pantalla, contraste efectivo en combinaciones reales, zoom 200/400 %, navegación sin ratón y teclado móvil. No declarar conformidad WCAG sin comprobarla.

El portal debe respetar movimiento reducido, restaurar foco al cerrar un diálogo, ofrecer títulos accesibles y navegación por teclado. Validar textos largos, nombres compuestos y CI/PAC sin truncarlos cuando hacen falta para confirmar identidad. No usar color solo para errores o estado del informe.

## Performance percibida

La web actual tiene estructura institucional y contenido mayormente estático; no hay evidencia medida de rendimiento del futuro portal. Reutilizar esa base sin precargar PDFs ni un visor en cada página. Lista paginada, carga localizada, skeleton solo donde hay estructura conocida y señal explícita durante subida/verificación.

No usar optimistic UI para anunciar publicación o entrega antes de confirmación. Evitar polling rápido por informe: refresco moderado solo mientras exista un aviso pendiente y la vista esté visible. En desconexión explicar “No pudimos comprobar el estado”; no afirmar que el informe está perdido.

## Design consistency

Reutilizar colores, fuentes y botones existentes. Formalizar únicamente valores que realmente se dupliquen. Base de espacios 4/8/12/16/24/32/48/64 compatible con utilidades actuales; validar excepciones editoriales, no reemplazarlas masivamente. Limitar ancho de textos/formularios, jerarquía por espacio y tipografía, sin encerrar cada dato en tarjetas con sombra.

El CSS base usa 15 px y existen etiquetas pequeñas: comprobar legibilidad con personas mayores antes de trasladarlas a datos clínicos críticos. Reservar tipografía pequeña para información secundaria. Iconos Lucide consistentes y con texto en acciones ambiguas.

## UX scorecard cualitativa

Escala exploratoria 1–5: 1 obstáculo claro, 3 base razonable con huecos, 5 requiere validación favorable. N/E: no evaluable. No son métricas objetivas ni calificaciones visuales; son hipótesis basadas en los archivos revisados. Abreviaturas: Cl claridad, Mo mobile, Nv navegación, Jr jerarquía, Ac accesibilidad, Cg carga cognitiva, Cf confianza, Pe performance percibida, Co consistencia, Cv conversión/tarea.

| Vista | Cl | Mo | Nv | Jr | Ac | Cg | Cf | Pe | Co | Cv | Evidencia y alcance |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Inicio | 3 | N/E | 3 | 3 | N/E | 3 | 3 | N/E | 4 | 2 | Tokens y navegación compartidos; reserva externa en `lib/links.ts`; sin medir tarea en móvil |
| Servicios/especialidades | 3 | N/E | 3 | 3 | N/E | 3 | 3 | N/E | 4 | 2 | Páginas informativas existentes; no flujo de disponibilidad/confirmación |
| Staff médico | 1 | N/E | 3 | N/E | N/E | N/E | 2 | N/E | 3 | 1 | `PagePlaceholder` impide elegir profesional por catálogo |
| Atención al paciente | 4 | N/E | 3 | 3 | N/E | 3 | 3 | N/E | 4 | 3 | Explica contacto/horarios; dirección exacta aún vacía en configuración |
| Portal médico | N/E | N/E | N/E | N/E | N/E | N/E | N/E | N/E | N/E | N/E | No existe UI; contratos backend disponibles y flujo propuesto en este documento |
| Mis resultados | N/E | N/E | N/E | N/E | N/E | N/E | N/E | N/E | N/E | N/E | No existe UI; debe probarse con pacientes antes de activación |

## Heurísticas aplicadas y prioridades

| Prioridad | Problema / principio aplicado | Acción y criterio de aceptación |
| --- | --- | --- |
| P0 actual | Identidad equivocada; prevención de errores | Revisar nombre + CI/PAC + PDF antes de publicar; no publicar sin confirmación |
| P0 actual | Confundir publicación y envío; visibilidad del estado | Mostrar ambos estados; prueba donde PDF está publicado y WhatsApp falla sin ocultar resultado |
| P0 actual | Exposición de datos; confianza | Código separado, sesión limitada, sin PDF público ni datos clínicos en WhatsApp; probar revocación |
| P0 actual | Costo sin autorización; control del usuario | WhatsApp desmarcado, aviso de cargo, teléfono confirmado y consentimiento; no reintentar resultados inciertos |
| P0 actual | Recuperación de errores | Fallos de subida/conexión conservan borrador; conflicto obliga revisar estado; salida por atención al paciente |
| P1 | Mobile, formularios y accesibilidad | Pruebas a 320/360/390 px, zoom, teclado, foco y lector; CTA no tapa contenido, campos conservados |
| P1 | Reconocer en vez de memorizar | Paciente/estudio visibles durante revisión; resumen al terminar; no depender de recordar IDs internos |
| P1 | Eficiencia y minimalismo | Lista paginada de informes, búsqueda exacta, sin menú CRM ni campos de reserva/pago |
| P1 | Ayuda contextual | Explicar dónde está el código, qué hacer si vence y cuándo el PDF está preparando |
| P2 futuro | Reserva clínica completa | Validar dominio, disponibilidad, precio, cancelación y contratos antes de calendario/checkout |
| P2 futuro | Pulido y evidencia | Medir rendimiento y tareas, ajustar microinteracciones; conservar marca y no copiar otra clínica |

## Validación posterior

Escenarios inmediatos sin instrucciones externas: médico publica una ecografía; corrige una selección antes de publicar; reconoce un fallo de envío; retira un PDF equivocado; paciente mayor abre el resultado y lo descarga; paciente con enlace vencido encuentra ayuda; usuario con conexión lenta retoma sin duplicar el aviso.

Registrar finalización, errores, necesidad de ayuda y comprensión de costos/estado. Probar con una mano y teléfono económico; incluir teclado y lector de pantalla. No registrar documentos reales en grabaciones de pruebas.

Futuro: “quiero cardiología mañana”, “cuánto cuesta”, “quiero este médico”, “primer horario”, “cambiar hora”, “cancelar” y “encontrar resultados”. Primero arquitectura → flujo → componentes → estados → responsive → accesibilidad → microinteracciones → pulido. Esta auditoría no autoriza ni implementa una renovación global de la UI.


## Actualización tras implementar el portal mínimo

Esta auditoría preserva arriba la línea de base de la landing. Posteriormente, por solicitud de habilitar el uso médico, se implementó una aplicación Next independiente en `portal/` del repositorio de resultados. No se modificó la UI institucional ni el CRM. Se preservaron Montserrat, paleta, isotipo y radios; se añadieron acceso médico, lista de informes, identificación CI/PAC, carga/revisión/publicación, administración mínima de cuentas y consulta del paciente.

Verificación local con datos sintéticos en escritorio y móvil: recorrido completo, descarga idéntica al PDF cargado, retiro que revoca acceso, cookies protegidas, sin overflow horizontal, diálogo de pantalla completa móvil y cero errores JavaScript. Estos resultados no sustituyen pruebas con profesionales/pacientes, accesibilidad completa ni puesta en producción.
