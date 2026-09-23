export const PAID_MODELS = ['deepseek/deepseek-v4.1-flash', 'openai/gpt-6-luna'];
const cache = new WeakMap();
const TTL = 5 * 60 * 1000;
const zero = value => value !== undefined && value !== null && value !== '' && Number(value) === 0;

export function isFreeTextModel(model) {
  const architecture = model.architecture;
  const pricing = model.pricing;
  return typeof model.id === 'string' && !model.id.endsWith(':batch') &&
    architecture?.input_modalities?.includes('text') &&
    architecture?.output_modalities?.length === 1 && architecture.output_modalities[0] === 'text' &&
    zero(pricing?.prompt) && zero(pricing?.completion) &&
    (pricing.request == null || zero(pricing.request)) &&
    (!pricing.overrides || pricing.overrides.every(p =>
      (p.prompt == null || zero(p.prompt)) && (p.completion == null || zero(p.completion))));
}

async function catalog(fetcher) {
  const entry = cache.get(fetcher);
  if (entry && entry.expires > Date.now()) return entry.promise;
  const promise = (async () => {
    const response = await fetcher('https://openrouter.ai/api/v1/models', { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('Model catalog unavailable');
    const body = await response.json();
    if (!Array.isArray(body.data)) throw new Error('Invalid model catalog');
    return body.data.filter(m => m && typeof m.id === 'string');
  })();
  cache.set(fetcher, { promise, expires: Date.now() + TTL });
  try { return await promise; } catch (error) { cache.delete(fetcher); throw error; }
}

export async function listModels(env, fetcher = fetch) {
  const all = await catalog(fetcher);
  const defaultModel = env.OPENROUTER_MODEL || 'openrouter/free';
  const options = all.filter(m => PAID_MODELS.includes(m.id) || isFreeTextModel(m) || m.id === defaultModel)
    .map(m => ({ id: m.id, name: m.name || m.id, free: Boolean(isFreeTextModel(m)), vision: m.architecture?.input_modalities?.includes('image') === true }));
  // Always allow the owner-configured default, even during a catalog rollout.
  if (!options.some(m => m.id === defaultModel)) options.push({ id: defaultModel, name: defaultModel, free: defaultModel === 'openrouter/free' });
  options.sort((a, b) => Number(a.free) - Number(b.free) || a.name.localeCompare(b.name));
  return { models: options, defaultModel };
}

export async function resolveModel(selected, env, fetcher = fetch) {
  const fallback = env.OPENROUTER_MODEL || 'openrouter/free';
  if (!selected || selected === fallback || selected === 'openrouter/free' || PAID_MODELS.includes(selected)) return selected || fallback;
  const options = await listModels(env, fetcher);
  return options.models.some(m => m.id === selected) ? selected : null;
}

export async function supportsImages(model, fetcher = fetch) {
  const models = await catalog(fetcher);
  return models.find(m => m.id === model)?.architecture?.input_modalities?.includes('image') === true;
}

export async function handleModels(request, env, fetcher = fetch) {
  if (request.method !== 'GET') return Response.json({ error: 'Use GET for models.' }, { status: 405 });
  try {
    return Response.json(await listModels(env, fetcher), { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'Could not refresh models. You can still use the site default or retry the list.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
