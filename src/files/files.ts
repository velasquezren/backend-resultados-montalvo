import { Inject, Injectable } from '@nestjs/common';
import { AwsClient } from 'aws4fetch';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { connect, Socket } from 'node:net';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRef } from 'pdf-lib';
import { CONFIG, AppConfig } from '../config';
import { problem } from '../errors';
import { sealPdf, openPdf } from './encryption';
import { EXTENSIONES_ADJUNTO } from './medios';
import { abrirTramo, sellarArchivo } from './sellado';

export const MAX_PDF_BYTES = 10 * 1024 * 1024;
/** `<uuid>.<extensión>` de un adjunto. Lo arma el servidor; nunca viene del cliente. */
const CLAVE_ADJUNTO = new RegExp(`^[a-f0-9-]{36}\\.(${EXTENSIONES_ADJUNTO.join('|')})$`);

async function sha256DeArchivo(ruta: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(ruta), hash);
  return hash.digest('hex');
}
/**
 * Nombres que no deben llegar al visor ni almacenarse como parte del informe.
 *
 * `OpenAction` no está en esta lista porque FileMaker lo usa para guardar un
 * destino de navegación de la primera página. Se valida aparte: solo se
 * permite la forma array de destino (`[página /XYZ ...]`), nunca un diccionario
 * de acción que pudiera ejecutar JavaScript, abrir archivos o hacer una
 * petición externa.
 */
const forbidden = new Set([
  'JS', 'JavaScript', 'AA', 'Launch', 'EmbeddedFiles', 'EmbeddedFile',
  'RichMedia', 'XFA', 'AcroForm', 'Widget', 'FileAttachment', 'Movie',
  'Sound', '3D', 'SubmitForm', 'ResetForm',
]);

export async function validatePdf(buffer: Buffer): Promise<{ paginas: number; sha256: string }> {
  if (buffer.length === 0 || buffer.length > MAX_PDF_BYTES) problem(413, 'PDF_TAMANO_INVALIDO', 'Adjunta un PDF de hasta 10 MB.');
  if (!buffer.subarray(0, 8).toString('ascii').startsWith('%PDF-')) problem(400, 'PDF_INVALIDO', 'El archivo no es un PDF válido. Exporta el informe a PDF y vuelve a adjuntarlo.');
  let pdf: PDFDocument;
  try { pdf = await PDFDocument.load(buffer, { ignoreEncryption: false, updateMetadata: false, throwOnInvalidObject: true }); }
  catch { problem(400, 'PDF_NO_LEGIBLE', 'No pudimos leer el PDF. Exporta una copia sin contraseña e intenta de nuevo.'); }
  const paginas = pdf.getPageCount();
  if (!paginas || paginas > 300) problem(400, 'PDF_PAGINAS_INVALIDAS', 'El informe debe tener entre 1 y 300 páginas.');
  const seen = new Set<unknown>();
  function inspect(value: unknown): void {
    if (seen.has(value)) return;
    seen.add(value);
    if (value instanceof PDFName && forbidden.has(value.decodeText())) problem(400, 'PDF_CONTENIDO_ACTIVO', 'Exporta el informe como PDF simple, sin formularios, scripts ni archivos adjuntos.');
    if (value instanceof PDFDict) for (const [key, child] of value.entries()) {
      const nombre = key instanceof PDFName ? key.decodeText() : undefined;
      if (nombre === 'OpenAction') {
        /* FileMaker Pro 19.x writes `[page /XYZ null null 1]`. A PDF action
           dictionary is deliberately rejected, even if it happens to use the
           same catalog key, because it may contain `/S /JavaScript`, `/Launch`
           or another active action. Indirect arrays are resolved before the
           shape check. */
        const destino = child instanceof PDFRef ? pdf.context.lookup(child) : child;
        if (!(destino instanceof PDFArray)) problem(400, 'PDF_CONTENIDO_ACTIVO', 'Exporta el informe como PDF simple, sin formularios, scripts ni archivos adjuntos.');
        inspect(destino);
      } else {
        inspect(key);
        inspect(child);
      }
    }
    else if (value instanceof PDFArray) for (const child of value.asArray()) inspect(child);
    else if (value && typeof value === 'object' && 'dict' in value) inspect(value.dict);
  }
  for (const [, object] of pdf.context.enumerateIndirectObjects()) inspect(object);
  return { paginas, sha256: createHash('sha256').update(buffer).digest('hex') };
}

@Injectable()
export class PdfScanner {
  constructor(@Inject(CONFIG) private readonly config: AppConfig) {}
  async scan(buffer: Buffer): Promise<void> {
    const result = await this.instream(async socket => {
      for (let offset = 0; offset < buffer.length; offset += 64 * 1024) await enviarTrozo(socket, buffer.subarray(offset, offset + 64 * 1024));
    });
    if (result !== undefined && !/^stream: OK\0?$/.test(result.trim())) problem(400, 'PDF_RECHAZADO', 'El archivo no superó la verificación de seguridad. Genera una copia nueva del informe.');
  }
  /**
   * Un adjunto (video o imagen) leído del disco por trozos: no se carga en
   * memoria. clamd tiene que admitir el tamaño (`StreamMaxLength` en
   * `clamd.conf`, ver `ops/infraestructura-servidor.sh`); si no, responde que
   * se pasó del límite y eso es configuración, no un virus.
   */
  async scanFile(ruta: string): Promise<void> {
    const result = await this.instream(async socket => {
      for await (const trozo of createReadStream(ruta, { highWaterMark: 64 * 1024 })) await enviarTrozo(socket, trozo as Buffer);
    });
    if (result === undefined || /^stream: OK\0?$/.test(result.trim())) return;
    if (/size limit exceeded/i.test(result)) {
      process.stderr.write(JSON.stringify({ evento: 'clamd_limite_tamano', detalle: 'Subir StreamMaxLength/MaxFileSize en clamd.conf' }) + '\n');
      problem(503, 'VERIFICACION_NO_DISPONIBLE', 'No pudimos verificar un archivo de ese tamaño. Avisa a la clínica e intenta más tarde.');
    }
    problem(400, 'ARCHIVO_RECHAZADO', 'El archivo no superó la verificación de seguridad. Expórtalo de nuevo desde el equipo y vuelve a subirlo.');
  }
  /** `undefined` = no hay antivirus en desarrollo; se acepta sin analizar. */
  private async instream(escribir: (socket: Socket) => Promise<void>): Promise<string | undefined> {
    const host = process.env.CLAMAV_HOST;
    if (!host && !this.config.production) return undefined;
    if (!host) problem(503, 'VERIFICACION_NO_DISPONIBLE', 'La verificación de archivos no está disponible. Intenta nuevamente más tarde.');
    return new Promise<string>((resolve, reject) => {
      const socket = connect({ host, port: Number(process.env.CLAMAV_PORT ?? 3310) });
      let response = '';
      socket.setTimeout(30_000, () => socket.destroy(new Error('scanner_timeout')));
      socket.on('error', reject);
      socket.on('data', data => { response += data.toString(); if (response.length > 4096) socket.destroy(new Error('scanner_response')); });
      socket.on('end', () => resolve(response));
      socket.on('connect', () => {
        socket.write('zINSTREAM\0');
        escribir(socket).then(() => { socket.write(Buffer.alloc(4)); }, error => socket.destroy(error));
      });
    }).catch(() => problem(503, 'VERIFICACION_NO_DISPONIBLE', 'No pudimos verificar el archivo. Intenta nuevamente más tarde.'));
  }
}

/** Un trozo del protocolo INSTREAM de clamd, respetando la contrapresión del socket. */
async function enviarTrozo(socket: Socket, trozo: Buffer): Promise<void> {
  const largo = Buffer.alloc(4); largo.writeUInt32BE(trozo.length);
  socket.write(largo);
  if (!socket.write(trozo)) await new Promise<void>((resolve, reject) => {
    socket.once('drain', resolve);
    socket.once('close', () => reject(new Error('scanner_cerrado')));
  });
}

@Injectable()
export class PrivateFiles {
  private readonly client?: AwsClient;
  private readonly endpoint?: string;
  constructor(@Inject(CONFIG) private readonly config: AppConfig) {
    if (config.storage === 'r2') {
      this.client = new AwsClient({ accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!, region: 'auto', retries: 0 });
      this.endpoint = `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${process.env.R2_BUCKET}`;
    }
  }
  private key(key: string): string {
    if (!/^[a-f0-9-]{36}\.pdf$/.test(key) && !CLAVE_ADJUNTO.test(key)) throw new Error('clave_archivo_invalida');
    return key;
  }
  private adjunto(key: string): string {
    if (!CLAVE_ADJUNTO.test(key)) throw new Error('clave_adjunto_invalida');
    return key;
  }
  /**
   * Guarda un adjunto desde el archivo temporal de la subida, sin cargarlo en
   * memoria: cifrado por trozos (`sellado.ts`) si hay clave, para poder
   * servirlo por tramos. Devuelve el SHA-256 del contenido.
   */
  async guardarAdjunto(key: string, temporal: string): Promise<string> {
    this.adjunto(key);
    if (this.client) {
      /* R2 no está activo en producción (ver arquitectura). Se sube con el
         mismo patrón ya probado del PDF —el archivo entero, firmado— en vez
         de un flujo que nunca se ha probado contra R2. */
      const contenido = await readFile(temporal);
      const sha256 = createHash('sha256').update(contenido).digest('hex');
      const signed = await this.client.sign(`${this.endpoint}/${key}`, { method: 'PUT', body: new Blob([new Uint8Array(contenido)]) });
      const response = await fetch(signed, { signal: AbortSignal.timeout(10 * 60_000) });
      if (!response.ok) problem(503, 'ARCHIVO_NO_GUARDADO', 'No pudimos guardar el archivo. Conserva el original e intenta nuevamente.');
      await response.body?.cancel();
      return sha256;
    }
    await mkdir(this.config.privateDir, { recursive: true, mode: 0o700 });
    const destino = join(this.config.privateDir, key);
    if (this.config.storageKey) return (await sellarArchivo(temporal, destino, this.config.storageKey, key)).sha256;
    // Solo desarrollo (`STORAGE_DRIVER=local`): producción exige cifrado o R2.
    await copyFile(temporal, destino, 1 /* COPYFILE_EXCL */);
    return sha256DeArchivo(destino);
  }
  /** Los bytes `inicio`..`fin` (incluidos) de un adjunto, como flujo. */
  async leerAdjunto(key: string, inicio: number, fin: number): Promise<Readable> {
    this.adjunto(key);
    if (this.client) {
      const signed = await this.client.sign(`${this.endpoint}/${key}`, { headers: { Range: `bytes=${inicio}-${fin}` } });
      const response = await fetch(signed, { signal: AbortSignal.timeout(60_000) });
      if (!response.ok || !response.body) problem(503, 'ARCHIVO_NO_DISPONIBLE', 'No pudimos cargar el archivo. Intenta de nuevo en unos momentos.');
      return Readable.fromWeb(response.body as import('node:stream/web').ReadableStream);
    }
    const ruta = join(this.config.privateDir, key);
    return this.config.storageKey
      ? Readable.from(abrirTramo(ruta, this.config.storageKey, key, inicio, fin))
      : createReadStream(ruta, { start: inicio, end: fin });
  }
  async put(key: string, buffer: Buffer): Promise<void> {
    this.key(key);
    if (this.client) {
      const signed = await this.client.sign(`${this.endpoint}/${key}`, { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: new Blob([new Uint8Array(buffer)]) });
      const response = await fetch(signed, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) problem(503, 'ARCHIVO_NO_GUARDADO', 'No pudimos guardar el PDF. Conserva el archivo e intenta nuevamente.');
      await response.body?.cancel();
    } else {
      await mkdir(this.config.privateDir, { recursive: true, mode: 0o700 });
      await writeFile(join(this.config.privateDir, key), this.config.storageKey ? sealPdf(buffer, this.config.storageKey, key) : buffer, { mode: 0o600, flag: 'wx' });
    }
  }
  async get(key: string): Promise<Buffer> {
    this.key(key);
    if (!this.client) {
      const path = join(this.config.privateDir, key);
      if ((await stat(path)).size > MAX_PDF_BYTES + 33) throw new Error('archivo_tamano_invalido');
      const value = await readFile(path);
      return this.config.storageKey ? openPdf(value, this.config.storageKey, key) : value;
    }
    const signed = await this.client.sign(`${this.endpoint}/${key}`);
    const response = await fetch(signed, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok || Number(response.headers.get('content-length') ?? 0) > MAX_PDF_BYTES) problem(503, 'PDF_NO_DISPONIBLE', 'No pudimos cargar el documento. Intenta de nuevo en unos momentos.');
    if (!response.body) throw new Error('archivo_sin_cuerpo');
    const reader = response.body.getReader(); const parts: Uint8Array[] = []; let bytes = 0;
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      bytes += value.length;
      if (bytes > MAX_PDF_BYTES) { await reader.cancel(); throw new Error('archivo_tamano_invalido'); }
      parts.push(value);
    }
    return Buffer.concat(parts);
  }
  async delete(key: string): Promise<void> {
    this.key(key);
    if (!this.client) { await unlink(join(this.config.privateDir, key)); return; }
    const signed = await this.client.sign(`${this.endpoint}/${key}`, { method: 'DELETE' });
    const response = await fetch(signed, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok && response.status !== 404) throw new Error('archivo_no_eliminado');
    await response.body?.cancel();
  }
}
