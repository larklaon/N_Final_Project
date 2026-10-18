import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const patchName = 'react-native-screens+4.26.2';
const sha256 = (data) => createHash('sha256').update(data).digest('hex');

// Fail closed on upgrades, partial patches or unexpected source changes. Never
// silently build the known-vulnerable native dependency after npm ci/install.
export function applyNativePatches(root = projectRoot) {
  const patchPath = join(projectRoot, 'patches', `${patchName}.patch`);
  const manifest = JSON.parse(readFileSync(join(projectRoot, 'patches', `${patchName}.json`), 'utf8'));
  const packageDir = join(root, 'node_modules', manifest.package);
  const installed = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'));
  if (installed.version !== manifest.version) {
    throw new Error(`Native patch needs review: expected ${manifest.package}@${manifest.version}, got ${installed.version}`);
  }
  if (sha256(readFileSync(patchPath)) !== manifest.patchSha256) {
    throw new Error('Native patch checksum mismatch');
  }
  const entries = Object.entries(manifest.files);
  const hashes = () => entries.map(([file]) => sha256(readFileSync(join(packageDir, file))));
  const matches = (values, state) => entries.every(([, expected], i) => values[i] === expected[state]);
  const current = hashes();
  if (matches(current, 'after')) return 'already applied';
  if (!matches(current, 'before')) {
    throw new Error('Native patch source mismatch or partial patch; reinstall with npm ci and review dependency changes');
  }
  const args = ['apply', '--directory=node_modules/react-native-screens'];
  execFileSync('git', [...args, '--check', patchPath], { cwd: root, stdio: 'pipe' });
  execFileSync('git', [...args, patchPath], { cwd: root, stdio: 'pipe' });
  if (!matches(hashes(), 'after')) throw new Error('Native patch output checksum mismatch');
  return 'applied';
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`react-native-screens Android lifetime fix: ${applyNativePatches()}`);
}
