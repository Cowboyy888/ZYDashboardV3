export interface WireMeshInput {
  sheetLengthMm: number;
  sheetWidthMm: number;
  lengthSpacingMm: number;
  widthSpacingMm: number;
  overhangLeftMm: number;
  overhangRightMm: number;
  overhangTopMm: number;
  overhangBottomMm: number;
  quantity: number;
}

export interface WireMeshCalculation {
  errors: string[];
  lengthWireCount: number | null;
  widthWireCount: number | null;
  areaPerSheetM2: number;
  totalAreaM2: number;
}

const EPSILON = 1e-8;

function wireCount(
  dimension: number,
  firstEdge: number,
  secondEdge: number,
  spacing: number,
  axis: string,
) {
  const span = dimension - firstEdge - secondEdge;
  if (span <= 0)
    return {
      count: null,
      error: `${axis} edge overhangs must be smaller than the sheet dimension.`,
    };
  const intervals = span / spacing;
  const rounded = Math.round(intervals);
  if (Math.abs(intervals - rounded) > EPSILON) {
    return {
      count: null,
      error: `${axis} spacing does not fit the sheet and edge overhangs exactly.`,
    };
  }
  return { count: rounded + 1, error: null };
}

/**
 * Dimensions are outside sheet dimensions. Edge overhangs run from the sheet
 * edge to the outer wire centreline, so an exact number of spacing intervals
 * must remain between the first and last wire. Never rounds a measurement.
 */
export function calculateWireMesh(input: WireMeshInput): WireMeshCalculation {
  const length = wireCount(
    input.sheetLengthMm,
    input.overhangLeftMm,
    input.overhangRightMm,
    input.lengthSpacingMm,
    'Length-direction',
  );
  const width = wireCount(
    input.sheetWidthMm,
    input.overhangTopMm,
    input.overhangBottomMm,
    input.widthSpacingMm,
    'Width-direction',
  );
  return {
    errors: [length.error, width.error].filter((message): message is string => Boolean(message)),
    lengthWireCount: length.count,
    widthWireCount: width.count,
    areaPerSheetM2: (input.sheetLengthMm * input.sheetWidthMm) / 1_000_000,
    totalAreaM2: (input.sheetLengthMm * input.sheetWidthMm * input.quantity) / 1_000_000,
  };
}
