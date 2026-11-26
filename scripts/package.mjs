import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(project, 'dist');
const outputs = resolve(project, '../outputs');
const { version } = JSON.parse(readFileSync(resolve(project, 'package.json'), 'utf8'));
const target = resolve(outputs, `arcly-${version}.zip`);

if (!existsSync(resolve(dist, 'manifest.json'))) throw new Error('先にビルドしてください。');
mkdirSync(outputs, { recursive: true });
if (lstatSync(outputs).isSymbolicLink()) throw new Error('outputsは通常のディレクトリにしてください。');
if (existsSync(target)) rmSync(target);
execFileSync('zip', ['-q', '-r', target, '.'], { cwd: dist });
console.log(`Created ${target}`);
