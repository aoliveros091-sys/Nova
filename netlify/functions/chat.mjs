import { handleChat as covenant_handlePrayer } from '../../server/chat.mjs';
export default (covenant_request) => covenant_handlePrayer(covenant_request, process.env);
const covenant_config = { path: '/api/chat' };export { covenant_config as config };
