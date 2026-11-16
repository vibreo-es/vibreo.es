// The full catalogue is larger than Next's 2 MB data-cache entry limit.
// Validate it before committing HTTP 200: an upstream reset must never become
// a successful, cacheable response containing half a JSON document.
const MAX_CATALOG_BYTES = 32 * 1024 * 1024;
const ATTEMPT_TIMEOUT_MS = 45_000;
const ATTEMPTS = 2;

async function readCatalog(response: Response): Promise<Uint8Array> {
  if (!response.body) throw new Error('Missing catalogue body');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_CATALOG_BYTES) throw new Error('Catalogue size limit exceeded');
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid catalogue document');
  }
  return bytes;
}

function streamBytes(bytes: Uint8Array): ReadableStream<Uint8Array> {
  // Keep the verified response streamed on Vercel (large buffered responses
  // exceed its payload limit). The upstream deadline no longer owns this body.
  let offset = 0;
  return new ReadableStream({
    pull(controller) {
      const end = Math.min(offset + 64 * 1024, bytes.byteLength);
      controller.enqueue(bytes.subarray(offset, end));
      offset = end;
      if (offset === bytes.byteLength) controller.close();
    },
  });
}

export async function fetchCatalog(
  url: string,
  headers: HeadersInit,
  clientSignal: AbortSignal,
): Promise<Response> {
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    clientSignal.throwIfAborted();
    const deadline = new AbortController();
    const timer = setTimeout(() => deadline.abort(new DOMException('Catalogue timed out', 'TimeoutError')), ATTEMPT_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        headers,
        cache: 'no-store',
        signal: AbortSignal.any([clientSignal, deadline.signal]),
      });
      if (response.status >= 500) {
        await response.body?.cancel();
        throw new Error('Catalogue upstream unavailable');
      }
      // Preserve explicit denials/rate limits; never retry a 4xx response.
      if (!response.ok) return response;
      const bytes = await readCatalog(response);
      return new Response(streamBytes(bytes), {
        status: response.status,
        headers: response.headers,
      });
    } catch (error) {
      if (clientSignal.aborted || attempt === ATTEMPTS - 1) throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error('Catalogue unavailable');
}
