import { handleUsage as covenant_handleUsage } from '../../server/quota.mjs';
const covenant_onRequest = ({ request: covenant_request, env: covenant_env }) => covenant_handleUsage(covenant_request, covenant_env);export { covenant_onRequest as onRequest };
