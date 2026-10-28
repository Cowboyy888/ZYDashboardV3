/**
 * Safe, best-effort conversion of an existing quotation/order line into the
 * editable inputs for a Wire Mesh Order Drawing. Source records are not
 * normalised around drawings, so this deliberately fills only values that can
 * be identified without guessing.
 */
export interface WireMeshPrefillSource {
  customerName: string;
  meshSpecification?: string | null;
  /** An SKU `size` such as `3×6`; SKU sizes are expressed in metres. */
  size?: string | null;
  wireDiameter?: string | null;
  unit?: string | null;
  quantity?: number | null;
  /** Quotation total_sheets is a better sheet-count source than area quantity. */
  totalSheets?: number | null;
}

export interface WireMeshDrawingPrefill {
  customerName: string;
  meshSpecification?: string;
  wireDiameterMm?: number;
  sheetLengthMm?: number;
  sheetWidthMm?: number;
  lengthSpacingMm?: number;
  widthSpacingMm?: number;
  quantity?: number;
}

const NUMBER = String.raw`(\d+(?:\.\d+)?)`;
const TIMES = String.raw`[x×✕✖⨯]`;
const PAIR = new RegExp(
  String.raw`${NUMBER}\s*(mm|m|米)?\s*${TIMES}\s*${NUMBER}\s*(mm|m|米)?`,
  'giu',
);
const EXPLICIT_SPACING = new RegExp(
  String.raw`(?:spacing|opening|hole\s*(?:spacing|size)?|孔距|网孔)\s*[:：=]?\s*${NUMBER}\s*(?:mm)?\s*${TIMES}\s*${NUMBER}\s*(?:mm)?`,
  'iu',
);

function positiveNumber(value: string | null | undefined): number | undefined {
  const match = value?.match(/\d+(?:\.\d+)?/);
  if (!match) return undefined;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function toMillimetres(value: number, unit: string | undefined): number | undefined {
  if (unit === 'mm') return value;
  if (unit === 'm' || unit === '米') return value * 1000;
  return undefined;
}

function firstDimensionPair(text: string | null | undefined, defaultUnit?: 'm' | 'mm') {
  if (!text) return undefined;
  for (const match of text.matchAll(PAIR)) {
    const first = Number(match[1]);
    const second = Number(match[3]);
    const firstUnit = match[2] || defaultUnit;
    const secondUnit = match[4] || firstUnit || defaultUnit;
    const length = toMillimetres(first, firstUnit);
    const width = toMillimetres(second, secondUnit);
    if (length && width) return { sheetLengthMm: length, sheetWidthMm: width };
  }
  return undefined;
}

function spacingPair(text: string | null | undefined) {
  if (!text) return undefined;
  const match = text.match(EXPLICIT_SPACING);
  if (!match) return undefined;
  const first = Number(match[1]);
  const second = Number(match[2]);
  if (!Number.isFinite(first) || !Number.isFinite(second) || first <= 0 || second <= 0)
    return undefined;
  return { lengthSpacingMm: first, widthSpacingMm: second };
}

function isSheetUnit(unit: string | null | undefined) {
  const normalised = (unit ?? '').trim().toLowerCase();
  return normalised === '张' || normalised === 'sheet' || normalised === 'sheets';
}

function wholeSheetCount(value: number | null | undefined) {
  return value != null && Number.isFinite(value) && value > 0 && Number.isInteger(value)
    ? value
    : undefined;
}

/**
 * Returns only trustworthy source values. Callers merge this into their editable
 * form state; a missing source value therefore never overwrites a user value.
 */
export function deriveWireMeshDrawingPrefill(
  source: WireMeshPrefillSource,
): WireMeshDrawingPrefill {
  const meshSpecification = source.meshSpecification?.trim() || undefined;
  const wireDiameterMm = positiveNumber(source.wireDiameter);
  const dimensions =
    firstDimensionPair(source.size, 'm') ?? firstDimensionPair(source.meshSpecification);
  const spacing = spacingPair(source.meshSpecification);
  const quantity =
    wholeSheetCount(source.totalSheets) ??
    (isSheetUnit(source.unit) ? wholeSheetCount(source.quantity) : undefined);

  return {
    customerName: source.customerName,
    ...(meshSpecification ? { meshSpecification } : {}),
    ...(wireDiameterMm ? { wireDiameterMm } : {}),
    ...dimensions,
    ...spacing,
    ...(quantity ? { quantity } : {}),
  };
}
