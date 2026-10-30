import type { Core } from '@strapi/strapi';
import { fetchCredits, generateAltText, type GenerateResult } from '../utils/generate';
import { isImage, readFileBuffer, type MediaFile } from '../utils/files';

const FILE = 'plugin::upload.file';

export default ({ strapi }: { strapi: Core.Strapi }) => {
  const settings = () => strapi.plugin('alt-text-generator').service('settings');

  return {
    async findFile(id: number | string): Promise<MediaFile | null> {
      return strapi.db.query(FILE).findOne({ where: { id } });
    },

    /** Generates alt text for one file. Does not save it. */
    async forFile(file: MediaFile, language?: string): Promise<GenerateResult> {
      if (!isImage(file)) {
        return { ok: false, status: 415, error: 'This file is not an image Alt Text Generator can read.' };
      }
      let buffer: Buffer;
      try {
        buffer = await readFileBuffer(strapi, file);
      } catch (error) {
        return { ok: false, status: 500, error: error instanceof Error ? error.message : 'Could not read the image.' };
      }
      const saved = await settings().get();
      return generateAltText(buffer, file.mime, {
        apiKey: settings().apiKey(),
        endpoint: settings().endpoint(),
        language: language || saved.language,
      });
    },

    async credits(): Promise<number | null> {
      return fetchCredits(settings().apiKey(), settings().endpoint());
    },
  };
};
