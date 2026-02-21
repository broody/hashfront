const NOISE_PATTERNS = [
  "ENTRYPOINT_FAILED",
  "argent/multicall-failed",
  "TRANSACTION_FAILED",
];

export interface ParsedTransactionError {
  message: string;
  rawError: string;
}

export function parseTransactionError(
  error: unknown,
): ParsedTransactionError | null {
  if (!error || typeof error !== "object") return null;

  const err = error as { code?: number; data?: { execution_error?: string } };
  const executionError = err.data?.execution_error;
  if (!executionError) return null;

  if (err.code === 41) {
    // Extract all single-quoted strings from the execution_error
    const matches = executionError.match(/'([^']*)'/g);
    if (matches) {
      const decoded = matches
        .map((m) => m.slice(1, -1))
        .filter(
          (msg) =>
            msg.length > 0 &&
            !NOISE_PATTERNS.some((noise) => msg.includes(noise)),
        );
      if (decoded.length > 0) {
        return {
          message: decoded[decoded.length - 1],
          rawError: executionError,
        };
      }
    }
  }

  return { message: executionError, rawError: executionError };
}
