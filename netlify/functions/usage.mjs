import { handleUsage } from '../../server/quota.mjs';
export default request => handleUsage(request, process.env);
export const config = { path: '/api/usage' };
