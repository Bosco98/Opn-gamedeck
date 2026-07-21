/**
 * Browser gesture interference is the classic multi-touch killer: the moment
 * a second finger lands, mobile browsers may treat the two fingers as a
 * pinch-zoom or scroll gesture, fire `pointercancel` on EVERY active pointer,
 * and all controls release at once.
 *
 * CSS `touch-action: none` covers most browsers, but not reliably iOS Safari
 * (which also ignores `user-scalable=no`), so controller UIs need these JS
 * guards too: actively cancel the browser's default touch/gesture handling.
 * Pointer events keep firing normally — only the browser's own gestures
 * (pinch, scroll, double-tap zoom, long-press callout) are suppressed.
 */
export function installTouchGuards(container: HTMLElement, signal: AbortSignal): void {
  const prevent = (event: Event) => event.preventDefault();

  // Non-passive so preventDefault actually blocks pinch/scroll/double-tap.
  container.addEventListener("touchstart", prevent, { passive: false, signal });
  container.addEventListener("touchmove", prevent, { passive: false, signal });
  container.addEventListener("touchend", prevent, { passive: false, signal });

  // iOS Safari proprietary pinch events — the reliable pinch kill-switch.
  container.addEventListener("gesturestart", prevent, { signal });
  container.addEventListener("gesturechange", prevent, { signal });

  // Long-press context menu / text selection callout.
  container.addEventListener("contextmenu", prevent, { signal });
  container.addEventListener("selectstart", prevent, { signal });
}
