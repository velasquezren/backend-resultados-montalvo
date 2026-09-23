import { ImageResponse } from "next/og";
import { ISOTIPO_BLANCO } from "@/lib/marca";

/*
 * La tarjeta que muestra WhatsApp cuando el enlace de un resultado se pega o
 * se reenvía. Es la MISMA para todos: nunca lleva el nombre del paciente ni el
 * estudio, porque la ve cualquiera que reciba el enlace reenviado.
 * 1200×630 (1,91:1) es lo que WhatsApp muestra a todo el ancho sin recortar.
 */
export const alt = "Clínica Montalvo · Tu resultado está listo";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "linear-gradient(135deg, #006156 0%, #00453d 100%)",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <img src={ISOTIPO_BLANCO} width={88} height={88} alt="" />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 26, letterSpacing: 8, opacity: 0.85 }}>CLÍNICA</span>
            <span style={{ fontSize: 44, fontWeight: 700, letterSpacing: 4 }}>MONTALVO</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <span style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.1 }}>Tu resultado está listo</span>
          <span style={{ fontSize: 32, opacity: 0.85 }}>Ábrelo de forma privada con un toque</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 24, opacity: 0.8 }}>
          <div style={{ width: 14, height: 14, borderRadius: 7, background: "#39ada3" }} />
          Portal de resultados · Enlace personal
        </div>
      </div>
    ),
    size,
  );
}
