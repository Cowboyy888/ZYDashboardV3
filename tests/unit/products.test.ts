import { describe, it, expect } from 'vitest';
import {
  buildSkuLabel,
  skuSignature,
  isSameSku,
  isLowStock,
  classifySpecification,
  type SkuAttributes,
} from '@/lib/domain/products';

describe('acceptance #1 — building a product specification (钢筋网 SKU)', () => {
  it('builds a canonical label from attributes incl. optional rod count', () => {
    const attr: SkuAttributes = {
      familyName: '钢筋网',
      diameter: '5.5厘',
      size: '3×6',
      hole: '20孔',
      rodCount: '15根',
      condition: 'normal',
      unit: '张',
    };
    expect(buildSkuLabel(attr, 'en')).toBe('钢筋网 · 5.5厘 | 3×6 | 20孔 | 15根 | Normal (张)');
    expect(buildSkuLabel(attr, 'zh')).toBe('钢筋网 · 5.5厘 | 3×6 | 20孔 | 15根 | 正常 (张)');
  });

  it('omits empty attributes (拔丝料 measured in 捆)', () => {
    const attr: SkuAttributes = {
      familyName: '拔丝料',
      diameter: '10厘',
      condition: 'normal',
      unit: '捆',
    };
    expect(buildSkuLabel(attr, 'en')).toBe('拔丝料 · 10厘 | Normal (捆)');
  });

  it('treats different conditions as distinct SKUs', () => {
    const normal: SkuAttributes = {
      familyName: '钢筋网',
      diameter: '9厘',
      size: '3×6',
      hole: '20孔',
      condition: 'normal',
      unit: '张',
    };
    const old: SkuAttributes = { ...normal, condition: 'old' };
    expect(isSameSku(normal, old)).toBe(false);
    expect(skuSignature(normal)).not.toBe(skuSignature(old));
  });

  it('signature is space/case-insensitive on free-form fields', () => {
    const a: SkuAttributes = {
      familyName: '钢筋网',
      diameter: '9厘',
      size: '3×6',
      hole: '20孔',
      condition: 'normal',
      unit: '张',
    };
    const b: SkuAttributes = { ...a, size: ' 3×6 ' };
    expect(isSameSku(a, b)).toBe(true);
  });
});

describe('low-stock detection', () => {
  it('flags balances at or below the minimum level', () => {
    expect(isLowStock(10, 20)).toBe(true);
    expect(isLowStock(20, 20)).toBe(true);
    expect(isLowStock(21, 20)).toBe(false);
  });

  it('never flags when no minimum is configured', () => {
    expect(isLowStock(0, null)).toBe(false);
    expect(isLowStock(0, 0)).toBe(false);
  });
});

describe('classifySpecification — Standard vs Special, computed from size', () => {
  it('classifies the two bulk sheet sizes as Standard', () => {
    expect(classifySpecification('3×6')).toBe('standard');
    expect(classifySpecification('2.4×6')).toBe('standard');
  });

  it('classifies every other size as Special', () => {
    expect(classifySpecification('2×6')).toBe('special'); // close, but not one of the two exact sizes
    expect(classifySpecification('4×8')).toBe('special');
    expect(classifySpecification('custom')).toBe('special');
    expect(classifySpecification(null)).toBe('special'); // wire/coil SKUs have no size at all
  });

  it('is tolerant of "x"/"×"/"X", whitespace, and a trailing m/米 unit suffix', () => {
    expect(classifySpecification('3x6')).toBe('standard');
    expect(classifySpecification('3X6')).toBe('standard');
    expect(classifySpecification(' 3 × 6 ')).toBe('standard');
    expect(classifySpecification('2.4 x 6 m')).toBe('standard');
    expect(classifySpecification('2.4×6米')).toBe('standard');
  });
});
