import type { Metadata } from "next";
import PatientPortal from "@/components/PatientPortal";

/*
 * Lo que dice la tarjeta del enlace en WhatsApp. Genérico a propósito: el
 * HTML del servidor nunca lleva datos del paciente (ver `app/robots.ts`).
 */
export const metadata: Metadata = {
  title: "Tu resultado está listo | Clínica Montalvo",
  description: "Ábrelo de forma privada. Enlace personal de Clínica Montalvo.",
  openGraph: {
    title: "Tu resultado está listo",
    description: "Ábrelo de forma privada. Enlace personal de Clínica Montalvo.",
    siteName: "Clínica Montalvo",
    locale: "es_BO",
    type: "website",
    /* Explícita: un `openGraph` propio de la página reemplaza al heredado y
       se llevaba la imagen de `app/resultados/opengraph-image.tsx`. */
    images: [{ url: "/resultados/opengraph-image", width: 1200, height: 630, alt: "Clínica Montalvo · Tu resultado está listo" }],
  },
  twitter: { card: "summary_large_image" },
};

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PatientPortal accessId={id} />;
}
