import type { MetadataRoute } from "next";

/**
 * Nadie indexa el portal, pero los lectores de VISTA PREVIA sí pueden leer la
 * página de un resultado: sin ellos, un enlace reenviado o pegado en WhatsApp
 * aparece desnudo, sin la tarjeta de la clínica.
 *
 * Es seguro porque esa página no lleva ningún dato del paciente en el HTML
 * del servidor —solo el título y la imagen genéricos— y estos lectores no
 * ejecutan JavaScript: no pueden abrir el informe ni marcarlo como abierto.
 * La indexación la sigue impidiendo `X-Robots-Tag: noindex` (next.config.ts).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: ["facebookexternalhit", "Facebot", "WhatsApp"], allow: "/resultados/", disallow: "/" },
      { userAgent: "*", disallow: "/" },
    ],
  };
}
