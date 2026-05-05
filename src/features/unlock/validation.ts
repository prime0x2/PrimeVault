/**
 * Password validation predicates for the onboarding form. SPEC §9.
 * Exposed as pure functions so they can be unit-tested without rendering
 * the form.
 */

import {
  MIN_ACCEPTABLE_SCORE,
  MIN_PASSWORD_LENGTH,
  type StrengthScore,
} from './strength';

export type SetupValidation =
  | { ok: true }
  | { ok: false; reason: SetupValidationReason };

export type SetupValidationReason =
  | 'tooShort'
  | 'tooWeak'
  | 'mismatch'
  | 'evaluating';

export interface SetupInputs {
  password: string;
  confirm: string;
  /** Latest zxcvbn score for `password`; null while evaluating. */
  score: StrengthScore | null;
}

/**
 * Validate the setup form. The first failing predicate wins, in priority
 * order: length → strength score → confirm match. Returns `evaluating` if
 * the password meets the length floor but the score has not yet arrived.
 */
export function validateSetup(inputs: SetupInputs): SetupValidation {
  if (inputs.password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, reason: 'tooShort' };
  }
  if (inputs.score === null) {
    return { ok: false, reason: 'evaluating' };
  }
  if (inputs.score < MIN_ACCEPTABLE_SCORE) {
    return { ok: false, reason: 'tooWeak' };
  }
  if (inputs.confirm !== inputs.password) {
    return { ok: false, reason: 'mismatch' };
  }
  return { ok: true };
}
