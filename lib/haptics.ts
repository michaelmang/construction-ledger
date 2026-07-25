// Vibration API support is Android Chrome only — no effect on iOS/Safari
// (unsupported) or any desktop browser. Calls are a harmless no-op
// everywhere else, so call sites don't need their own feature detection.
function vibrate(pattern: number | number[]): void {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(pattern);
  }
}

// A light tap for a UI state change that isn't itself a commit yet (e.g.
// opening a delete confirmation).
export function hapticTap(): void {
  vibrate(10);
}

// A write actually landed (record/edit/delete confirmed, status changed).
export function hapticSuccess(): void {
  vibrate([15, 60, 15]);
}

// A write was rejected (validation error, server action failure).
export function hapticError(): void {
  vibrate([30, 40, 30, 40, 30]);
}
