export type PluginConfig = {
  /** Your Alt Text Generator API key. Defaults to the ALT_TEXT_GENERATOR_API_KEY environment variable. */
  apiKey?: string;
  /** Start with automatic alt text on upload switched on. The setting saved in the admin takes over. */
  autoGenerate?: boolean;
  /** Starting language of the alt text, for example `spanish`. The setting saved in the admin takes over. */
  language?: string;
  /** Overrides the service address. Only needed for testing. */
  endpoint?: string;
};

export default {
  default: (): PluginConfig => ({}),
  validator(config: PluginConfig) {
    if (config.apiKey !== undefined && typeof config.apiKey !== 'string') {
      throw new Error('alt-text-generator: "apiKey" must be a string.');
    }
    if (config.autoGenerate !== undefined && typeof config.autoGenerate !== 'boolean') {
      throw new Error('alt-text-generator: "autoGenerate" must be true or false.');
    }
  },
};
