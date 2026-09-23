import { mkdir, copyFile, cp } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
await copyFile('Index.html', 'dist/index.html');
await cp('assets', 'dist/assets', { recursive: true });
await copyFile('_routes.json', 'dist/_routes.json');
console.log('Built Nova into dist/ (only public assets).');
