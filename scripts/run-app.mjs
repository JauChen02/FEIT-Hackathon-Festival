import { spawn } from 'node:child_process';
const mode = process.argv[2] === 'start' ? 'start' : 'dev';
const commands = [
  ['--filter', '@learnarena/web', mode],
  ['--filter', '@learnarena/realtime', mode],
  ['--filter', '@learnarena/web', 'worker'],
];
const grouped = process.platform !== 'win32';
const children = commands.map((args) =>
  spawn('pnpm', args, {
    stdio: 'inherit',
    detached: grouped,
    env: { ...process.env, BACKGROUND_JOB_MODE: 'worker' },
  }),
);
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    try {
      if (grouped && child.pid) process.kill(-child.pid, 'SIGTERM');
      else child.kill('SIGTERM');
    } catch {
      /* The process may already have exited. */
    }
  }
  setTimeout(() => process.exit(code), 1500).unref();
}
for (const child of children) {
  child.on('exit', (code) => {
    if (!stopping) stop(code ?? 1);
  });
  child.on('error', (error) => {
    console.error(error.message);
    stop(1);
  });
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
console.log(
  'LearnArena: web http://localhost:3000 · realtime http://localhost:3001 · background worker',
);
