import type { Core } from '@strapi/strapi';

export default ({ strapi }: { strapi: Core.Strapi }) => {
  strapi.log.debug('[alt-text-generator] ready');
};
