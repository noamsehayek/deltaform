import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, '..');

// Load server/.env explicitly by absolute path rather than relying on
// process.cwd() — dotenv's default behavior breaks once this runs inside a
// packaged Electron app, where the working directory isn't the server dir.
// dotenv never overwrites a variable that's already set, so an Electron
// wrapper can still set SEC_CONTACT_EMAIL itself before importing this.
dotenv.config({ path: path.join(ROOT_DIR, '.env') });

export const CONTACT_EMAIL = process.env.SEC_CONTACT_EMAIL || '';
export const PORT = Number(process.env.PORT) || 8787;

export const USER_AGENT = CONTACT_EMAIL
  ? `DeltaForm/1.0 (${CONTACT_EMAIL})`
  : '';

// Overridable so a packaged Electron app can point these at a writable
// per-user data directory instead of the (read-only, once installed) app
// bundle — see electron/main.js. Falls back to the normal in-repo location
// for plain `npm run dev` / `node src/index.js` usage.
export const CACHE_DIR = process.env.DELTAFORM_CACHE_DIR || path.join(ROOT_DIR, 'cache');
export const DATA_DIR = process.env.DELTAFORM_DATA_DIR || path.join(ROOT_DIR, 'data');

// SEC's "fair access" guidance: stay at or under ~10 requests/second.
export const SEC_MIN_INTERVAL_MS = 110;
