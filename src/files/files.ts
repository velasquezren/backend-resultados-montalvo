import { CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor } from '@nestjs/common';
import { AwsClient } from 'aws4fetch';
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { connect } from 'node:net';
import { PDFArray, PDFDict, PDFDocument, PDFName } from 'pdf-lib';
import { finalize } from 'rxjs';
import { CONFIG, AppConfig } from '../config';
import { problem } from '../errors';
import { sealPdf, openPdf } from './encryption';

export const MAX_PDF_BYTES = 10 * 1024 * 1024;
const forbidden = new Set(['JS', 'JavaScript', 'AA', 'OpenAction', 'Launch', 'EmbeddedFiles', 'EmbeddedFile', 'RichMedia', 'XFA', 'AcroForm']);

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
    if (value instanceof PDFDict) for (const [key, child] of value.entries()) { inspect(key); inspect(child); }
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
    const host = process.env.CLAMAV_HOST;
    if (!host && !this.config.production) return;
    if (!host) problem(503, 'VERIFICACION_NO_DISPONIBLE', 'La verificación de archivos no está disponible. Intenta nuevamente más tarde.');
    const result = await new Promise<string>((resolve, reject) => {
      const socket = connect({ host, port: Number(process.env.CLAMAV_PORT ?? 3310) });
      let response = '';
      socket.setTimeout(30_000, () => socket.destroy(new Error('scanner_timeout')));
      socket.on('error', reject);
      socket.on('data', data => { response += data.toString(); if (response.length > 4096) socket.destroy(new Error('scanner_response')); });
      socket.on('end', () => resolve(response));
      socket.on('connect', () => {
        socket.write('zINSTREAM\0');
        for (let offset = 0; offset < buffer.length; offset += 64 * 1024) {
          const chunk = buffer.subarray(offset, offset + 64 * 1024);
          const length = Buffer.alloc(4); length.writeUInt32BE(chunk.length);
          socket.write(length); socket.write(chunk);
        }
        socket.write(Buffer.alloc(4));
      });
    }).catch(() => problem(503, 'VERIFICACION_NO_DISPONIBLE', 'No pudimos verificar el archivo. Intenta nuevamente más tarde.'));
    if (!/^stream: OK\0?$/.test(result.trim())) problem(400, 'PDF_RECHAZADO', 'El archivo no superó la verificación de seguridad. Genera una copia nueva del informe.');
  }
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
    if (!/^[a-f0-9-]{36}\.pdf$/.test(key)) throw new Error('clave_archivo_invalida');
    return key;
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

/** El límite incluye Multer: máximo dos PDFs en memoria por proceso. */
@Injectable()
export class UploadCapacity implements NestInterceptor {
  private active = 0;
  intercept(_context: ExecutionContext, next: CallHandler) {
    if (this.active >= 2) problem(503, 'CARGA_OCUPADA', 'Estamos procesando otros archivos. Espera unos segundos y vuelve a adjuntar el PDF.');
    this.active++;
    return next.handle().pipe(finalize(() => { this.active--; }));
  }
}
