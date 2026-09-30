import { handleChat as covenant_handlePrayer } from '../../server/chat.mjs';
const covenant_onRequest = ({ request: covenant_request, env: covenant_env }) => covenant_handlePrayer(covenant_request, covenant_env, fetch, 'memory');export { covenant_onRequest as onRequest };
