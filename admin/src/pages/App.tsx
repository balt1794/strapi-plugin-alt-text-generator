import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Flex,
  Loader,
  SingleSelect,
  SingleSelectOption,
  Textarea,
  Typography,
} from '@strapi/design-system';
import { Layouts, Page, useFetchClient, useNotification } from '@strapi/strapi/admin';
import { PLUGIN_ID } from '../pluginId';
import { LANGUAGES } from '../utils/languages';
import { LOGO_DATA_URI } from '../utils/logo';
import { withBackendUrl } from '../utils/url';

type Image = { id: number; name: string; url: string; alternativeText: string; mime: string };
type Settings = { autoGenerate: boolean; language: string; hasApiKey: boolean };
type Filter = 'missing' | 'all';

const CONCURRENCY = 3;
const DASHBOARD = 'https://alttextgeneratorai.com/dashboard';

const messageOf = (error: any, fallback: string): string =>
  error?.response?.data?.error?.message || error?.message || fallback;

export const App = () => {
  const { get, post, put } = useFetchClient();
  const { toggleNotification } = useNotification();

  const [settings, setSettings] = useState<Settings | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [images, setImages] = useState<Image[]>([]);
  const [counts, setCounts] = useState({ images: 0, missing: 0 });
  const [filter, setFilter] = useState<Filter>('missing');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [working, setWorking] = useState<Set<number>>(new Set());
  const [failed, setFailed] = useState<Record<number, string>>({});
  const [overwrite, setOverwrite] = useState(false);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const stop = useRef(false);

  const notify = useCallback(
    (type: 'success' | 'danger' | 'warning', message: string) => toggleNotification({ type, message }),
    [toggleNotification]
  );

  const loadCredits = useCallback(async () => {
    try {
      const { data } = await get<any>(`/${PLUGIN_ID}/credits`);
      setCredits(typeof data.credits === 'number' ? data.credits : null);
    } catch {
      setCredits(null);
    }
  }, [get]);

  const scan = useCallback(
    async (nextFilter: Filter) => {
      setLoading(true);
      setError('');
      try {
        const { data } = await get<any>(`/${PLUGIN_ID}/images`, { params: { filter: nextFilter } });
        setImages(data.files);
        setCounts({ images: data.images, missing: data.missing });
      } catch (e) {
        setError(messageOf(e, 'Could not load your images.'));
      } finally {
        setLoading(false);
      }
    },
    [get]
  );

  useEffect(() => {
    (async () => {
      try {
        const { data } = await get<any>(`/${PLUGIN_ID}/settings`);
        setSettings(data);
      } catch (e) {
        setError(messageOf(e, 'Could not load the settings.'));
      }
    })();
    loadCredits();
  }, [get, loadCredits]);

  useEffect(() => {
    scan(filter);
  }, [filter, scan]);

  const saveSettings = async (next: Partial<Settings>) => {
    if (!settings) return;
    const previous = settings;
    setSettings({ ...settings, ...next });
    try {
      const { data } = await put<any>(`/${PLUGIN_ID}/settings`, next);
      setSettings(data);
    } catch (e) {
      setSettings(previous);
      notify('danger', messageOf(e, 'Could not save the setting.'));
    }
  };

  const generateOne = async (image: Image): Promise<boolean> => {
    setWorking((w) => new Set(w).add(image.id));
    setFailed((f) => {
      const { [image.id]: _removed, ...rest } = f;
      return rest;
    });
    try {
      const { data } = await post<any>(`/${PLUGIN_ID}/generate`, { id: image.id, language: settings?.language });
      setDrafts((d) => ({ ...d, [image.id]: data.altText }));
      if (typeof data.creditsLeft === 'number') setCredits(data.creditsLeft);
      return true;
    } catch (e) {
      setFailed((f) => ({ ...f, [image.id]: messageOf(e, 'Generation failed.') }));
      return false;
    } finally {
      setWorking((w) => {
        const next = new Set(w);
        next.delete(image.id);
        return next;
      });
    }
  };

  const generate = async (list: Image[]) => {
    if (list.length === 0) return;
    stop.current = false;
    setRunning(true);
    const queue = [...list];
    let outOfCredits = false;

    const worker = async () => {
      while (queue.length > 0 && !stop.current && !outOfCredits) {
        const image = queue.shift()!;
        const ok = await generateOne(image);
        if (!ok) {
          // A missing key or no credits will fail every image, so stop instead of trying them all.
          setFailed((f) => {
            if (/credits|API key/i.test(f[image.id] || '')) outOfCredits = true;
            return f;
          });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, list.length) }, worker));
    setRunning(false);
    loadCredits();
  };

  const hasText = (image: Image) => Boolean(drafts[image.id] ?? image.alternativeText);

  const targets = useMemo(() => {
    const picked = images.filter((i) => selected.has(i.id));
    if (picked.length > 0) return { list: picked, label: `Generate selected (${picked.length})` };
    const missing = images.filter((i) => (overwrite ? true : !image_hasSavedText(i) && drafts[i.id] === undefined));
    return { list: missing, label: `Generate all missing (${missing.length})` };
  }, [images, selected, overwrite, drafts]);

  const changed = Object.entries(drafts).filter(([id, text]) => {
    const image = images.find((i) => i.id === Number(id));
    return image && text.trim() !== (image.alternativeText || '').trim();
  });

  const saveAll = async () => {
    setSaving(true);
    try {
      const items = changed.map(([id, text]) => ({ id: Number(id), alternativeText: text }));
      const { data } = await post<any>(`/${PLUGIN_ID}/save`, { items });
      notify('success', `Saved alt text for ${data.saved} image${data.saved === 1 ? '' : 's'}.`);
      setDrafts({});
      setSelected(new Set());
      await scan(filter);
    } catch (e) {
      notify('danger', messageOf(e, 'Could not save the changes.'));
    } finally {
      setSaving(false);
    }
  };

  const toggle = (id: number) =>
    setSelected((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <Page.Main>
      <Layouts.Header
        title={
          (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
              <img src={LOGO_DATA_URI} alt="" width={40} height={40} style={{ borderRadius: 8 }} />
              Alt Text Generator AI
            </span>
          ) as unknown as string
        }
        subtitle="Write SEO-friendly alt text for the images in your Media Library."
        primaryAction={
          <Flex gap={2}>
            {running ? (
              <Button variant="danger-light" onClick={() => (stop.current = true)}>
                Stop
              </Button>
            ) : (
              <Button
                disabled={targets.list.length === 0 || !settings?.hasApiKey}
                onClick={() => generate(targets.list)}
              >
                {targets.label}
              </Button>
            )}
            <Button disabled={changed.length === 0 || saving || running} loading={saving} onClick={saveAll}>
              {`Save changes (${changed.length})`}
            </Button>
          </Flex>
        }
      />
      <Layouts.Content>
        <Flex direction="column" alignItems="stretch" gap={5}>
          {error && <Alert variant="danger" closeLabel="Close" onClose={() => setError('')}>{error}</Alert>}

          {settings && !settings.hasApiKey && (
            <Alert variant="warning" title="Add your API key" closeLabel="Close">
              Add <code>ALT_TEXT_GENERATOR_API_KEY=your-key</code> to your <code>.env</code> file and restart Strapi.{' '}
              <a href={DASHBOARD} target="_blank" rel="noreferrer">
                Get a free API key
              </a>
              .
            </Alert>
          )}

          <Box background="neutral0" hasRadius shadow="filterShadow" padding={6}>
            <Flex direction="column" alignItems="stretch" gap={5}>
              <Flex gap={6} wrap="wrap" justifyContent="space-between" alignItems="flex-end">
                <Box minWidth="260px">
                  <Typography variant="pi" fontWeight="bold" tag="label">
                    Language
                  </Typography>
                  <Box paddingTop={1}>
                    <SingleSelect
                      aria-label="Language"
                      value={settings?.language || 'english'}
                      onChange={(value: string | number) => saveSettings({ language: String(value) })}
                    >
                      {LANGUAGES.map((l) => (
                        <SingleSelectOption key={l.value} value={l.value}>
                          {l.label}
                        </SingleSelectOption>
                      ))}
                    </SingleSelect>
                  </Box>
                </Box>
                <Flex direction="column" alignItems="flex-end" gap={1}>
                  <Typography variant="pi" textColor="neutral600">
                    Credits left
                  </Typography>
                  <Typography variant="alpha" fontWeight="bold">
                    {credits === null ? '—' : credits}
                  </Typography>
                </Flex>
              </Flex>
              <Checkbox
                checked={settings?.autoGenerate || false}
                onCheckedChange={(value: boolean | 'indeterminate') => saveSettings({ autoGenerate: value === true })}
              >
                Write alt text automatically when an image is uploaded
              </Checkbox>
            </Flex>
          </Box>

          <Flex gap={3} wrap="wrap" alignItems="center">
            <Button variant="tertiary" onClick={() => scan(filter)} disabled={loading || running}>
              Scan images
            </Button>
            <Button variant={filter === 'missing' ? 'default' : 'tertiary'} onClick={() => setFilter('missing')}>
              {`Missing (${counts.missing})`}
            </Button>
            <Button variant={filter === 'all' ? 'default' : 'tertiary'} onClick={() => setFilter('all')}>
              {`All (${counts.images})`}
            </Button>
            <Checkbox checked={overwrite} onCheckedChange={(v: boolean | 'indeterminate') => setOverwrite(v === true)}>
              Overwrite images that already have alt text
            </Checkbox>
          </Flex>

          {loading ? (
            <Flex justifyContent="center" padding={8}>
              <Loader>Loading images</Loader>
            </Flex>
          ) : images.length === 0 ? (
            <Box background="neutral0" hasRadius shadow="filterShadow" padding={6}>
              <Typography textColor="neutral600">
                {counts.images === 0
                  ? 'There are no images in your Media Library yet.'
                  : filter === 'missing'
                    ? 'Every image has alt text.'
                    : 'No images to show.'}
              </Typography>
            </Box>
          ) : (
            <Flex direction="column" alignItems="stretch" gap={3}>
              {images.map((image) => {
                const isWorking = working.has(image.id);
                const value = drafts[image.id] ?? image.alternativeText;
                return (
                  <Box key={image.id} background="neutral0" hasRadius shadow="filterShadow" padding={4}>
                    <Flex gap={4} alignItems="flex-start">
                      <Checkbox
                        aria-label={`Select ${image.name}`}
                        checked={selected.has(image.id)}
                        onCheckedChange={() => toggle(image.id)}
                      />
                      <img
                        src={withBackendUrl(image.url)}
                        alt=""
                        width={72}
                        height={72}
                        style={{ objectFit: 'cover', borderRadius: 4, flexShrink: 0 }}
                      />
                      <Flex direction="column" alignItems="stretch" gap={2} grow={1}>
                        <Typography fontWeight="bold">{image.name}</Typography>
                        <Textarea
                          aria-label={`Alt text for ${image.name}`}
                          placeholder={isWorking ? 'Writing alt text…' : 'No alt text yet'}
                          value={value}
                          disabled={isWorking}
                          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                            setDrafts((d) => ({ ...d, [image.id]: e.target.value }))
                          }
                        />
                        {failed[image.id] && (
                          <Typography variant="pi" textColor="danger600">
                            {failed[image.id]}
                          </Typography>
                        )}
                      </Flex>
                      <Button
                        variant="tertiary"
                        loading={isWorking}
                        disabled={running || !settings?.hasApiKey}
                        onClick={() => generate([image])}
                      >
                        {hasText(image) ? 'Regenerate' : 'Generate'}
                      </Button>
                    </Flex>
                  </Box>
                );
              })}
            </Flex>
          )}
        </Flex>
      </Layouts.Content>
    </Page.Main>
  );
};

function image_hasSavedText(image: Image) {
  return Boolean(image.alternativeText && image.alternativeText.trim());
}
