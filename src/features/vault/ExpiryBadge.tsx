import { daysUntilExpiry, expiryUrgency } from './expiry';

interface ExpiryBadgeProps {
  expiresAt: string | undefined;
  /** Injectable for tests. Defaults to wall-clock. */
  now?: number;
}

/**
 * Direction B: small mono chip next to the entry name. Only renders when
 * there is something to communicate (expired / approaching expiry).
 * Healthy entries return null — keeps rows quiet.
 */
export function ExpiryBadge({
  expiresAt,
  now = Date.now(),
}: ExpiryBadgeProps): React.ReactElement | null {
  const urgency = expiryUrgency(expiresAt, now);
  if (urgency === null || urgency === 'ok' || expiresAt === undefined) {
    return null;
  }
  const days = daysUntilExpiry(expiresAt, now);
  const label =
    urgency === 'expired'
      ? 'expired'
      : days <= 0
        ? 'exp today'
        : `exp ${days}d`;

  const palette =
    urgency === 'expired'
      ? {
          color: 'var(--danger)',
          background: 'var(--danger-soft)',
          borderColor: 'var(--danger-border)',
        }
      : {
          color: 'var(--warn)',
          background: 'var(--warn-soft)',
          borderColor: 'var(--warn-border)',
        };

  return (
    <span
      className="rounded-[4px] border px-1.5 py-px font-mono text-[9.5px]"
      style={palette}
    >
      {label}
    </span>
  );
}
