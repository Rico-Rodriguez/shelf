export function publishReviewCount(count: number) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("shelf-review", { detail: Math.max(0, count) }));
}
