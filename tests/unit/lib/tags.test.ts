import { describe, expect, it } from 'vitest';
import {
  MAX_TAG_LENGTH,
  MAX_TAGS,
  normalizeTag,
  normalizeTags,
} from '~/lib/tags';

describe('normalizeTag', () => {
  it('trims and lowercases', () => {
    expect(normalizeTag('  GitHub  ')).toBe('github');
  });

  it('replaces internal whitespace with a dash', () => {
    expect(normalizeTag('Personal Project')).toBe('personal-project');
  });

  it('returns empty for an all-whitespace input', () => {
    expect(normalizeTag('   ')).toBe('');
  });

  it('returns empty for a too-long input', () => {
    expect(normalizeTag('x'.repeat(MAX_TAG_LENGTH + 1))).toBe('');
  });

  it('is idempotent', () => {
    const a = normalizeTag('  GitHub Token ');
    expect(normalizeTag(a)).toBe(a);
  });
});

describe('normalizeTags', () => {
  it('normalizes each tag, drops empties, preserves order', () => {
    expect(normalizeTags(['Work', '  ', 'Home'])).toEqual(['work', 'home']);
  });

  it('dedupes case-insensitively', () => {
    expect(normalizeTags(['GitHub', 'github', 'GITHUB'])).toEqual(['github']);
  });

  it(`caps at ${MAX_TAGS} tags`, () => {
    const lots = Array.from({ length: MAX_TAGS + 5 }, (_, i) => `t${i}`);
    expect(normalizeTags(lots)).toHaveLength(MAX_TAGS);
  });

  it('drops a tag that exceeds MAX_TAG_LENGTH', () => {
    expect(normalizeTags(['ok', 'x'.repeat(MAX_TAG_LENGTH + 1)])).toEqual([
      'ok',
    ]);
  });
});
