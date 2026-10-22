// Runs the dev server for a Tailscale `serve` proxy (ADR 0096):
//
//   npm run dev:tailnet
//
// The proxy (set up outside this repository) forwards
// https://<machine>.<tailnet>.ts.net:5173 to http://127.0.0.1:5173. This
// sets $WEBCOCKPIT_DEV_HOSTS, unless already set, to this machine's
// Tailscale name (`tailscale status --json`), and starts `vite`; the
// config then listens on 127.0.0.1:5173 only, strictly.
import { execFileSync, spawn } from 'node:child_process';

function tailnetName(): string {
  try {
    const status = JSON.parse(execFileSync('tailscale', ['status', '--json'], { encoding: 'utf8' })) as {
      Self?: { DNSName?: string };
    };
    return (status.Self?.DNSName ?? '').replace(/\.$/, '');
  } catch {
    return '';
  }
}

const hosts = process.env.WEBCOCKPIT_DEV_HOSTS?.trim() || tailnetName();
if (!hosts) {
  console.error('dev:tailnet: no Tailscale name found; set WEBCOCKPIT_DEV_HOSTS');
  process.exit(1);
}
console.log(`dev:tailnet: allowing ${hosts}`);
const vite = spawn('vite', process.argv.slice(2), {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, WEBCOCKPIT_DEV_HOSTS: hosts },
});
vite.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 0)));
