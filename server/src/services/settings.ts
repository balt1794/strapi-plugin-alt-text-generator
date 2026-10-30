import type { Core } from '@strapi/strapi';
import type { PluginConfig } from '../config';

export type Settings = { autoGenerate: boolean; language: string };

const PLUGIN = 'alt-text-generator';

export default ({ strapi }: { strapi: Core.Strapi }) => {
  const store = () => strapi.store({ type: 'plugin', name: PLUGIN, key: 'settings' });
  const config = (): PluginConfig => strapi.config.get(`plugin::${PLUGIN}`) || {};

  return {
    config,

    apiKey(): string {
      return config().apiKey || process.env.ALT_TEXT_GENERATOR_API_KEY || '';
    },

    endpoint(): string | undefined {
      return config().endpoint || process.env.ALT_TEXT_GENERATOR_ENDPOINT || undefined;
    },

    /** What an admin saved, falling back to the plugin options. */
    async get(): Promise<Settings> {
      const saved = ((await store().get({})) as Partial<Settings> | null) || {};
      return {
        autoGenerate: saved.autoGenerate ?? config().autoGenerate ?? false,
        language: saved.language || config().language || 'english',
      };
    },

    async set(next: Partial<Settings>): Promise<Settings> {
      const current = await this.get();
      const merged: Settings = {
        autoGenerate: typeof next.autoGenerate === 'boolean' ? next.autoGenerate : current.autoGenerate,
        language: typeof next.language === 'string' && next.language ? next.language : current.language,
      };
      await store().set({ value: merged });
      return merged;
    },
  };
};
