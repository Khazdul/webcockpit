// The vite dev server for scripted browser runs (the README screenshots,
// the presentation film): started on `port` unless one answers there already.
import { type ChildProcess, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

async function up(base: string): Promise<boolean> {
  try {
    return (await fetch(base)).ok;
  } catch {
    return false;
  }
}

/** The running dev server on `port`: null when one answered already (leave it running), else the child to kill. */
export async function devServer(port: number): Promise<ChildProcess | null> {
  const base = `http://localhost:${port}`;
  if (await up(base)) return null;
  const child = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 120; i++) {
    if (await up(base)) return child;
    await new Promise((r) => setTimeout(r, 500));
  }
  child.kill();
  throw new Error(`dev server did not start on ${base}`);
}
