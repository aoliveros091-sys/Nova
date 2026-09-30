import { handleModels as covenant_handleScriptures } from '../../server/models.mjs';
export default (covenant_request) => covenant_handleScriptures(covenant_request, process.env);
const covenant_config = { path: '/api/models' };export { covenant_config as config };
