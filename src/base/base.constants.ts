/** Page size a list endpoint returns when the caller doesn't ask for one. */
export const DEFAULT_QUERY_LIMIT = 50;

/** Largest page a caller may request; anything above is rejected with 400. */
export const MAX_QUERY_LIMIT = 200;
