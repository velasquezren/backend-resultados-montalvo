import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import sharp from 'sharp';

/**
 * Calidad JPEG de las fotos en la versión liviana. Con mozjpeg, 80 no se
 * distingue del original al ojo en un teléfono ni en un monitor, y pesa unas
 * tres veces menos que lo que exporta FileMaker (que usa calidad máxima).
 */
export const CALIDAD_VISTA = 80;

/** Por debajo de este ahorro no vale la pena guardar un segundo archivo. */
const AHORRO_MINIMO = 0.2;

/** Una foto recomprimida solo se usa si baja al menos esto: si no, se deja la original. */
const MEJORA_MINIMA_POR_FOTO = 0.9;

/**
 * La versión del informe para VER: el mismo PDF con las fotos recomprimidas.
 *
 * Medido en producción el 2026-09-29: el 96-97 % del peso de un informe son
 * las fotos de la ecografía (JPEG 1136×852 de 300-400 KB cada una, en calidad
 * máxima). El texto, las fuentes y los logos suman menos de 0,1 MB. Un informe
 * de 3 MB tardaba segundos en abrir con la conexión de la clínica y con los
 * datos móviles de la paciente.
 *
 * Qué NO toca, a propósito:
 * - El original. Esto devuelve un archivo NUEVO; el publicado sigue inmutable
 *   y se puede descargar tal cual.
 * - Las dimensiones de las fotos: solo se recomprime, no se reduce.
 * - Todo lo que no sea una foto JPEG RGB o en grises de 8 bits sin filtros
 *   encadenados ni `/Decode`: un CMYK o un espacio de color con perfil se
 *   leería con otros colores al recodificarlo, y ahorrar no justifica ese
 *   riesgo en un documento clínico.
 * - Texto, fuentes, vectores, páginas y su orden.
 *
 * Devuelve `null` si no hay nada que ganar: sin fotos que recomprimir o con
 * un ahorro menor al 20 %. Quien llama sirve entonces el original.
 */
export async function aligerarPdf(original: Buffer): Promise<Buffer | null> {
  const pdf = await PDFDocument.load(original, { updateMetadata: false });
  let recomprimidas = 0;

  for (const [ref, objeto] of pdf.context.enumerateIndirectObjects()) {
    if (!(objeto instanceof PDFRawStream)) continue;
    const { dict } = objeto;
    if (dict.get(PDFName.of('Subtype')) !== PDFName.of('Image')) continue;
    if (dict.get(PDFName.of('Filter')) !== PDFName.of('DCTDecode')) continue;
    if (dict.has(PDFName.of('Decode'))) continue;
    const espacio = dict.get(PDFName.of('ColorSpace'));
    const canales = espacio === PDFName.of('DeviceRGB') ? 3 : espacio === PDFName.of('DeviceGray') ? 1 : 0;
    if (!canales) continue;

    const foto = Buffer.from(objeto.contents);
    const info = await sharp(foto).metadata().catch(() => null);
    if (!info || info.channels !== canales || info.depth !== 'uchar') continue;

    /* Sin `.rotate()`: el visor de PDF ignora la orientación EXIF y sharp la
       descarta al escribir, así que la foto se ve igual que antes. */
    const imagen = canales === 1 ? sharp(foto).toColourspace('b-w') : sharp(foto);
    const liviana = await imagen.jpeg({ quality: CALIDAD_VISTA, mozjpeg: true }).toBuffer();
    if (liviana.length >= foto.length * MEJORA_MINIMA_POR_FOTO) continue;

    /* `Length` lo recalcula pdf-lib al escribir el stream. */
    pdf.context.assign(ref, PDFRawStream.of(dict, liviana));
    recomprimidas++;
  }

  if (!recomprimidas) return null;
  const resultado = Buffer.from(await pdf.save({ useObjectStreams: false }));
  return resultado.length <= original.length * (1 - AHORRO_MINIMO) ? resultado : null;
}
