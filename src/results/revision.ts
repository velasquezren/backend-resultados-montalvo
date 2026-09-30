import { createHmac } from 'node:crypto';
import { equalSecret } from '../auth/crypto';

/**
 * Enlace de revisión: lo que abre la asistente desde el CRM para ver QUÉ
 * informe va a enviar, en el visor del portal —igual que el médico—, sin
 * cuenta propia en el portal y sin tocar el acceso del paciente.
 *
 * Es una firma, no una sesión: `<informeId>.<vence>.<hmac>`. Así no hay nada
 * que guardar ni que purgar, y el CRM no recibe nunca el PDF: solo el enlace.
 *
 * - Dura 10 minutos: lo justo para mirar el informe. Si queda en el historial
 *   de una computadora compartida de la clínica, a los 10 minutos ya no abre.
 * - Solo abre informes PUBLICADOS: un retiro lo corta al instante.
 * - No marca `abiertoEn`: esa marca dice que lo vio la PACIENTE.
 *
 * La clave es la del servicio (`SESSION_HMAC_KEY`) con un prefijo propio, para
 * que una firma de revisión nunca valga como otra cosa.
 */
export const DURACION_REVISION_MS = 10 * 60_000;

const PREFIJO = 'revision-crm';
const FORMA = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(\d{10})\.([A-Za-z0-9_-]{43})$/;

function firma(informeId: string, venceSegundos: number, clave: string): string {
  return createHmac('sha256', clave).update(`${PREFIJO}.${informeId}.${venceSegundos}`).digest('base64url');
}

export function firmarRevision(informeId: string, venceEn: Date, clave: string): string {
  const vence = Math.floor(venceEn.getTime() / 1000);
  return `${informeId}.${vence}.${firma(informeId, vence, clave)}`;
}

/** El informe que autoriza el enlace, o `null` si está mal formado, adulterado o vencido. */
export function leerRevision(enlace: string, clave: string, ahora = new Date()): string | null {
  const partes = FORMA.exec(enlace);
  if (!partes) return null;
  const [, informeId, vence, recibida] = partes as unknown as [string, string, string, string];
  if (!equalSecret(recibida, firma(informeId, Number(vence), clave))) return null;
  return Number(vence) * 1000 > ahora.getTime() ? informeId : null;
}
