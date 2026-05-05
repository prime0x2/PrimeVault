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
export function createMessagingClient(transport: Sender): MessagingClient {
  async function send<M extends Message>(
    message: M,
  ): Promise<ResponseFor<M['kind']>> {
    const raw = await transport(message);
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
    // The wire schema validates that `response.data` is one of the per-kind
    // shapes; the type system can't see which one without a runtime
    // discriminator on the message kind, so we double-cast through unknown
    // and trust the protocol's per-kind ResponseFor table. Schema-level
    // mismatches surface on the SW side as Zod failures rather than as
    // silent type confusion here.
    return response.data as unknown as ResponseFor<M['kind']>;
  }
  return { send };
}
