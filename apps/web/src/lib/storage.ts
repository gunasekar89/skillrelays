// Demo state lives in the browser only. Nothing here is durable or shared.
export function load<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function save<T>(key: string, value: T) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: demo keeps working in memory */
  }
}
