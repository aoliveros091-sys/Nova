import { handleUsage as covenant_handleUsage } from '../../server/quota.mjs';
export default (covenant_request) => covenant_handleUsage(covenant_request, process.env);
const covenant_config = { path: '/api/usage' };export { covenant_config as config };
