import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
const MAGIC = Buffer.from('MNTV1');
export function sealPdf(value: Buffer, keyHex: string, objectKey: string): Buffer {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), nonce);
  cipher.setAAD(Buffer.from(objectKey));
  const ciphertext = Buffer.concat([cipher.update(value), cipher.final()]);
  return Buffer.concat([MAGIC, nonce, cipher.getAuthTag(), ciphertext]);
}
export function openPdf(value: Buffer, keyHex: string, objectKey: string): Buffer {
  if (value.length < 34 || !value.subarray(0, 5).equals(MAGIC)) throw new Error('archivo_cifrado_invalido');
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), value.subarray(5, 17));
  decipher.setAAD(Buffer.from(objectKey));
  decipher.setAuthTag(value.subarray(17, 33));
  return Buffer.concat([decipher.update(value.subarray(33)), decipher.final()]);
}
