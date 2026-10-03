import { problem } from '../errors';

/**
 * Videos e imágenes que acompañan a un informe.
 *
 * 100 MB alcanza para los clips de ecografía y los videos 4D que exportan los
 * equipos (de 5 a 60 MB, en general) sin que uno solo llene el disco del
 * servidor, que se comparte con el CRM. Seis por informe: es un acompañamiento
 * del resultado, no una galería.
 */
export const MAX_ADJUNTO_BYTES = 100 * 1024 * 1024;
export const MAX_ADJUNTOS_POR_INFORME = 6;
/** Bytes que hacen falta para reconocer cualquiera de los formatos de abajo. */
export const BYTES_PARA_DETECTAR = 64;

export type TipoMedio = 'VIDEO' | 'IMAGEN';
export interface Formato {
  readonly tipo: TipoMedio;
  readonly mime: string;
  readonly extension: string;
}

const MP4: Formato = { tipo: 'VIDEO', mime: 'video/mp4', extension: 'mp4' };
const MOV: Formato = { tipo: 'VIDEO', mime: 'video/quicktime', extension: 'mov' };
const WEBM: Formato = { tipo: 'VIDEO', mime: 'video/webm', extension: 'webm' };
const GIF: Formato = { tipo: 'IMAGEN', mime: 'image/gif', extension: 'gif' };
const JPEG: Formato = { tipo: 'IMAGEN', mime: 'image/jpeg', extension: 'jpg' };
const PNG: Formato = { tipo: 'IMAGEN', mime: 'image/png', extension: 'png' };
const WEBP: Formato = { tipo: 'IMAGEN', mime: 'image/webp', extension: 'webp' };

const FORMATOS = [MP4, MOV, WEBM, GIF, JPEG, PNG, WEBP];
/** Las extensiones que puede tener una clave de adjunto en el almacenamiento. */
export const EXTENSIONES_ADJUNTO = FORMATOS.map(f => f.extension);
/** La extensión de un tipo ya detectado (el `mime` guardado de un adjunto). */
export function extensionDe(mime: string): string {
  return FORMATOS.find(f => f.mime === mime)?.extension ?? 'bin';
}

/** Fotos HEIF/AVIF de los teléfonos: el navegador de muchos pacientes no las muestra. */
const MARCAS_HEIF = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'mif1', 'msf1', 'avif', 'avis']);
const MARCAS_3GP = /^3g[p2]/;

const CONVERTIR_VIDEO = 'Ese formato de video no se reproduce en todos los teléfonos. Expórtalo como MP4 y vuelve a subirlo.';

/**
 * El formato REAL del archivo, por sus primeros bytes. Lo que diga el
 * navegador (`Content-Type`, extensión) no cuenta: es lo que escribió quien
 * subió el archivo, y lo que se le sirve al paciente tiene que ser lo que de
 * verdad es.
 *
 * Solo entran formatos que un teléfono reproduce sin instalar nada. Para los
 * demás el mensaje dice cómo convertirlos, en vez de aceptarlos y dejar al
 * paciente frente a un reproductor negro.
 */
export function detectarFormato(cabecera: Buffer): Formato {
  const ascii = (desde: number, hasta: number) => cabecera.subarray(desde, hasta).toString('latin1');
  if (cabecera.length >= 12 && ascii(4, 8) === 'ftyp') {
    const marca = ascii(8, 12);
    if (marca === 'qt  ') return MOV;
    if (MARCAS_HEIF.has(marca)) problem(400, 'FORMATO_NO_ADMITIDO', 'Las fotos HEIC no se ven en todos los teléfonos. Expórtala como JPG o PNG y vuelve a subirla.');
    if (MARCAS_3GP.test(marca)) problem(400, 'FORMATO_NO_ADMITIDO', CONVERTIR_VIDEO);
    if (marca === 'M4A ' || marca === 'M4B ') problem(400, 'FORMATO_NO_ADMITIDO', 'Es un archivo de audio. Sube un video MP4 o una imagen.');
    return MP4;
  }
  if (cabecera.length >= 4 && cabecera.readUInt32BE(0) === 0x1a45dfa3) {
    // EBML: WebM sí; Matroska (.mkv) declara otro tipo de documento y no se reproduce en todos lados.
    if (ascii(0, cabecera.length).includes('webm')) return WEBM;
    problem(400, 'FORMATO_NO_ADMITIDO', CONVERTIR_VIDEO);
  }
  if (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a') return GIF;
  if (cabecera.length >= 3 && cabecera[0] === 0xff && cabecera[1] === 0xd8 && cabecera[2] === 0xff) return JPEG;
  if (cabecera.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return PNG;
  if (ascii(0, 4) === 'RIFF') {
    if (ascii(8, 12) === 'WEBP') return WEBP;
    if (ascii(8, 12) === 'AVI ') problem(400, 'FORMATO_NO_ADMITIDO', CONVERTIR_VIDEO);
  }
  if (ascii(0, 5) === '%PDF-') problem(400, 'FORMATO_NO_ADMITIDO', 'El PDF del informe se adjunta en su propia sección. Aquí van videos e imágenes.');
  problem(400, 'FORMATO_NO_ADMITIDO', 'Sube un video MP4, MOV o WebM, o una imagen JPG, PNG, GIF o WebP.');
}

/**
 * Nombre con que lo subió el médico, para mostrárselo solo a él. Sin rutas ni
 * caracteres de control: llega de su sistema de archivos tal cual.
 */
export function nombreVisible(original: string | undefined, formato: Formato): string {
  const base = (original ?? '').split(/[\\/]/).pop() ?? '';
  const limpio = base.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 160);
  return limpio || `${formato.tipo === 'VIDEO' ? 'Video' : 'Imagen'}.${formato.extension}`;
}
