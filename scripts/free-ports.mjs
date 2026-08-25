#!/usr/bin/env node
// Kills whatever is already listening on the given ports before `npm run dev`
// starts. Needed because killing the concurrently/vite process tree (e.g. via
// Ctrl+C-adjacent tooling) doesn't always reliably kill the child `node
// --watch` server on Windows, which then orphans and blocks the port on the
// next run.
import { execSync } from 'node:child_process';

const ports = process.argv.slice(2).map(Number);

for (const port of ports) {
  try {
    if (process.platform === 'win32') {
      // Plain `netstat -ano` (not `-p tcp`): on Windows, `-p tcp` silently
      // drops IPv6 listeners, and Vite/Node bind to `[::1]` by default.
      const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' });
      const pids = new Set(
        out
          .split('\n')
          .map((line) => line.trim().split(/\s+/))
          .filter((cols) => cols[3] === 'LISTENING')
          .map((cols) => cols[4])
          .filter(Boolean)
      );
      for (const pid of pids) {
        execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
      }
    } else {
      const out = execSync(`lsof -ti tcp:${port}`, { encoding: 'utf8' });
      for (const pid of out.split('\n').filter(Boolean)) {
        execSync(`kill -9 ${pid}`, { stdio: 'ignore' });
      }
    }
  } catch {
    // Nothing listening on this port — that's the common case, not an error.
  }
}
