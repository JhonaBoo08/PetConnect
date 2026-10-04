type CacheEntry<T> = {
  value?: T;
  updatedAt: number;
  inFlight?: Promise<T>;
};

const entries = new Map<string, CacheEntry<unknown>>();

export function peekCached<T>(key: string): T | undefined {
  return entries.get(key)?.value as T | undefined;
}

export function setCached<T>(key: string, value: T): T {
  entries.set(key, { value, updatedAt: Date.now() });
  return value;
}

export function updateCached<T>(
  key: string,
  update: (current: T | undefined) => T | undefined,
): T | undefined {
  const next = update(peekCached<T>(key));
  if (next === undefined) {
    entries.delete(key);
    return undefined;
  }
  setCached(key, next);
  return next;
}

export function invalidateCached(prefix: string): void {
  for (const key of entries.keys()) {
    if (key === prefix || key.startsWith(prefix)) entries.delete(key);
  }
}

export function clearCached(): void {
  entries.clear();
}

export async function cachedRequest<T>(
  key: string,
  loader: () => Promise<T>,
  options: { ttlMs?: number; force?: boolean } = {},
): Promise<T> {
  const ttlMs = options.ttlMs ?? 15_000;
  const existing = entries.get(key) as CacheEntry<T> | undefined;

  if (
    !options.force &&
    existing?.value !== undefined &&
    Date.now() - existing.updatedAt <= ttlMs
  ) {
    return existing.value;
  }

  if (existing?.inFlight) return existing.inFlight;

  const next: CacheEntry<T> = existing ?? { updatedAt: 0 };
  const request = loader()
    .then((value) => {
      // Only commit if this request still owns the cache entry. A mutation or
      // sign-out may invalidate/replace it while the request is in flight.
      if (entries.get(key) === next) {
        entries.set(key, { value, updatedAt: Date.now() });
      }
      return value;
    })
    .finally(() => {
      const current = entries.get(key) as CacheEntry<T> | undefined;
      if (current === next && current.inFlight === request) {
        current.inFlight = undefined;
        entries.set(key, current);
      }
    });

  next.inFlight = request;
  entries.set(key, next);
  return request;
}
