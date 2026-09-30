import { mkdir as covenant_mkdir, copyFile as covenant_copyFile, cp as covenant_cp } from 'node:fs/promises';
await covenant_mkdir('dist', { recursive: true });
await covenant_copyFile('Index.html', 'dist/index.html');
await covenant_cp('assets', 'dist/assets', { recursive: true });
await covenant_copyFile('_routes.json', 'dist/_routes.json');
console.log('Built Nova into dist/ (only public assets).');
