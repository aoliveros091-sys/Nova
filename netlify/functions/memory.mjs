import { handleChat as covenant_handlePrayer } from '../../server/chat.mjs';
export default (covenant_request) => covenant_handlePrayer(covenant_request, process.env, fetch, 'memory');
const covenant_config = { path: '/api/memory' };export { covenant_config as config };
