import { ImageResponse } from "next/og";
import { ISOTIPO_BLANCO } from "@/lib/marca";

/*
 * Imagen de CABECERA del mensaje de WhatsApp «tu informe está listo», para la
 * plantilla con encabezado de imagen (ver docs/plantillas-whatsapp.md en el
 * CRM). Meta la descarga en cada envío desde esta URL: tiene que ser pública,
 * https y estable. Genérica: la ve cualquiera que reciba el mensaje.
 * 1200×628 (1,91:1), la proporción que WhatsApp muestra sin recortar.
 */
export const dynamic = "force-static";

export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          padding: "0 90px",
          gap: 70,
          background: "linear-gradient(135deg, #006156 0%, #00453d 100%)",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 260,
            height: 260,
            borderRadius: 130,
            background: "rgba(255,255,255,0.08)",
            border: "2px solid rgba(255,255,255,0.18)",
          }}
        >
          <img src={ISOTIPO_BLANCO} width={170} height={170} alt="" />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <span style={{ fontSize: 26, letterSpacing: 8, opacity: 0.8 }}>CLÍNICA MONTALVO</span>
          <span style={{ fontSize: 64, lineHeight: 1.1 }}>Tu informe médico</span>
          <span style={{ fontSize: 64, lineHeight: 1.1, color: "#9fe0d8" }}>está listo</span>
          <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 24, opacity: 0.85 }}>
            <div style={{ width: 12, height: 12, borderRadius: 6, background: "#39ada3" }} />
            Privado · Ábrelo con un toque
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 628, headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
