import { AlertTriangle, Clock } from 'lucide-react';
import { Badge } from '../../components/ui/badge';
import { daysUntilExpiry, expiryUrgency } from './expiry';

interface ExpiryBadgeProps {
  expiresAt: string | undefined;
  /** Injectable for tests / Storybook. Defaults to wall-clock. */
  now?: number;
}

export function ExpiryBadge({
  expiresAt,
  now = Date.now(),
}: ExpiryBadgeProps): React.ReactElement | null {
  const urgency = expiryUrgency(expiresAt, now);
  if (urgency === null || urgency === 'ok' || expiresAt === undefined) {
    return null;
  }
  const days = daysUntilExpiry(expiresAt, now);
  const variant = urgency === 'expired' ? 'destructive' : 'warning';
  const Icon = urgency === 'expired' ? AlertTriangle : Clock;
  const label =
    urgency === 'expired'
      ? days === 0
        ? 'expires today'
        : `expired ${-days}d ago`
      : `expires in ${days}d`;

  return (
    <Badge variant={variant}>
      <Icon className="h-2.5 w-2.5" aria-hidden />
      {label}
    </Badge>
  );
}
