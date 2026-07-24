export type ActionResult<T> =
  | { ok: true; data: T; warning?: string }
  | { ok: false; error: string };

export function ok<T>(data: T, warning?: string): ActionResult<T> {
  return { ok: true, data, warning };
}

export function fail<T>(error: string): ActionResult<T> {
  return { ok: false, error };
}
