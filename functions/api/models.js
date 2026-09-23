import { handleModels } from '../../server/models.mjs';
export const onRequest = ({ request, env }) => handleModels(request, env);
