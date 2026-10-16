import { pdfDelPaciente } from "@/lib/patient-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return pdfDelPaciente(request, (await context.params).id);
}

// Los sondeos no crean sesiones ni descargan documentos clínicos.
export function HEAD() {
  return new Response(null, { status: 405, headers: { Allow: "GET", "Cache-Control": "no-store" } });
}
