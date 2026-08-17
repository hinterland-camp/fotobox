import { createHash, timingSafeEqual } from 'node:crypto'
import type { H3Event } from 'h3'

function readBearer(event: H3Event): string | null {
  const header = getRequestHeader(event, 'authorization')
  if (header?.startsWith('Bearer ')) {
    return header.slice('Bearer '.length).trim() || null
  }
  return getRequestHeader(event, 'x-upload-token')?.trim() || null
}

// Compare digests rather than the raw strings: equal-length buffers keep the
// comparison constant time and hashing hides the length of the real token.
function tokensMatch(given: string, expected: string): boolean {
  const a = createHash('sha256').update(given).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

/**
 * Guards the upload endpoint. Anyone who knows the domain could otherwise post
 * images to the server, so a booth has to present the shared token.
 */
export function requireUploadAuth(event: H3Event): void {
  const expected = useRuntimeConfig(event).uploadToken

  // Fail closed: an unconfigured server refuses uploads rather than silently
  // accepting them from anyone.
  if (!expected) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Uploads are not configured on this server',
    })
  }

  const given = readBearer(event)
  if (!given || !tokensMatch(given, expected)) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid upload token' })
  }
}
