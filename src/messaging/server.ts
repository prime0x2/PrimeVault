/**
 * Service-worker side of the popup ↔ SW protocol. Validates incoming messages
 * against {@link messageSchema}, dispatches to a typed handler, and folds
 * thrown errors into a {@link WireResponse}. SPEC §6.3.
 */

import {
  type Message,
  type MessageKind,
  MessagingError,
  messageSchema,
  type ResponseFor,
  type WireResponse,
} from './protocol';

export type Handlers = {
  [K in MessageKind]: (
    request: Extract<Message, { kind: K }>,
  ) => Promise<ResponseFor<K>> | ResponseFor<K>;
};

/**
 * Parse `raw`, dispatch to the matching handler, and return a wire response.
 * Never throws — every failure is reported as `{ ok: false }` so the popup
 * sees a uniform shape.
 */
export async function handleMessage(
  raw: unknown,
  handlers: Handlers,
): Promise<WireResponse> {
  const parsed = messageSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      code: 'invalidRequest',
      message: 'Invalid message shape',
    };
  }

  const message = parsed.data;
  try {
    // The discriminated union narrows `message` to the matching variant
    // statically, but TS can't see that `handlers[message.kind]` accepts that
    // narrowed type — hence the cast.
    const handler = handlers[message.kind] as (
      m: Message,
    ) => Promise<ResponseFor<MessageKind>> | ResponseFor<MessageKind>;
    const data = await handler(message);
    return { ok: true, data };
  } catch (err) {
    if (err instanceof MessagingError) {
      return { ok: false, code: err.code, message: err.message };
    }
    return {
      ok: false,
      code: 'internal',
      message: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}
