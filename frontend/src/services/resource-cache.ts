type CacheEntry<T> = { value?: T; updatedAt: number; inFlight?: Promise<T> };
const entries = new Map<string, CacheEntry<unknown>>();
let identity: string | null = null;
let identityRevision = 0;
function scopedKey(key: string): string {
  return (identity ?? "guest") + "\u0000" + key;
}
export function setCacheIdentity(uid: string | null): void {
  if (uid === identity) return;
  identity = uid;
  identityRevision += 1;
  entries.clear();
}
export function peekCached<T>(key: string): T | undefined {
  return entries.get(scopedKey(key))?.value as T | undefined;
}
export function setCached<T>(key: string, value: T): T {
  entries.set(scopedKey(key), { value, updatedAt: Date.now() });
  return value;
}
export function updateCached<T>(
  key: string,
  update: (current: T | undefined) => T | undefined,
): T | undefined {
  const next = update(peekCached<T>(key));
  if (next === undefined) {
    entries.delete(scopedKey(key));
    return undefined;
  }
  return setCached(key, next);
}
export function invalidateCached(prefix: string): void {
  const scopedPrefix = scopedKey(prefix);
  for (const key of entries.keys())
    if (key === scopedPrefix || key.startsWith(scopedPrefix))
      entries.delete(key);
}
export function clearCached(): void {
  entries.clear();
}
export async function cachedRequest<T>(
  key: string,
  loader: () => Promise<T>,
  options: { ttlMs?: number; force?: boolean } = {},
): Promise<T> {
  const cacheKey = scopedKey(key);
  const turn = identityRevision;
  const existing = entries.get(cacheKey) as CacheEntry<T> | undefined;
  if (
    !options.force &&
    existing?.value !== undefined &&
    Date.now() - existing.updatedAt <= (options.ttlMs ?? 15_000)
  )
    return existing.value;
  if (existing?.inFlight) return existing.inFlight;
  const next: CacheEntry<T> = existing ?? { updatedAt: 0 };
  const request = loader()
    .then((value) => {
      if (turn !== identityRevision)
        throw new Error("Your account changed. Please try again.");
      if (entries.get(cacheKey) === next)
        entries.set(cacheKey, { value, updatedAt: Date.now() });
      return value;
    })
    .finally(() => {
      const current = entries.get(cacheKey) as CacheEntry<T> | undefined;
      if (current === next && current.inFlight === request)
        current.inFlight = undefined;
    });
  next.inFlight = request;
  entries.set(cacheKey, next);
  return request;
}
