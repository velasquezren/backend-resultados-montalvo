/** Contrato del informe, independiente del nombre libre del estudio. */
export const TIPOS_INFORME = ['ECOGRAFIA', 'PAPANICOLAU', 'LABORATORIO', 'OTRO'] as const;
export type TipoInforme = (typeof TIPOS_INFORME)[number];
export const ESTUDIO_PREDETERMINADO: Record<TipoInforme, string> = {
  ECOGRAFIA: 'Ecografía', PAPANICOLAU: 'Papanicolau', LABORATORIO: 'Laboratorio', OTRO: 'Otro estudio',
};

/**
 * La página del paciente: los de laboratorio los emite Laboratorio Climon, otra
 * empresa, y se abren en `/laboratorio/` con su marca; el resto en
 * `PATIENT_PORTAL_URL` (`/resultados/`), de Clínica Montalvo. El enlace viejo
 * `/resultados/<id>` de un laboratorio sigue abriendo: el portal lo lleva a su
 * página.
 */
export function enlacePaciente(portalUrl: string, tipo: TipoInforme | string, accesoId: string): string {
  return tipo === 'LABORATORIO' ? `${new URL(portalUrl).origin}/laboratorio/${accesoId}` : `${portalUrl}/${accesoId}`;
}
