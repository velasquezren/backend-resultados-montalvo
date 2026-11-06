import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

/*
 * La tarjeta que muestra WhatsApp cuando se pega o reenvía el enlace de un
 * resultado de laboratorio. La MISMA para todos, como la de la clínica: nunca
 * lleva el nombre del paciente ni el estudio. Blanca, como la identidad de
 * Climon, con su logo oficial (`public/climon/logo.png`, sin alterar).
 */
export const alt = "Laboratorio Climon · Tu resultado está listo";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const logo = `data:image/png;base64,${(await readFile(join(process.cwd(), "public/climon/logo.png"))).toString("base64")}`;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          gap: 64,
          padding: "0 88px 0 72px",
          background: "white",
          borderLeft: "16px solid #006156",
          color: "#14201e",
          fontFamily: "sans-serif",
        }}
      >
        <img src={logo} width={380} height={380} alt="" />
        <div style={{ display: "flex", flexDirection: "column", gap: 20, flex: 1 }}>
          <span style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.1 }}>Tu resultado está listo</span>
          <span style={{ fontSize: 30, color: "#4a5a57" }}>Ábrelo de forma privada con un toque</span>
          <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 24, color: "#4a5a57", marginTop: 24 }}>
            <div style={{ width: 14, height: 14, borderRadius: 7, background: "#39ada3" }} />
            Resultados de laboratorio · Enlace personal
          </div>
        </div>
      </div>
    ),
    size,
  );
}
