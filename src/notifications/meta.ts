import { Injectable } from '@nestjs/common';

export type DeliveryResult = { estado: 'ACEPTADO'; metaId: string } | { estado: 'FALLIDO'; codigo?: number; reintentable: boolean } | { estado: 'INCIERTO' };
export interface NotificationInput { id: string; intento: number; telefono: string; accesoId: string; }
export interface NotificationTransport { send(input: NotificationInput): Promise<DeliveryResult>; }
export const TRANSPORT = Symbol('TRANSPORT');
export const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

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
          template: { name: process.env.WHATSAPP_TEMPLATE, language: { code: process.env.WHATSAPP_TEMPLATE_LANGUAGE ?? 'es' },
            components: [{ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: input.accesoId }] }] } }),
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
