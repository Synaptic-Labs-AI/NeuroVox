/**
 * Error carrying the HTTP status of a failed provider request.
 *
 * The status is what lets callers tell the failure modes apart, which plain `Error` cannot:
 * a refused credential (401/403) must block recording before the user talks for ten minutes,
 * an unreachable provider must not, and a 4xx caused by the request body must not be retried
 * three more times on the way to the same failure.
 */
export class ApiRequestError extends Error {
    public readonly status?: number;
    public readonly detail?: string;

    constructor(message: string, options: { status?: number; detail?: string } = {}) {
        super(message);
        this.name = 'ApiRequestError';
        this.status = options.status;
        this.detail = options.detail;
    }
}

/** HTTP status of a provider failure, or undefined when the request never got a response. */
export function getStatus(error: unknown): number | undefined {
    return error instanceof ApiRequestError ? error.status : undefined;
}

/** 401/403: the provider read the request fine and refused the credentials. */
export function isAuthError(error: unknown): boolean {
    const status = getStatus(error);
    return status === 401 || status === 403;
}

/**
 * Whether repeating the identical request could plausibly succeed. A 4xx means the request
 * itself was wrong, so retrying only multiplies the wait before the same failure — 408 and
 * 429 excepted, which explicitly mean "try again". A missing status means the request never
 * reached the provider (offline, DNS, dropped connection), which is worth another attempt.
 */
export function isRetryable(error: unknown): boolean {
    const status = getStatus(error);
    if (status === undefined) return true;
    if (status === 408 || status === 429) return true;
    return status < 400 || status >= 500;
}
