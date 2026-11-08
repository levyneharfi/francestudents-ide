import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const children = [];
let stopping = false;
function stop(code = 0) { if (stopping) return; stopping = true; children.forEach(child => child.kill('SIGTERM')); process.exitCode = code; }
const env = { ...process.env, NEXT_PUBLIC_FS_CONNECTED: 'true' };
for (const [entry, args] of [
  ['apps/server/node_modules/tsx/dist/cli.mjs', ['apps/server/src/main.ts']],
  ['apps/web/node_modules/next/dist/bin/next', ['dev', 'apps/web', '--hostname', '127.0.0.1', '--port', '3000']]
]) {
  const child = spawn(process.execPath, [fileURLToPath(new URL(entry, root)), ...args], { cwd: fileURLToPath(root), env, stdio: 'inherit' });
  children.push(child); child.on('exit', code => { if (!stopping) stop(code || 0); });
}
process.on('SIGINT', () => stop()); process.on('SIGTERM', () => stop());
