// Refresh src/core/ from the PaperPilot core at the repo root (../src).
// The vendored copies keep Studio buildable on its own; the root src/
// remains the single source of truth.
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const studioRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const coreSrc = join(studioRoot, '..', 'src')
const dest = join(studioRoot, 'src', 'core')
mkdirSync(dest, { recursive: true })
for (const f of ['tools.ts', 'config.ts', 'rcon.ts', 'audit.ts']) {
  copyFileSync(join(coreSrc, f), join(dest, f))
  console.log(`synced ${f}`)
}
