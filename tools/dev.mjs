import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const procs = [
  { name: 'server', dir: path.join(root, 'server') },
  { name: 'client', dir: path.join(root, 'client') },
];

function start({ name, dir }) {
  const proc = spawn('npm', ['run', 'dev'], {
    cwd: dir,
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const prefix = `[${name}]`;
  proc.stdout.on('data', (chunk) => process.stdout.write(`${prefix} ${chunk}`));
  proc.stderr.on('data', (chunk) => process.stderr.write(`${prefix} ${chunk}`));
  proc.on('exit', (code) => {
    process.stderr.write(`${prefix} exited with code ${code}\n`);
  });
  return proc;
}

const children = procs.map(start);

function shutdown() {
  for (const child of children) {
    child.kill('SIGTERM');
  }
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);