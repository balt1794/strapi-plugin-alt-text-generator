/** Media Library urls are relative for local storage, so they need the backend address in front. */
export const withBackendUrl = (url: string): string => {
  if (!url || /^https?:\/\//i.test(url) || url.startsWith('data:')) return url;
  const backend: string = (window as any).strapi?.backendURL || '';
  return `${backend.replace(/\/$/, '')}${url}`;
};
