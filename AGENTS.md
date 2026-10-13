# Guía para agentes — Resultados Montalvo

Lee `README.md`, `CONTEXTO_CONTINUIDAD.md` y la documentación del área que vayas a cambiar. Este repositorio contiene una API NestJS y un portal Next.js independientes del CRM.

- API, base de datos, archivos o worker: carga `.agents/skills/resultados-api/SKILL.md`.
- Portal React/Next: carga `.agents/skills/react-best-practices/SKILL.md` y lee `portal/README.md`. Para APIs de Next consulta la documentación de la versión instalada en `portal/node_modules/next/dist/docs/` después de `npm ci`.
- Las reglas del dominio y privacidad en `docs/arquitectura.md` prevalecen sobre consejos genéricos de rendimiento. Mantén los límites entre pacientes, médicos y CRM.
- Haz cambios pequeños y verificables. Actualiza la documentación cuando cambie un contrato o procedimiento. Sigue las comprobaciones de `README.md` y `portal/README.md` según el área modificada.
- Nunca incluyas secretos, datos clínicos reales, PDFs de pacientes ni valores de `.env` en Git, ejemplos o registros.
- Los repositorios se usan desde varias máquinas: comprueba `git status` y el historial remoto antes de editar. No despliegues ni modifiques producción salvo petición explícita.

Los skills del proyecto están bajo `.agents/skills/` para incluirlos en Git. Una instalación global de un agente no es requisito para trabajar aquí.
