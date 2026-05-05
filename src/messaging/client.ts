/**
 * Popup-side typed sender. Wraps `browser.runtime.sendMessage` (or any
 * compatible function) and converts {@link WireResponse} failures into
 * {@link MessagingError} throws. SPEC §6.3.
 */

import {
  type Message,
  MessagingError,
  type ResponseFor,
  wireResponseSchema,
} from './protocol';

export type Sender = (message: Message) => Promise<unknown>;

export interface MessagingClient {
  send<M extends Message>(message: M): Promise<ResponseFor<M['kind']>>;
}

/**
 * Build a typed messaging client. Pass a `send` function that performs the
 * actual transport — typically `(msg) => browser.runtime.sendMessage(msg)`
 * in the popup; tests pass a function that calls the dispatcher directly.
 */
export function createMessagingClient(send: Sender): MessagingClient {
  return {
    async send(message) {
      const raw = await send(message);
      const parsed = wireResponseSchema.safeParse(raw);
      if (!parsed.success) {
        throw new MessagingError(
          'internal',
          'Malformed response from service worker',
        );
      }
      const response = parsed.data;
      if (!response.ok) {
        throw new MessagingError(response.code, response.message);
      }
      // The `data` field is statically a `VaultStatus`, but the per-kind
      // ResponseFor will diverge in Phase 7+; the cast is the discrimination
      // that the protocol's per-kind type table encodes.
      return response.data as never;
    },
  };
}
