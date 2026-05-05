/**
 * Browser-side helper to trigger a JSON file download from a JS object.
 *
 * Lives in `features/backup` rather than `lib/` because it's currently the
 * only consumer. Promote if a second feature needs it.
 *
 * The Blob URL is revoked on a microtask after the synthetic click so we
 * don't leak it; the click happens synchronously inside the call so the
 * browser ties the download to the user gesture that triggered it.
 */

export function downloadJson(filename: string, payload: unknown): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke after a tick so Chrome has fully started the download.
  queueMicrotask(() => URL.revokeObjectURL(url));
}

/**
 * Read a user-picked file (from `<input type="file">`) as parsed JSON.
 * Throws `SyntaxError` for invalid JSON.
 */
export async function readJsonFile(file: File): Promise<unknown> {
  const text = await file.text();
  return JSON.parse(text);
}
