import * as FileSystem from 'expo-file-system';

const ROOT = `${FileSystem.documentDirectory ?? ''}estate-offline`;
const CACHE_FILE = `${ROOT}/cache.json`;
const QUEUE_FILE = `${ROOT}/queue.json`;

type CacheMap = Record<string, { body: string; updatedAt: string }>;

type QueueItem = {
  id: string;
  path: string;
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: string;
  createdAt: string;
};

async function ensureRoot() {
  const info = await FileSystem.getInfoAsync(ROOT);
  if (!info.exists) await FileSystem.makeDirectoryAsync(ROOT, { intermediates: true });
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    await ensureRoot();
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return fallback;
    const raw = await FileSystem.readAsStringAsync(path);
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(path: string, value: unknown) {
  await ensureRoot();
  await FileSystem.writeAsStringAsync(path, JSON.stringify(value));
}

export async function cacheGet(path: string) {
  const cache = await readJson<CacheMap>(CACHE_FILE, {});
  return cache[path];
}

export async function cacheSet(path: string, body: string) {
  const cache = await readJson<CacheMap>(CACHE_FILE, {});
  cache[path] = { body, updatedAt: new Date().toISOString() };
  await writeJson(CACHE_FILE, cache);
}

export async function queueWrite(item: Omit<QueueItem, 'id' | 'createdAt'>) {
  const queue = await readJson<QueueItem[]>(QUEUE_FILE, []);
  queue.push({
    ...item,
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    createdAt: new Date().toISOString(),
  });
  await writeJson(QUEUE_FILE, queue);
}

export async function flushQueue(run: (item: QueueItem) => Promise<boolean>) {
  const queue = await readJson<QueueItem[]>(QUEUE_FILE, []);
  if (!queue.length) return { processed: 0, remaining: 0 };

  const remaining: QueueItem[] = [];
  let processed = 0;

  for (const item of queue) {
    const ok = await run(item);
    if (ok) processed += 1;
    else remaining.push(item);
  }

  await writeJson(QUEUE_FILE, remaining);
  return { processed, remaining: remaining.length };
}
