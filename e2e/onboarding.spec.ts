/**
 * E2E: first-run flow.
 *
 * Asserts the "no vault on disk → create master password → land on the
 * empty vault" path against the BUILT extension. This is the single most
 * important smoke check: if onboarding is broken, the user can't get past
 * step zero.
 */
import { expect, test } from './fixtures';

const STRONG_PASSWORD = 'correct-horse-battery-staple-9!';

test('onboarding creates the vault and lands on the empty list', async ({
  popup,
}) => {
  // Onboarding screen is the first thing rendered when storage is empty.
  await expect(
    popup.getByRole('heading', { name: /set your master key/i }),
  ).toBeVisible();

  // The Create button is gated on length + score + confirm match.
  const createBtn = popup.getByRole('button', { name: /create vault/i });
  await expect(createBtn).toBeDisabled();

  // Type a strong password into both fields.
  await popup.getByLabel(/master_password/i).fill(STRONG_PASSWORD);
  await popup.getByLabel(/^confirm$/i).fill(STRONG_PASSWORD);

  // zxcvbn is lazily loaded; wait for the strength gate to flip the
  // submit button rather than racing on a specific score string. The
  // button is the truest signal that validation has accepted the input.
  await expect(createBtn).toBeEnabled({ timeout: 10_000 });

  await createBtn.click();

  // Empty vault state should render after setupVault round-trips.
  await expect(popup.getByText(/vault is empty/i)).toBeVisible({
    timeout: 10_000,
  });
});

test('onboarding rejects a too-short password', async ({ popup }) => {
  await popup.getByLabel(/master_password/i).fill('short');
  // Hint text reflects the remaining-character count.
  await expect(popup.getByText(/more to go/i)).toBeVisible();
  await expect(
    popup.getByRole('button', { name: /create vault/i }),
  ).toBeDisabled();
});
