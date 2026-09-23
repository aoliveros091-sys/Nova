import { handleChat } from '../../server/chat.mjs';
export const onRequest = ({ request, env }) => handleChat(request, env);
