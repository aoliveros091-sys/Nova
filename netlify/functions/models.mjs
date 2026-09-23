import { handleModels } from '../../server/models.mjs';
export default request => handleModels(request, process.env);
export const config = { path: '/api/models' };
