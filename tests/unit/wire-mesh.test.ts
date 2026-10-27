import { describe, expect, it } from 'vitest';
import { calculateWireMesh } from '@/lib/domain/wire-mesh';

const input = {
  sheetLengthMm: 3000,
  sheetWidthMm: 1500,
  lengthSpacingMm: 200,
  widthSpacingMm: 200,
  overhangLeftMm: 100,
  overhangRightMm: 100,
  overhangTopMm: 50,
  overhangBottomMm: 50,
  quantity: 3,
};

describe('calculateWireMesh', () => {
  it('calculates exact wire counts and areas from outside dimensions', () => {
    const result = calculateWireMesh(input);
    expect(result.errors).toEqual([]);
    expect(result.lengthWireCount).toBe(15);
    expect(result.widthWireCount).toBe(8);
    expect(result.areaPerSheetM2).toBe(4.5);
    expect(result.totalAreaM2).toBe(13.5);
  });
  it('flags an inexact spacing fit instead of rounding a wire count', () => {
    const result = calculateWireMesh({ ...input, lengthSpacingMm: 210 });
    expect(result.lengthWireCount).toBeNull();
    expect(result.errors).toHaveLength(1);
  });
});
