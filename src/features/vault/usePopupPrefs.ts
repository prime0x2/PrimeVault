/**
 * Popup prefs hook. Returns a flat {@link Prefs} object, falling back to
 * {@link DEFAULT_PREFS} during the (typically sub-frame) loading window
 * so the first paint always has a valid value to read.
 *
 * Thin wrapper over the shared subscription in {@link usePrefsSubscription}
 * so the popup and options page share one source of truth for prefs IO.
 */

import type { Prefs } from '../../storage/prefs';
import { DEFAULT_PREFS, usePrefsSubscription } from '../../storage/prefs-hook';

export function usePopupPrefs(): Prefs {
  const { state } = usePrefsSubscription();
  return state.kind === 'ready' ? state.prefs : DEFAULT_PREFS;
}
