import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { open, unlink } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';

/**
 * Cifrado por trozos para los adjuntos (formato `MNTV2`).
 *
 * El PDF se cifra entero (`encryption.ts`): mide 10 MB como mucho y se lee de
 * una vez. Un video no: pesa hasta 100 MB y el navegador lo pide por tramos
 * (`Range`). Con un solo bloque GCM habría que descifrar el archivo entero en
 * memoria para cada tramo que pide el reproductor —decenas por video—.
 *
 * Aquí cada trozo de 64 KiB lleva su propio nonce y su etiqueta, así que se
 * descifran solo los trozos del tramo pedido. Lo que impide reordenarlos,
 * cortarlos o mezclarlos con otro archivo es el AAD de cada trozo: la clave
 * del objeto, la cabecera entera (que fija el tamaño total) y el número de
 * trozo. Cambiar cualquiera de los tres hace fallar la etiqueta.
 *
 * Cabecera (25 bytes): `MNTV2` · tamaño de trozo (u32) · tamaño en claro
 * (u64) · prefijo de nonce aleatorio (8). Nonce del trozo i = prefijo · i (u32).
 */
const MAGIA = Buffer.from('MNTV2');
const CABECERA = 25;
const ETIQUETA = 16;
export const TROZO = 64 * 1024;

function aad(clave: string, cabecera: Buffer, indice: number): Buffer {
  const numero = Buffer.alloc(4); numero.writeUInt32BE(indice);
  return Buffer.concat([Buffer.from(clave), cabecera, numero]);
}
function nonce(prefijo: Buffer, indice: number): Buffer {
  const n = Buffer.alloc(12); prefijo.copy(n, 0); n.writeUInt32BE(indice, 8); return n;
}

/**
 * Cifra `origen` en `destino` sin cargarlo en memoria. Devuelve el SHA-256 del
 * contenido en claro. `destino` no debe existir: un choque de claves es un
 * error, no algo que se pise.
 */
export async function sellarArchivo(origen: string, destino: string, claveHex: string, objeto: string): Promise<{ sha256: string; bytes: number }> {
  const entrada = await open(origen, 'r');
  let salida: FileHandle | undefined;
  try {
    const bytes = (await entrada.stat()).size;
    if (Math.ceil(bytes / TROZO) >= 2 ** 32) throw new Error('adjunto_demasiado_grande');
    const cabecera = Buffer.alloc(CABECERA);
    MAGIA.copy(cabecera, 0); cabecera.writeUInt32BE(TROZO, 5); cabecera.writeBigUInt64BE(BigInt(bytes), 9);
    const prefijo = randomBytes(8); prefijo.copy(cabecera, 17);
    salida = await open(destino, 'wx', 0o600);
    await salida.write(cabecera);
    const llave = Buffer.from(claveHex, 'hex');
    const hash = createHash('sha256');
    const trozo = Buffer.alloc(TROZO);
    for (let indice = 0, leidos = 0; leidos < bytes; indice++) {
      const { bytesRead } = await entrada.read(trozo, 0, Math.min(TROZO, bytes - leidos), leidos);
      if (bytesRead === 0) throw new Error('adjunto_truncado');
      const claro = trozo.subarray(0, bytesRead);
      hash.update(claro);
      const cifrador = createCipheriv('aes-256-gcm', llave, nonce(prefijo, indice));
      cifrador.setAAD(aad(objeto, cabecera, indice));
      await salida.write(Buffer.concat([cifrador.update(claro), cifrador.final(), cifrador.getAuthTag()]));
      leidos += bytesRead;
    }
    await salida.sync();
    return { sha256: hash.digest('hex'), bytes };
  } catch (error) {
    if (salida) { await salida.close().catch(() => undefined); salida = undefined; await unlink(destino).catch(() => undefined); }
    throw error;
  } finally {
    await entrada.close();
    await salida?.close();
  }
}

/**
 * Los bytes `inicio`..`fin` (incluidos) de un archivo sellado, descifrando
 * solo los trozos que los contienen. Si un trozo no verifica, el flujo se
 * corta con error: nunca se entrega un byte sin autenticar.
 */
export async function* abrirTramo(ruta: string, claveHex: string, objeto: string, inicio: number, fin: number): AsyncGenerator<Buffer> {
  const archivo = await open(ruta, 'r');
  try {
    const cabecera = Buffer.alloc(CABECERA);
    await archivo.read(cabecera, 0, CABECERA, 0);
    if (!cabecera.subarray(0, 5).equals(MAGIA)) throw new Error('adjunto_cifrado_invalido');
    const trozo = cabecera.readUInt32BE(5);
    const total = Number(cabecera.readBigUInt64BE(9));
    if (trozo !== TROZO || fin >= total || inicio > fin) throw new Error('adjunto_tramo_invalido');
    const prefijo = cabecera.subarray(17, 25);
    const llave = Buffer.from(claveHex, 'hex');
    for (let indice = Math.floor(inicio / trozo); indice <= Math.floor(fin / trozo); indice++) {
      const enClaro = Math.min(trozo, total - indice * trozo);
      const cifrado = Buffer.alloc(enClaro + ETIQUETA);
      const { bytesRead } = await archivo.read(cifrado, 0, cifrado.length, CABECERA + indice * (trozo + ETIQUETA));
      if (bytesRead !== cifrado.length) throw new Error('adjunto_truncado');
      const descifrador = createDecipheriv('aes-256-gcm', llave, nonce(prefijo, indice));
      descifrador.setAAD(aad(objeto, cabecera, indice));
      descifrador.setAuthTag(cifrado.subarray(enClaro));
      const claro = Buffer.concat([descifrador.update(cifrado.subarray(0, enClaro)), descifrador.final()]);
      const desde = indice * trozo;
      yield claro.subarray(Math.max(0, inicio - desde), Math.min(enClaro, fin - desde + 1));
    }
  } finally {
    await archivo.close();
  }
}
