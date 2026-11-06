import type { Metadata } from "next";
import PatientPortal from "@/components/PatientPortal";

/*
 * Lo que dice la tarjeta del enlace en WhatsApp. Genérico a propósito, como en
 * `/resultados/`: el HTML del servidor nunca lleva datos del paciente.
 */
export const metadata: Metadata = {
  title: "Tu resultado está listo | Laboratorio Climon",
  description: "Ábrelo de forma privada. Enlace personal de Laboratorio Climon.",
  openGraph: {
    title: "Tu resultado está listo",
    description: "Ábrelo de forma privada. Enlace personal de Laboratorio Climon.",
    siteName: "Laboratorio Climon",
    locale: "es_BO",
    type: "website",
    images: [{ url: "/laboratorio/opengraph-image", width: 1200, height: 630, alt: "Laboratorio Climon · Tu resultado está listo" }],
  },
  twitter: { card: "summary_large_image" },
};

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PatientPortal accessId={id} marca="climon" />;
}
