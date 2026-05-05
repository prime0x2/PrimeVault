/**
 * createClipboardClearer drives chrome.alarms + chrome.offscreen +
 * chrome.runtime.sendMessage from the SW. None of those exist in node, so
 * the module takes them as injected interfaces and we mock here.
 *
 * We're testing the orchestration logic — not the actual clipboard write
 * (that lives in the offscreen entrypoint and runs in a real browser).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CLIPBOARD_ALARM_NAME,
  type ClipboardClearer,
  createClipboardClearer,
} from '../../src/messaging/clipboard';

interface AlarmsCall {
  method: 'clear' | 'create';
  name: string;
  info?: { when?: number; delayInMinutes?: number };
}

function makeFakes() {
  const alarmsLog: AlarmsCall[] = [];
  const alarms = {
    clear: vi.fn(async (name: string) => {
      alarmsLog.push({ method: 'clear', name });
    }),
    create: vi.fn(
      async (
        name: string,
        info: { when?: number; delayInMinutes?: number },
      ) => {
        alarmsLog.push({ method: 'create', name, info });
      },
    ),
  };

  let docOpen = false;
  const offscreen = {
    hasDocument: vi.fn(async () => docOpen),
    createDocument: vi.fn(async () => {
      docOpen = true;
    }),
    closeDocument: vi.fn(async () => {
      docOpen = false;
    }),
  };

  const runtime = {
    sendMessage: vi.fn(async () => ({ ok: true })),
  };

  let nowMs = 1_000_000;
  const now = () => nowMs;
  function advance(ms: number): void {
    nowMs += ms;
  }

  return { alarms, alarmsLog, offscreen, runtime, now, advance };
}

function build(): {
  clearer: ClipboardClearer;
  fakes: ReturnType<typeof makeFakes>;
} {
  const fakes = makeFakes();
  const clearer = createClipboardClearer({
    alarms: fakes.alarms,
    offscreen: fakes.offscreen,
    runtime: fakes.runtime,
    offscreenUrl: '/offscreen.html',
    now: fakes.now,
  });
  return { clearer, fakes };
}

describe('createClipboardClearer — schedule', () => {
  let env: ReturnType<typeof build>;

  beforeEach(() => {
    env = build();
  });

  it('clears any prior alarm before creating a new one', async () => {
    const before = env.fakes.now();
    await env.clearer.schedule(30_000);
    expect(env.fakes.alarmsLog).toEqual([
      { method: 'clear', name: CLIPBOARD_ALARM_NAME },
      {
        method: 'create',
        name: CLIPBOARD_ALARM_NAME,
        info: { when: before + 30_000 },
      },
    ]);
  });

  it('uses now() + delayMs as the alarm `when`', async () => {
    const before = env.fakes.now();
    await env.clearer.schedule(45_000);
    const created = env.fakes.alarmsLog.find((c) => c.method === 'create');
    expect(created?.info?.when).toBe(before + 45_000);
  });

  it('cancels (no create) when delayMs is 0', async () => {
    await env.clearer.schedule(0);
    expect(env.fakes.alarms.clear).toHaveBeenCalledOnce();
    expect(env.fakes.alarms.create).not.toHaveBeenCalled();
  });

  it('cancels (no create) for negative or non-finite values', async () => {
    await env.clearer.schedule(-100);
    await env.clearer.schedule(Number.NaN);
    await env.clearer.schedule(Number.POSITIVE_INFINITY);
    expect(env.fakes.alarms.create).not.toHaveBeenCalled();
  });

  it('a second schedule clears + recreates (reset behavior)', async () => {
    await env.clearer.schedule(30_000);
    env.fakes.advance(5_000);
    await env.clearer.schedule(30_000);
    const creates = env.fakes.alarmsLog.filter((c) => c.method === 'create');
    expect(creates).toHaveLength(2);
    expect(creates[0]?.info?.when).toBe(1_000_000 + 30_000);
    expect(creates[1]?.info?.when).toBe(1_005_000 + 30_000);
  });
});

describe('createClipboardClearer — fire', () => {
  let env: ReturnType<typeof build>;

  beforeEach(() => {
    env = build();
  });

  it('creates an offscreen doc if one does not exist, then sends the clear message', async () => {
    await env.clearer.fire();
    expect(env.fakes.offscreen.hasDocument).toHaveBeenCalled();
    expect(env.fakes.offscreen.createDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/offscreen.html',
        reasons: ['CLIPBOARD'],
      }),
    );
    expect(env.fakes.runtime.sendMessage).toHaveBeenCalledWith({
      target: 'offscreen',
      kind: 'clearClipboard',
    });
  });

  it('skips createDocument when one already exists', async () => {
    env.fakes.offscreen.hasDocument.mockResolvedValueOnce(true);
    await env.clearer.fire();
    expect(env.fakes.offscreen.createDocument).not.toHaveBeenCalled();
    expect(env.fakes.runtime.sendMessage).toHaveBeenCalled();
  });

  it('closes the offscreen doc after the message round-trip', async () => {
    await env.clearer.fire();
    expect(env.fakes.offscreen.closeDocument).toHaveBeenCalled();
  });

  it('still closes the doc when sendMessage rejects', async () => {
    env.fakes.runtime.sendMessage.mockRejectedValueOnce(new Error('boom'));
    await expect(env.clearer.fire()).rejects.toThrow('boom');
    expect(env.fakes.offscreen.closeDocument).toHaveBeenCalled();
  });
});

describe('createClipboardClearer — isClearAlarm', () => {
  it('matches our alarm name', () => {
    const { clearer } = build();
    expect(clearer.isClearAlarm(CLIPBOARD_ALARM_NAME)).toBe(true);
    expect(clearer.isClearAlarm('something-else')).toBe(false);
  });
});
