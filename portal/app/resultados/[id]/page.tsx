import PatientPortal from "@/components/PatientPortal";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PatientPortal accessId={id} />;
}
