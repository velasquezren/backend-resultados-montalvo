import { ImageResponse } from "next/og";
import { ISOTIPO_VERDE } from "@/lib/marca";

/* El ícono si el paciente guarda la página en el inicio del teléfono. */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "white" }}>
        <img src={ISOTIPO_VERDE} width={132} height={132} alt="" />
      </div>
    ),
    size,
  );
}
