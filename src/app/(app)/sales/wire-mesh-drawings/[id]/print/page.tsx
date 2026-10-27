import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth';
import { getWireMeshDrawing } from '@/lib/db/queries';
import { WireMeshPrint } from './wire-mesh-print';

export default async function WireMeshPrintPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('sales:view');
  const { id } = await params;
  const drawing = await getWireMeshDrawing(id);
  if (!drawing) notFound();
  return <WireMeshPrint drawing={drawing} />;
}
