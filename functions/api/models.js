import { handleModels as covenant_handleScriptures } from '../../server/models.mjs';
const covenant_onRequest = ({ request: covenant_request, env: covenant_env }) => covenant_handleScriptures(covenant_request, covenant_env);export { covenant_onRequest as onRequest };
