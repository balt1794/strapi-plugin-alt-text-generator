import type { Core } from '@strapi/strapi';
import { isImage, type MediaFile } from './utils/files';

const FILE = 'plugin::upload.file';

/**
 * Writes alt text for images as they are uploaded or replaced, when automatic mode is on.
 * Strapi's own Media Library AI needs a paid license; this runs on every Strapi edition.
 */
export default async ({ strapi }: { strapi: Core.Strapi }) => {
  const plugin = () => strapi.plugin('alt-text-generator');
  const busy = new Set<number>();

  const run = async (file: MediaFile, onlyIfEmpty: boolean) => {
    if (!file || !isImage(file) || busy.has(file.id)) return;
    if (onlyIfEmpty && file.alternativeText) return;

    const settings = await plugin().service('settings').get();
    if (!settings.autoGenerate) return;

    busy.add(file.id);
    try {
      const result = await plugin().service('generate').forFile(file, settings.language);
      if (!result.ok) {
        strapi.log.warn(`[alt-text-generator] ${file.name}: ${result.error}`);
        return;
      }
      const updated = await strapi.db.query(FILE).update({
        where: { id: file.id },
        data: { alternativeText: result.altText },
      });
      // The upload response carries this object, so the new text shows up straight away.
      if (updated) file.alternativeText = result.altText;
    } catch (error) {
      strapi.log.warn(`[alt-text-generator] ${file.name}: ${error instanceof Error ? error.message : error}`);
    } finally {
      busy.delete(file.id);
    }
  };

  strapi.db.lifecycles.subscribe({
    models: [FILE],
    async afterCreate(event) {
      await run(event.result as MediaFile, true);
    },
    async afterUpdate(event) {
      // Replacing the file writes a new size. Editing only the name or the alt text does not.
      if (typeof event.params?.data?.size === 'number') {
        await run(event.result as MediaFile, false);
      }
    },
  });
};
