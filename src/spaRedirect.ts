// GitHub Pages serves a static 404.html for any unknown path, which breaks
// deep links into this single-page app (e.g. reloading a non-root route).
// This encodes the requested path into a query string and redirects to the
// app root, where `restoreRedirectedPath` decodes it back before the router
// mounts. Based on https://github.com/rafgraph/spa-github-pages.

export function redirectToRootWithEncodedPath() {
  const base = import.meta.env.BASE_URL;
  const segmentsToKeep = base.split("/").filter(Boolean).length;

  const location = window.location;
  const segments = location.pathname.split("/").slice(1);
  const root = "/" + segments.slice(0, segmentsToKeep).join("/");
  const rest = segments.slice(segmentsToKeep).join("/");

  const search = location.search ? "&" + location.search.slice(1).replace(/&/g, "~and~") : "";

  location.replace(root + "/?/" + rest.replace(/&/g, "~and~") + search + location.hash);
}

export function restoreRedirectedPath() {
  const location = window.location;
  if (!location.search.startsWith("?/")) {
    return;
  }

  const decoded = location.search
    .slice(1)
    .split("&")
    .map((segment) => segment.replace(/~and~/g, "&"));

  const path = decoded.shift();
  const search = decoded.length ? "?" + decoded.join("&") : "";

  window.history.replaceState(
    null,
    "",
    location.pathname.slice(0, -1) + path + search + location.hash,
  );
}
