/** Defer revoke so media elements can detach before the blob is freed (avoids decode pops). */
export function releaseBlobUrl(url: string | null | undefined, delayMs = 400) {
  if (!url || !url.startsWith('blob:')) return
  window.setTimeout(() => {
    try {
      URL.revokeObjectURL(url)
    } catch {
      // already revoked
    }
  }, delayMs)
}

/** Soft-stop a media element before swapping src. */
export function stopMediaElement(el: HTMLMediaElement | null | undefined) {
  if (!el) return
  try {
    el.pause()
  } catch {
    // ignore
  }
  try {
    el.removeAttribute('src')
    el.load()
  } catch {
    // ignore
  }
}
