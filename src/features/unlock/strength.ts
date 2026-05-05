/**
 * zxcvbn-ts password strength evaluator. SPEC §9.
 *
 * zxcvbn (with the English language pack) is ~200KB. We never want it in the
 * steady-state popup bundle — only on the onboarding screen and the change-
 * password screen (Phase 10). The dynamic `import()` here makes the bundler
 * split it into its own chunk that loads on first call.
 *
 * The result type is intentionally narrow: callers only need `score`,
 * `crackTime`, and (optionally) `warning`/`suggestions`. Don't expose
 * zxcvbn's internal types — keeps the surface area small if we ever swap
 * libraries.
 */

export type StrengthScore = 0 | 1 | 2 | 3 | 4;

export interface StrengthResult {
  score: StrengthScore;
  /** Human-readable estimate, e.g. "centuries" or "less than a second". */
  crackTime: string;
  /** zxcvbn's specific warning, if any. */
  warning: string;
  /** zxcvbn's improvement suggestions. */
  suggestions: string[];
}

/** SPEC §9: minimum acceptable score is 3 of 4. */
export const MIN_ACCEPTABLE_SCORE: StrengthScore = 3;

/** SPEC §9: minimum password length we accept. */
export const MIN_PASSWORD_LENGTH = 12;

type Scorer = (password: string) => Promise<StrengthResult>;

let scorerPromise: Promise<Scorer> | null = null;

/**
 * Lazily load zxcvbn-ts and its English+common dictionaries, returning a
 * narrow `Scorer`. The first call kicks off the chunk download (cached for
 * the lifetime of the popup); subsequent calls reuse the same promise.
 *
 * Bundle-size note: `language-common` (~1.2MB) carries the keyboard
 * adjacency graphs that catch "qwerty"-style walks — non-negotiable.
 * `language-en` (~465KB) carries the English dictionary + translation
 * strings. Trimming either would degrade strength detection in ways
 * users feel ("hunter2" should fail; without the dictionary it scores
 * higher than it should). The chunks are only loaded on the onboarding
 * and change-password screens, so the steady-state popup never pays.
 */
export function loadStrengthScorer(): Promise<Scorer> {
  if (scorerPromise === null) {
    scorerPromise = (async () => {
      const [{ zxcvbnAsync, zxcvbnOptions }, common, en] = await Promise.all([
        import('@zxcvbn-ts/core'),
        import('@zxcvbn-ts/language-common'),
        import('@zxcvbn-ts/language-en'),
      ]);
      zxcvbnOptions.setOptions({
        translations: en.translations,
        graphs: common.adjacencyGraphs,
        dictionary: { ...common.dictionary, ...en.dictionary },
      });
      return async (password: string): Promise<StrengthResult> => {
        const result = await zxcvbnAsync(password);
        return {
          score: result.score as StrengthScore,
          crackTime: String(
            result.crackTimesDisplay.offlineSlowHashing1e4PerSecond,
          ),
          warning: result.feedback.warning ?? '',
          suggestions: result.feedback.suggestions ?? [],
        };
      };
    })();
  }
  return scorerPromise;
}

/** Convenience: load + score in one call. */
export async function scorePassword(password: string): Promise<StrengthResult> {
  const score = await loadStrengthScorer();
  return score(password);
}

/**
 * Reset the cached loader. Tests use this to verify the lazy-load behavior
 * on subsequent calls. Production code should never call this.
 */
export function _resetStrengthLoader(): void {
  scorerPromise = null;
}
