import { handleChat } from '../../server/chat.mjs';
export default request => handleChat(request, process.env);
export const config = { path: '/api/chat' };
