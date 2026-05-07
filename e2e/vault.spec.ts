/**
 * E2E: lock / unlock / wrong-password / add-entry / search.
 *
 * Each test creates a fresh vault, then exercises the vault path. The
 * first test in the file does setup; later tests share a context but
 * each has its own profile via the fixture.
 */
import { expect, test } from './fixtures';

const PW = 'correct-horse-battery-staple-9!';

async function onboard(popup: import('@playwright/test').Page): Promise<void> {
  await popup.getByLabel(/master_password/i).fill(PW);
  await popup.getByLabel(/^confirm$/i).fill(PW);
  // Wait for the strength gate to enable Create rather than racing on
  // the specific score string (zxcvbn lazy-load + debounce ~500ms).
  const createBtn = popup.getByRole('button', { name: /create vault/i });
  await expect(createBtn).toBeEnabled({ timeout: 10_000 });
  await createBtn.click();
  await expect(popup.getByText(/vault is empty/i)).toBeVisible({
    timeout: 10_000,
  });
}

test('locks via the lock button and rejects a wrong password', async ({
  popup,
}) => {
  await onboard(popup);

  await popup.getByRole('button', { name: /lock vault/i }).click();
  // Land on Unlock screen.
  await expect(
    popup.getByRole('heading', { name: /welcome back/i }),
  ).toBeVisible();

  await popup.getByLabel(/master password/i).fill('wrong-password-1234');
  await popup.getByRole('button', { name: /^unlock$/i }).click();

  await expect(popup.getByRole('alert')).toContainText(/wrong password/i);
});

test('unlocks again with the correct password', async ({ popup }) => {
  await onboard(popup);

  await popup.getByRole('button', { name: /lock vault/i }).click();
  await expect(
    popup.getByRole('heading', { name: /welcome back/i }),
  ).toBeVisible();

  await popup.getByLabel(/master password/i).fill(PW);
  await popup.getByRole('button', { name: /^unlock$/i }).click();

  // Back to the empty-vault view.
  await expect(popup.getByText(/vault is empty/i)).toBeVisible({
    timeout: 10_000,
  });
});

test('adds an entry, lists it, and finds it via search', async ({ popup }) => {
  await onboard(popup);

  // Click the empty-state add button (renders inside the empty state when
  // there are no entries).
  await popup
    .getByRole('button', { name: /new secret/i })
    .first()
    .click();

  await popup.getByLabel(/^name$/i).fill('Stripe live key');
  await popup.getByLabel(/^value$/i).fill('sk_live_xxxx');
  await popup.getByRole('button', { name: /^save$/i }).click();

  // Row appears in the list.
  await expect(popup.getByText('Stripe live key')).toBeVisible();
  // Footer count picks it up.
  await expect(popup.getByText(/1 entry/i)).toBeVisible();

  // Search narrows correctly.
  await popup.getByLabel(/search entries/i).fill('stripe');
  await expect(popup.getByText('Stripe live key')).toBeVisible();

  // And misses for non-matches.
  await popup.getByLabel(/search entries/i).fill('nothing');
  await expect(popup.getByText(/no entry matches/i)).toBeVisible();
});
