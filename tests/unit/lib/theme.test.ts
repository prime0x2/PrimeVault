import { describe, expect, it } from 'vitest';
import { applyTheme } from '~/lib/theme';

/**
 * The runtime environment is `node`, so there's no `document`. The
 * `applyTheme` helper accepts an injected root element; we hand it a
 * minimal stub that exposes only the `classList` surface area it touches.
 * Casting through `unknown` keeps TS quiet without adding jsdom as a dep
 * for one tiny module.
 */
function makeRoot(): { el: HTMLElement; classes: Set<string> } {
  const classes = new Set<string>();
  const stub = {
    classList: {
      add: (...names: string[]) => {
        for (const n of names) classes.add(n);
      },
      remove: (...names: string[]) => {
        for (const n of names) classes.delete(n);
      },
      contains: (n: string) => classes.has(n),
    },
  };
  return { el: stub as unknown as HTMLElement, classes };
}

describe('applyTheme', () => {
  it('adds .dark when theme is dark', () => {
    const { el, classes } = makeRoot();
    applyTheme('dark', el);
    expect(classes.has('dark')).toBe(true);
    expect(classes.has('light')).toBe(false);
  });

  it('adds .light when theme is light', () => {
    const { el, classes } = makeRoot();
    applyTheme('light', el);
    expect(classes.has('light')).toBe(true);
    expect(classes.has('dark')).toBe(false);
  });

  it('removes both classes when theme is system', () => {
    const { el, classes } = makeRoot();
    classes.add('dark');
    applyTheme('system', el);
    expect(classes.has('dark')).toBe(false);
    expect(classes.has('light')).toBe(false);
  });

  it('is idempotent', () => {
    const { el, classes } = makeRoot();
    applyTheme('dark', el);
    applyTheme('dark', el);
    expect(classes.size).toBe(1);
    expect(classes.has('dark')).toBe(true);
  });

  it('switches cleanly between themes', () => {
    const { el, classes } = makeRoot();
    applyTheme('dark', el);
    applyTheme('light', el);
    expect(classes.has('dark')).toBe(false);
    expect(classes.has('light')).toBe(true);
  });
});
