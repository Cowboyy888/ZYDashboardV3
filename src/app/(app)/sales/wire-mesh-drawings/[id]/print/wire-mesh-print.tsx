'use client';
import { useEffect } from 'react';
import { WireMeshPreview } from '@/components/wire-mesh-preview';
import { calculateWireMesh } from '@/lib/domain/wire-mesh';
import type { WireMeshDrawingRow } from '@/lib/db/types';

export function WireMeshPrint({ drawing }: { drawing: WireMeshDrawingRow }) {
  const input = {
    sheetLengthMm: drawing.sheet_length_mm,
    sheetWidthMm: drawing.sheet_width_mm,
    lengthSpacingMm: drawing.length_spacing_mm,
    widthSpacingMm: drawing.width_spacing_mm,
    overhangLeftMm: drawing.overhang_left_mm,
    overhangRightMm: drawing.overhang_right_mm,
    overhangTopMm: drawing.overhang_top_mm,
    overhangBottomMm: drawing.overhang_bottom_mm,
    quantity: drawing.quantity,
  };
  const calculation = calculateWireMesh(input);
  useEffect(() => {
    window.print();
  }, []);
  return (
    <main className="mx-auto max-w-6xl p-6 print:p-0">
      <h1 className="text-xl font-bold text-primary">ZY STEEL · WIRE MESH ORDER DRAWING</h1>
      <p className="mb-4 text-sm">
        {drawing.customer_name} · {drawing.mesh_specification} · Ø{drawing.wire_diameter_mm} mm
      </p>
      <WireMeshPreview input={input} />
      <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <p>
          Length × width: {drawing.sheet_length_mm} × {drawing.sheet_width_mm} mm
        </p>
        <p>
          Wires: {calculation.lengthWireCount} × {calculation.widthWireCount}
        </p>
        <p>Quantity: {drawing.quantity}</p>
        <p>Total area: {calculation.totalAreaM2.toFixed(3)} m²</p>
      </div>
    </main>
  );
}
