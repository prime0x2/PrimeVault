/**
 * Options-page prefs hook. Exposes the loading/ready state machine plus
 * an `update` writer. Thin wrapper over the shared subscription core in
 * {@link usePrefsSubscription}.
 */

import {
  DEFAULT_PREFS,
  type PrefsState,
  type PrefsSubscription,
  usePrefsSubscription,
} from '../../storage/prefs-hook';

export type { PrefsState };
export type UsePrefsResult = PrefsSubscription;

export function usePrefs(): UsePrefsResult {
  return usePrefsSubscription();
}

export { DEFAULT_PREFS };
