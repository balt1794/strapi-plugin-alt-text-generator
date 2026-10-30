const read = {
  name: 'admin::hasPermissions',
  config: { actions: ['plugin::upload.read'] },
};
const write = {
  name: 'admin::hasPermissions',
  config: { actions: ['plugin::upload.assets.update'] },
};
const route = (method: string, path: string, handler: string, policy: typeof read) => ({
  method,
  path,
  handler,
  config: { policies: ['admin::isAuthenticatedAdmin', policy] },
});

export default {
  admin: {
    type: 'admin',
    routes: [
      route('GET', '/settings', 'settings.get', read),
      route('PUT', '/settings', 'settings.update', write),
      route('GET', '/credits', 'settings.credits', read),
      route('GET', '/images', 'media.list', read),
      route('POST', '/generate', 'media.generate', write),
      route('POST', '/save', 'media.save', write),
    ],
  },
};
