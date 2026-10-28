import { describe, expect, it } from 'vitest';
import { deriveWireMeshDrawingPrefill } from '@/lib/domain/wire-mesh-prefill';

describe('deriveWireMeshDrawingPrefill', () => {
  it('prefills trustworthy quotation line values, including explicitly labelled spacing', () => {
    expect(
      deriveWireMeshDrawingPrefill({
        customerName: 'Acme Construction',
        meshSpecification: 'Welded mesh 6 m × 2.4 m; spacing 200 × 200 mm',
        wireDiameter: '6 mm',
        unit: 'm²',
        quantity: 4320,
        totalSheets: 300,
      }),
    ).toEqual({
      customerName: 'Acme Construction',
      meshSpecification: 'Welded mesh 6 m × 2.4 m; spacing 200 × 200 mm',
      wireDiameterMm: 6,
      sheetLengthMm: 6000,
      sheetWidthMm: 2400,
      lengthSpacingMm: 200,
      widthSpacingMm: 200,
      quantity: 300,
    });
  });

  it('uses a sheet SKU size and ordered sheet quantity from a sales order', () => {
    expect(
      deriveWireMeshDrawingPrefill({
        customerName: 'Zysteel Customer',
        meshSpecification: '9厘 | 3×6 | 20孔',
        size: '3×6',
        wireDiameter: '9厘',
        unit: '张',
        quantity: 200,
      }),
    ).toMatchObject({
      customerName: 'Zysteel Customer',
      meshSpecification: '9厘 | 3×6 | 20孔',
      wireDiameterMm: 9,
      sheetLengthMm: 3000,
      sheetWidthMm: 6000,
      quantity: 200,
    });
  });

  it('does not guess sheet quantity from an area line or spacing from an unlabelled pair', () => {
    expect(
      deriveWireMeshDrawingPrefill({
        customerName: 'Careful Customer',
        meshSpecification: 'Welded mesh 200 × 200',
        unit: 'm²',
        quantity: 400,
      }),
    ).toEqual({
      customerName: 'Careful Customer',
      meshSpecification: 'Welded mesh 200 × 200',
    });
  });
});
