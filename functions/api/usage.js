import { handleUsage } from '../../server/quota.mjs';
export const onRequest = ({ request, env }) => handleUsage(request, env);
