/**
 * Qué bytes pidió el navegador en la cabecera `Range`.
 *
 * No es opcional para los videos: Safari en el iPhone pide `bytes=0-1` antes
 * de reproducir, y si recibe el archivo entero con 200 en vez de un 206 no lo
 * reproduce. Los demás navegadores lo usan para adelantar sin bajar todo.
 *
 * - `null`: no pidió rango (o pidió varios, que se sirven enteros: el
 *   estándar lo permite y ningún reproductor los necesita).
 * - `'invalido'`: un rango que no cabe en el archivo → 416.
 */
export type Rango = { inicio: number; fin: number };

export function rangoPedido(cabecera: string | undefined, tamano: number): Rango | 'invalido' | null {
  if (!cabecera) return null;
  const pedido = /^bytes=(\d*)-(\d*)$/.exec(cabecera.trim());
  if (!pedido) return cabecera.includes(',') ? null : 'invalido';
  const [, desde, hasta] = pedido;
  if (desde === '' && hasta === '') return 'invalido';
  if (desde === '') {
    // `bytes=-500`: los últimos 500.
    const ultimos = Number(hasta);
    if (ultimos === 0) return 'invalido';
    return { inicio: Math.max(0, tamano - ultimos), fin: tamano - 1 };
  }
  const inicio = Number(desde);
  const fin = hasta === '' ? tamano - 1 : Math.min(Number(hasta), tamano - 1);
  if (!Number.isSafeInteger(inicio) || inicio >= tamano || fin < inicio) return 'invalido';
  return { inicio, fin };
}
