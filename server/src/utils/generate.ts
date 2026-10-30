const DEFAULT_ENDPOINT = 'https://alttextgeneratorai.com/api/strapi';
const MAX_DATA_URL_LENGTH = 5_500_000;

export type GenerateOptions = {
  apiKey: string;
  endpoint?: string;
  language?: string;
};

export type GenerateResult =
  | { ok: true; altText: string; creditsLeft: number | null }
  | { ok: false; error: string; status: number };

export const endpointFor = (endpoint?: string) => endpoint || DEFAULT_ENDPOINT;

/** Shrinks big images before they are sent, using `sharp` (Strapi already ships with it). */
async function toJpegBase64(buffer: Buffer): Promise<string> {
  try {
    const sharp = (await import('sharp')).default;
    const resized = await sharp(buffer)
      .rotate()
      .resize({ fit: 'inside', height: 1024, width: 1024, withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    return `data:image/jpeg;base64,${resized.toString('base64')}`;
  } catch {
    return '';
  }
}

/**
 * Sends one image to the Alt Text Generator service and returns the alt text.
 * Runs on the Strapi server only, so the API key is never exposed to the browser.
 */
export async function generateAltText(
  image: Buffer,
  mimeType: string,
  options: GenerateOptions
): Promise<GenerateResult> {
  if (!options.apiKey) {
    return {
      ok: false,
      status: 401,
      error: 'No API key. Set ALT_TEXT_GENERATOR_API_KEY in your .env file and restart Strapi.',
    };
  }

  let dataUrl = await toJpegBase64(image);
  if (!dataUrl && /^image\/(jpeg|png|webp|gif)$/.test(mimeType)) {
    dataUrl = `data:${mimeType};base64,${image.toString('base64')}`;
  }
  if (!dataUrl) {
    return { ok: false, status: 415, error: 'This image type is not supported.' };
  }
  if (dataUrl.length > MAX_DATA_URL_LENGTH) {
    return { ok: false, status: 413, error: 'This image is too large to send.' };
  }

  try {
    const res = await fetch(endpointFor(options.endpoint), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image: dataUrl,
        language: options.language || 'english',
        wpkey: options.apiKey,
      }),
      signal: AbortSignal.timeout(60_000),
    });
    const text = (await res.text()).trim();

    if (!res.ok) {
      const error =
        res.status === 401
          ? 'Invalid API key.'
          : res.status === 402
            ? 'No credits left on this API key.'
            : text && text.length < 160 && !text.startsWith('<')
              ? text
              : `Generation failed (${res.status}).`;
      return { ok: false, status: res.status, error };
    }

    const left = Number(res.headers.get('X-Credits-Left'));
    return {
      ok: true,
      altText: text,
      creditsLeft: res.headers.has('X-Credits-Left') && Number.isFinite(left) ? left : null,
    };
  } catch {
    return { ok: false, status: 502, error: 'Could not reach the Alt Text Generator service.' };
  }
}

/** Remaining credits for a key. Never uses a credit. */
export async function fetchCredits(apiKey: string, endpoint?: string): Promise<number | null> {
  if (!apiKey) return null;
  try {
    const verifyUrl = endpointFor(endpoint).replace(/\/[^/]+$/, '/verify');
    const res = await fetch(verifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { freeRewritesLeft?: number };
    return typeof data.freeRewritesLeft === 'number' ? data.freeRewritesLeft : null;
  } catch {
    return null;
  }
}
