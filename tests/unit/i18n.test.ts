import { describe, it, expect } from 'vitest';
import {
  dictionary,
  t,
  tf,
  localizeMessage,
  DEFAULT_LOCALE,
  LOCALES,
  isLocale,
  type MessageKey,
} from '@/lib/i18n';
import { STATUS_LABELS } from '@/lib/domain/attendance';
import { CONDITION_LABELS } from '@/lib/domain/products';
import { ROLE_LABELS } from '@/lib/domain/rbac';

describe('i18n defaults', () => {
  it('defaults to English', () => {
    expect(DEFAULT_LOCALE).toBe('en');
  });
  it('recognises supported locales', () => {
    expect(LOCALES).toEqual(['en', 'zh']);
    expect(isLocale('en')).toBe(true);
    expect(isLocale('zh')).toBe(true);
    expect(isLocale('fr')).toBe(false);
  });
});

describe('dictionary completeness', () => {
  it('every key has non-empty English and Chinese values', () => {
    const entries = Object.entries(dictionary);
    expect(entries.length).toBeGreaterThan(80);
    for (const [key, value] of entries) {
      expect(value.en, `${key}.en`).toBeTruthy();
      expect(value.zh, `${key}.zh`).toBeTruthy();
    }
  });

  it('domain label maps are fully bilingual', () => {
    for (const v of Object.values(STATUS_LABELS)) {
      expect(v.en).toBeTruthy();
      expect(v.zh).toBeTruthy();
    }
    for (const v of Object.values(CONDITION_LABELS)) {
      expect(v.en).toBeTruthy();
      expect(v.zh).toBeTruthy();
    }
    for (const v of Object.values(ROLE_LABELS)) {
      expect(v.en).toBeTruthy();
      expect(v.zh).toBeTruthy();
    }
  });
});

describe('translation', () => {
  it('resolves keys per locale', () => {
    expect(t('en', 'nav.dashboard')).toBe('Dashboard');
    expect(t('zh', 'nav.dashboard')).toBe('仪表盘');
    expect(t('en', 'nav.settings')).toBe('Settings');
    expect(t('zh', 'nav.settings')).toBe('设置');
  });

  it('interpolates placeholders', () => {
    expect(tf('en', 'cs.scoped', { pass: 'second pass' })).toContain('second pass');
    expect(tf('zh', 'cs.scoped', { pass: '第二阶段' })).toContain('第二阶段');
  });

  it('falls back to the key when missing', () => {
    expect(t('en', 'does.not.exist' as MessageKey)).toBe('does.not.exist');
  });
});

describe('action/validation message localisation', () => {
  it('passes English through and translates known Chinese phrases', () => {
    expect(localizeMessage('en', 'Saved')).toBe('Saved');
    expect(localizeMessage('zh', 'Saved')).toBe('已保存');
    expect(localizeMessage('zh', 'Validation failed')).toBe('数据校验失败');
    expect(localizeMessage('zh', 'Employee added')).toBe('已新增员工');
  });

  it('leaves unknown/interpolated phrases unchanged', () => {
    expect(localizeMessage('zh', 'Marked 12 present')).toBe('Marked 12 present');
  });
});
