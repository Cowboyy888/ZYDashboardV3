/** Stable lookup code; an inquiry remains the single opportunity through edits. */
export const STOCKOUT_REASON_CODE = 'stock_unavailable';

export function stockoutFieldErrors(input: {
  diameter?: string;
  sheetSize?: string;
  meshOpening?: string;
  quantity?: number;
}): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!input.diameter?.trim())
    errors.diameter = 'Wire diameter is required for a stockout request.';
  if (!input.sheetSize?.trim()) errors.sheetSize = 'Panel size is required for a stockout request.';
  if (!input.meshOpening?.trim())
    errors.meshOpening = 'Mesh spacing is required for a stockout request.';
  if (input.quantity == null || !Number.isFinite(input.quantity) || input.quantity <= 0) {
    errors.quantity = 'Requested quantity must be greater than zero for a stockout request.';
  }
  return errors;
}
