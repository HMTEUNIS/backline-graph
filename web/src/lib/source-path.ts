/**
 * `source_path` is a relative key, the same string Patchbay stores.
 * The demo prefixes it with this app's document route. A production
 * deploy should turn the same key into a signed URL for a private bucket.
 */

const SAFE = /^[A-Za-z0-9][A-Za-z0-9._-]*(\/[A-Za-z0-9][A-Za-z0-9._-]*)*\.pdf$/i;

export function isSafeSourcePath(sourcePath: string): boolean {
  if (!sourcePath || sourcePath.includes("\0") || sourcePath.includes("\\")) return false;
  const segments = sourcePath.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) return false;
  return SAFE.test(sourcePath);
}

/** URL under this app, or null when the stored path is not a safe relative PDF key. */
export function sourceHref(sourcePath: string): string | null {
  if (!isSafeSourcePath(sourcePath)) return null;
  const encoded = sourcePath.split("/").map((segment) => encodeURIComponent(segment)).join("/");
  return `/api/documents/${encoded}`;
}
