/** Contrato del informe, independiente del nombre libre del estudio. */
export const TIPOS_INFORME = ['ECOGRAFIA', 'PAPANICOLAU', 'LABORATORIO', 'OTRO'] as const;
export type TipoInforme = (typeof TIPOS_INFORME)[number];
export const ESTUDIO_PREDETERMINADO: Record<TipoInforme, string> = {
  ECOGRAFIA: 'Ecografía', PAPANICOLAU: 'Papanicolau', LABORATORIO: 'Laboratorio', OTRO: 'Otro estudio',
};
