export function currentPath() {
  return location.hash.startsWith("#/")
    ? location.hash.slice(1).split("?")[0]
    : location.pathname;
}
export function navigate(path: string, replace = false) {
  history[replace ? "replaceState" : "pushState"](null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
export function interceptNavigation(event: MouseEvent) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    event.shiftKey
  )
    return;
  const anchor = (event.target as Element)?.closest("a");
  if (!anchor || anchor.target || anchor.hasAttribute("download")) return;
  const raw = anchor.getAttribute("href");
  if (
    !raw ||
    raw.startsWith("#") ||
    raw.startsWith("mailto:") ||
    raw.startsWith("tel:")
  )
    return;
  const url = new URL(anchor.href, location.href);
  if (
    url.origin !== location.origin ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/media/")
  )
    return;
  event.preventDefault();
  navigate(url.pathname + url.search + url.hash);
}
