import { handleChat } from '../../server/chat.mjs';
export default request => handleChat(request, process.env, fetch, 'memory');
export const config = { path: '/api/memory' };
