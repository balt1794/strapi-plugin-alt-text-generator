import type { Core } from '@strapi/strapi';
import { IMAGE_MIMES, type MediaFile } from '../utils/files';

const FILE = 'plugin::upload.file';
const MAX_LIST = 2000;

const plugin = (strapi: Core.Strapi) => strapi.plugin('alt-text-generator');

const fail = (ctx: any, status: number, message: string) => {
  ctx.status = status;
  ctx.body = { error: { status, name: 'AltTextGeneratorError', message } };
};

const slim = (file: MediaFile) => ({
  id: file.id,
  name: file.name,
  url: file.formats?.thumbnail?.url || file.url,
  alternativeText: file.alternativeText || '',
  mime: file.mime,
});

export default {
  settings: ({ strapi }: { strapi: Core.Strapi }) => ({
    async get(ctx: any) {
      const settings = await plugin(strapi).service('settings').get();
      ctx.body = { ...settings, hasApiKey: Boolean(plugin(strapi).service('settings').apiKey()) };
    },
    async update(ctx: any) {
      const { autoGenerate, language } = ctx.request.body || {};
      const settings = await plugin(strapi).service('settings').set({ autoGenerate, language });
      ctx.body = { ...settings, hasApiKey: Boolean(plugin(strapi).service('settings').apiKey()) };
    },
    async credits(ctx: any) {
      const settings = plugin(strapi).service('settings');
      if (!settings.apiKey()) {
        ctx.body = { credits: null, error: 'No API key.' };
        return;
      }
      const credits = await plugin(strapi).service('generate').credits();
      ctx.body = credits === null ? { credits: null, error: 'That API key was not found.' } : { credits };
    },
  }),

  media: ({ strapi }: { strapi: Core.Strapi }) => ({
    /** Lists images with their alt text. `filter=missing` returns only those without one. */
    async list(ctx: any) {
      const missingOnly = ctx.query.filter !== 'all';
      const where: Record<string, unknown> = { mime: { $in: IMAGE_MIMES } };
      if (missingOnly) {
        where.$or = [{ alternativeText: { $null: true } }, { alternativeText: '' }];
      }
      const [files, total, images] = await Promise.all([
        strapi.db.query(FILE).findMany({ where, orderBy: { createdAt: 'desc' }, limit: MAX_LIST }),
        strapi.db.query(FILE).count({ where }),
        strapi.db.query(FILE).count({ where: { mime: { $in: IMAGE_MIMES } } }),
      ]);
      const missing = missingOnly
        ? total
        : await strapi.db.query(FILE).count({
            where: {
              mime: { $in: IMAGE_MIMES },
              $or: [{ alternativeText: { $null: true } }, { alternativeText: '' }],
            },
          });
      ctx.body = { files: (files as MediaFile[]).map(slim), total, images, missing };
    },

    async generate(ctx: any) {
      const { id, language } = ctx.request.body || {};
      if (!id) return fail(ctx, 400, 'Missing image id.');

      const generate = plugin(strapi).service('generate');
      const file = await generate.findFile(id);
      if (!file) return fail(ctx, 404, 'Image not found.');

      const result = await generate.forFile(file, language);
      if (!result.ok) return fail(ctx, result.status === 401 || result.status === 402 ? result.status : 502, result.error);
      ctx.body = { id: file.id, altText: result.altText, creditsLeft: result.creditsLeft };
    },

    /** Saves alt text for several images. Nothing is written until this is called. */
    async save(ctx: any) {
      const items: Array<{ id: number; alternativeText: string }> = ctx.request.body?.items;
      if (!Array.isArray(items) || items.length === 0) return fail(ctx, 400, 'Nothing to save.');

      const upload = strapi.plugin('upload').service('upload');
      const user = ctx.state.user;
      let saved = 0;
      for (const item of items) {
        if (!item?.id || typeof item.alternativeText !== 'string') continue;
        await upload.updateFileInfo(item.id, { alternativeText: item.alternativeText.trim() }, { user });
        saved += 1;
      }
      ctx.body = { saved };
    },
  }),
};
