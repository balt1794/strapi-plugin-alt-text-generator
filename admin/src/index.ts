import { Initializer } from './components/Initializer';
import { PluginIcon } from './components/PluginIcon';
import { PLUGIN_ID } from './pluginId';

export default {
  register(app: any) {
    app.addMenuLink({
      to: `plugins/${PLUGIN_ID}`,
      icon: PluginIcon,
      intlLabel: {
        id: `${PLUGIN_ID}.plugin.name`,
        defaultMessage: 'Alt Text Generator AI',
      },
      Component: async () => {
        const { App } = await import('./pages/App');
        return App;
      },
      permissions: [{ action: 'plugin::upload.read', subject: null }],
    });

    app.registerPlugin({
      id: PLUGIN_ID,
      initializer: Initializer,
      isReady: false,
      name: 'Alt Text Generator',
    });
  },

  async registerTrads({ locales }: { locales: string[] }) {
    return locales.map((locale) => ({ data: {}, locale }));
  },
};
