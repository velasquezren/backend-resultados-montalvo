import { inflateSync } from 'node:zlib';
import { PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream } from 'pdf-lib';
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
 * Solo se tocan imágenes grandes: las fotos de la ecografía rondan el millón
 * de píxeles. Un logo o un encabezado son chicos, ahorran casi nada y es donde
 * recomprimir se nota: el logo del encabezado (324×292, JPEG) daba 28 dB
 * contra 33-39 dB de las fotos (medido en producción el 2026-09-29).
 */
const PIXELES_MINIMOS_FOTO = 250_000;
/**
 * Una imagen SIN pérdida (Flate) solo pasa a JPEG si además el JPEG pesa
 * menos de la mitad. Una foto de ecografía baja a una fracción; un gráfico o
 * un texto escaneado no, y ahí el JPEG solo añadiría borrones.
 */
const MEJORA_MINIMA_SIN_PERDIDA = 0.5;
/** Techo contra un PDF que declare una imagen descomunal: 25 megapíxeles. */
const PIXELES_MAXIMOS = 25_000_000;

/**
 * La versión del informe para VER: el mismo PDF con las fotos recomprimidas.
 *
 * Medido en producción el 2026-09-29: el 96-97 % del peso de un informe son
 * las fotos de la ecografía (JPEG 1136×852 de 300-400 KB cada una, en calidad
 * máxima). El texto, las fuentes y los logos suman menos de 0,1 MB. Un informe
 * de 3 MB tardaba segundos en abrir con la conexión de la clínica y con los
 * datos móviles de la paciente.
 *
 * Las fotos pueden venir en JPEG (FileMaker 19 las exporta así) o SIN pérdida
 * con Flate (FileMaker 20.1: 1264×880, ~580 KB cada una; su informe de 4,8 MB
 * no bajaba nada). Las dos terminan en JPEG de calidad 80.
 *
 * Qué NO toca, a propósito:
 * - El original. Esto devuelve un archivo NUEVO; el publicado sigue inmutable
 *   y se puede descargar tal cual.
 * - Las dimensiones de las fotos: solo se recomprime, no se reduce.
 * - Todo lo que no sea una foto RGB o en grises de 8 bits sin filtros
 *   encadenados, `/Decode`, predictores ni transparencia: un CMYK o un
 *   espacio de color con perfil se leería con otros colores al recodificarlo,
 *   y ahorrar no justifica ese riesgo en un documento clínico.
 * - Imágenes chicas (logos, encabezados, firmas) y, sin pérdida, las que en
 *   JPEG no bajan a la mitad (gráficos): no son fotos.
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
    if (dict.has(PDFName.of('Decode'))) continue;
    const espacio = dict.get(PDFName.of('ColorSpace'));
    const canales = espacio === PDFName.of('DeviceRGB') ? 3 : espacio === PDFName.of('DeviceGray') ? 1 : 0;
    if (!canales) continue;

    const filtro = dict.get(PDFName.of('Filter'));
    const liviana =
      filtro === PDFName.of('DCTDecode') ? await recomprimirJpeg(Buffer.from(objeto.contents), canales)
      : filtro === PDFName.of('FlateDecode') ? await fotoSinPerdidaAJpeg(pdf, dict, Buffer.from(objeto.contents), canales)
      : null;
    if (!liviana) continue;

    dict.set(PDFName.of('Filter'), PDFName.of('DCTDecode'));
    /* `Length` lo recalcula pdf-lib al escribir el stream. */
    pdf.context.assign(ref, PDFRawStream.of(dict, liviana));
    recomprimidas++;
  }

  if (!recomprimidas) return null;
  const resultado = Buffer.from(await pdf.save({ useObjectStreams: false }));
  return resultado.length <= original.length * (1 - AHORRO_MINIMO) ? resultado : null;
}

/** Una foto que ya es JPEG, a calidad 80. `null` si no cumple o no gana al menos un 10 %. */
async function recomprimirJpeg(foto: Buffer, canales: number): Promise<Buffer | null> {
  const info = await sharp(foto).metadata().catch(() => null);
  if (!info || info.channels !== canales || info.depth !== 'uchar') return null;
  if (!info.width || !info.height || info.width * info.height < PIXELES_MINIMOS_FOTO) return null;
  /* Sin `.rotate()`: el visor de PDF ignora la orientación EXIF y sharp la
     descarta al escribir, así que la foto se ve igual que antes. */
  const imagen = canales === 1 ? sharp(foto).toColourspace('b-w') : sharp(foto);
  const liviana = await imagen.jpeg({ quality: CALIDAD_VISTA, mozjpeg: true }).toBuffer();
  return liviana.length < foto.length * MEJORA_MINIMA_POR_FOTO ? liviana : null;
}

/**
 * Una foto guardada sin pérdida (Flate, sin predictor ni transparencia) a
 * JPEG de calidad 80. `null` si no parece una foto o no cumple la forma
 * simple: píxeles crudos de 8 bits, uno por canal, sin nada más.
 */
async function fotoSinPerdidaAJpeg(pdf: PDFDocument, dict: PDFDict, comprimida: Buffer, canales: number): Promise<Buffer | null> {
  if (dict.has(PDFName.of('DecodeParms')) || dict.has(PDFName.of('SMask')) || dict.has(PDFName.of('Mask'))) return null;
  const numero = (clave: string) => pdf.context.lookupMaybe(dict.get(PDFName.of(clave)), PDFNumber)?.asNumber();
  const ancho = numero('Width'), alto = numero('Height');
  if (numero('BitsPerComponent') !== 8 || !ancho || !alto) return null;
  const pixeles = ancho * alto;
  if (pixeles < PIXELES_MINIMOS_FOTO || pixeles > PIXELES_MAXIMOS) return null;

  const esperados = pixeles * canales;
  let crudo: Buffer;
  try { crudo = inflateSync(comprimida, { maxOutputLength: esperados }); }
  catch { return null; }
  if (crudo.length !== esperados) return null;

  const jpeg = await sharp(crudo, { raw: { width: ancho, height: alto, channels: canales as 1 | 3 } })
    .jpeg({ quality: CALIDAD_VISTA, mozjpeg: true })
    .toBuffer();
  return jpeg.length < comprimida.length * MEJORA_MINIMA_SIN_PERDIDA ? jpeg : null;
}
