import { Injectable } from '@nestjs/common';

export type DeliveryResult = { estado: 'ACEPTADO'; metaId: string } | { estado: 'FALLIDO'; codigo?: number; reintentable: boolean } | { estado: 'INCIERTO' };
export interface NotificationInput { id: string; intento: number; telefono: string; accesoId: string; }
export interface NotificationTransport { send(input: NotificationInput): Promise<DeliveryResult>; }
export const TRANSPORT = Symbol('TRANSPORT');
export const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Arma el objeto `template` del envío. Se exporta aparte de `send` para poder
 * comprobar su forma sin llamar a Meta.
 *
 * Dos variantes, según la plantilla que Meta haya aprobado:
 *
 * - **Con botón URL** (`WHATSAPP_TEMPLATE_BOTON` ausente o `true`, el valor por
 *   omisión): un único componente de botón en índice 0 cuyo parámetro es el ID
 *   de acceso. El cuerpo de la plantilla no puede llevar variables.
 * - **Sin botón** (`false`): se envía la plantilla pelada, sin componentes. El
 *   paciente no recibe el enlace en este mensaje; lo pide respondiendo, y
 *   recepción se lo entrega dentro de la ventana de 24 horas.
 *
 * Mandar un componente que la plantilla aprobada no tiene —o no mandar el que
 * sí tiene— hace fallar el envío por número de parámetros. Por eso la variante
 * es explícita y no se adivina.
 */
export function templatePayload(input: NotificationInput): Record<string, unknown> {
  const conBoton = process.env.WHATSAPP_TEMPLATE_BOTON !== 'false';
  return {
    name: process.env.WHATSAPP_TEMPLATE,
    language: { code: process.env.WHATSAPP_TEMPLATE_LANGUAGE ?? 'es' },
    ...(conBoton ? { components: [{ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: input.accesoId }] }] } : {}),
  };
}

@Injectable()
export class MetaTransport implements NotificationTransport {
  async send(input: NotificationInput): Promise<DeliveryResult> {
    try {
      const version = process.env.META_GRAPH_VERSION ?? 'v25.0';
      if (!/^v\d+\.\d+$/.test(version)) throw new Error('version_invalida');
      const response = await fetch(`https://graph.facebook.com/${version}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
        method: 'POST', headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(15_000),
        body: JSON.stringify({ messaging_product: 'whatsapp', to: input.telefono.replace(/^\+/, ''), type: 'template',
          biz_opaque_callback_data: `${input.id}:${input.intento}`,
          template: templatePayload(input) }),
      });
      const data: unknown = await response.json();
      if (response.ok && record(data) && Array.isArray(data.messages) && record(data.messages[0]) && typeof data.messages[0].id === 'string') return { estado: 'ACEPTADO', metaId: data.messages[0].id };
      if (!response.ok && record(data) && record(data.error) && typeof data.error.code === 'number') {
        return { estado: 'FALLIDO', codigo: data.error.code, reintentable: [4, 17, 32, 613, 130429].includes(data.error.code) };
      }
      return { estado: 'INCIERTO' };
    } catch { return { estado: 'INCIERTO' }; }
  }
}
