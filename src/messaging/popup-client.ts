/**
 * Singleton {@link MessagingClient} for the popup. Wraps
 * `browser.runtime.sendMessage` once and re-exports the typed `send`.
 *
 * Components import `popupClient.send(...)` rather than constructing their
 * own client — keeps wiring out of feature code.
 */

import { browser } from 'wxt/browser';
import { createMessagingClient } from './client';
import { MessagingError } from './protocol';

export const popupClient = createMessagingClient(async (message) => {
  const response = await browser.runtime.sendMessage(message);
  if (response === undefined) {
    // Service worker had no listener (extension not loaded? eviction
    // race?). Surface this as a typed error so the UI can recover.
    throw new MessagingError(
      'internal',
      'No response from service worker. Try reopening the popup.',
    );
  }
  return response;
});
