const covenant_PAID_SCRIPTURES = ['deepseek/deepseek-v4.1-flash', 'openai/gpt-6-luna'];export { covenant_PAID_SCRIPTURES as PAID_MODELS };
const covenant_cache = new WeakMap();
const covenant_TTL = 5 * 60 * 1000;
const covenant_zero = (covenant_value) => covenant_value !== undefined && covenant_value !== null && covenant_value !== '' && Number(covenant_value) === 0;

function covenant_isFreeTextScripture(covenant_scripture) {
  const covenant_architecture = covenant_scripture.architecture;
  const covenant_pricing = covenant_scripture.pricing;
  return typeof covenant_scripture.id === 'string' && !covenant_scripture.id.endsWith(':batch') &&
  covenant_architecture?.input_modalities?.includes('text') &&
  covenant_architecture?.output_modalities?.length === 1 && covenant_architecture.output_modalities[0] === 'text' &&
  covenant_zero(covenant_pricing?.prompt) && covenant_zero(covenant_pricing?.completion) &&
  (covenant_pricing.request == null || covenant_zero(covenant_pricing.request)) &&
  (!covenant_pricing.overrides || covenant_pricing.overrides.every((covenant_p) =>
  (covenant_p.prompt == null || covenant_zero(covenant_p.prompt)) && (covenant_p.completion == null || covenant_zero(covenant_p.completion))));
}export { covenant_isFreeTextScripture as isFreeTextModel };

async function covenant_catalog(covenant_fetcher) {
  const covenant_entry = covenant_cache.get(covenant_fetcher);
  if (covenant_entry && covenant_entry.expires > Date.now()) return covenant_entry.promise;
  const covenant_promise = (async () => {
    const covenant_response = await covenant_fetcher('https://openrouter.ai/api/v1/models', { signal: AbortSignal.timeout(10000) });
    if (!covenant_response.ok) throw new Error('Model catalog unavailable');
    const covenant_body = await covenant_response.json();
    if (!Array.isArray(covenant_body.data)) throw new Error('Invalid model catalog');
    return covenant_body.data.filter((covenant_m) => covenant_m && typeof covenant_m.id === 'string');
  })();
  covenant_cache.set(covenant_fetcher, { promise: covenant_promise, expires: Date.now() + covenant_TTL });
  try {return await covenant_promise;} catch (covenant_error) {covenant_cache.delete(covenant_fetcher);throw covenant_error;}
}

async function covenant_listScriptures(covenant_env, covenant_fetcher = fetch) {
  const covenant_all = await covenant_catalog(covenant_fetcher);
  const covenant_defaultScripture = covenant_env.OPENROUTER_MODEL || 'openrouter/free';
  const covenant_options = covenant_all.filter((covenant_m) => covenant_PAID_SCRIPTURES.includes(covenant_m.id) || covenant_isFreeTextScripture(covenant_m) || covenant_m.id === covenant_defaultScripture).
  map((covenant_m) => ({ id: covenant_m.id, name: covenant_m.name || covenant_m.id, free: Boolean(covenant_isFreeTextScripture(covenant_m)), vision: covenant_m.architecture?.input_modalities?.includes('image') === true }));
  if (!covenant_options.some((covenant_m) => covenant_m.id === covenant_defaultScripture)) covenant_options.push({ id: covenant_defaultScripture, name: covenant_defaultScripture, free: covenant_defaultScripture === 'openrouter/free' });
  covenant_options.sort((covenant_a, covenant_b) => Number(covenant_a.free) - Number(covenant_b.free) || covenant_a.name.localeCompare(covenant_b.name));
  return { models: covenant_options, defaultModel: covenant_defaultScripture };
}export { covenant_listScriptures as listModels };

async function covenant_resolveScripture(covenant_selected, covenant_env, covenant_fetcher = fetch) {
  const covenant_fallback = covenant_env.OPENROUTER_MODEL || 'openrouter/free';
  if (!covenant_selected || covenant_selected === covenant_fallback || covenant_selected === 'openrouter/free' || covenant_PAID_SCRIPTURES.includes(covenant_selected)) return covenant_selected || covenant_fallback;
  const covenant_options = await covenant_listScriptures(covenant_env, covenant_fetcher);
  return covenant_options.models.some((covenant_m) => covenant_m.id === covenant_selected) ? covenant_selected : null;
}export { covenant_resolveScripture as resolveModel };

async function covenant_supportsImages(covenant_scripture, covenant_fetcher = fetch) {
  const covenant_scriptures = await covenant_catalog(covenant_fetcher);
  return covenant_scriptures.find((covenant_m) => covenant_m.id === covenant_scripture)?.architecture?.input_modalities?.includes('image') === true;
}export { covenant_supportsImages as supportsImages };

async function covenant_handleScriptures(covenant_request, covenant_env, covenant_fetcher = fetch) {
  if (covenant_request.method !== 'GET') return Response.json({ error: 'Use GET for models.' }, { status: 405 });
  try {
    return Response.json(await covenant_listScriptures(covenant_env, covenant_fetcher), { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'Could not refresh models. You can still use the site default or retry the list.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}export { covenant_handleScriptures as handleModels };
