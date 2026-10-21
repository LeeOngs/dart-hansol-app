import { Redis } from '@upstash/redis';

// Lazy so importing a module that uses it doesn't throw before env vars are
// read (and so modules that never touch Redis don't need its credentials).
let client: Redis | null = null;
export function redis(): Redis {
  client ??= Redis.fromEnv();
  return client;
}
