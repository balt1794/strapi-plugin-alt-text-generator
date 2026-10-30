import fs from 'node:fs/promises';
import path from 'node:path';
import type { Core } from '@strapi/strapi';

export const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];

export type MediaFile = {
  id: number;
  name: string;
  alternativeText?: string | null;
  caption?: string | null;
  mime: string;
  url: string;
  provider?: string;
  formats?: Record<string, { url: string }> | null;
  width?: number | null;
  height?: number | null;
};

export const isImage = (file: Pick<MediaFile, 'mime'>) => IMAGE_MIMES.includes(file.mime);

/** Reads the original image: from disk for the local provider, over HTTP for cloud storage. */
export async function readFileBuffer(strapi: Core.Strapi, file: MediaFile): Promise<Buffer> {
  if (file.provider === 'local' && file.url.startsWith('/')) {
    const root = strapi.dirs.static.public;
    const full = path.join(root, file.url);
    if (!full.startsWith(root)) throw new Error('Invalid file path');
    return fs.readFile(full);
  }

  const res = await fetch(file.url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Could not download the image (${res.status}).`);
  return Buffer.from(await res.arrayBuffer());
}
