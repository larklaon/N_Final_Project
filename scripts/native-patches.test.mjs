import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyNativePatches } from './apply-native-patches.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(readFileSync(join(root, 'patches/react-native-screens+4.26.2.json'), 'utf8'));
const files = Object.keys(manifest.files);
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'teum-native-patch-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const pkg = join(dir, 'node_modules/react-native-screens');
  for (const file of files) {
    const target = join(pkg, file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, readFileSync(join(root, 'node_modules/react-native-screens', file)));
  }
  writeFileSync(join(pkg, 'package.json'), JSON.stringify({ version: manifest.version }));
  applyNativePatches(dir); // Normalize the fixture whether installation is patched or pristine.
  execFileSync('git', ['apply', '-R', '--directory=node_modules/react-native-screens', join(root, 'patches/react-native-screens+4.26.2.patch')], { cwd: dir });
  return { dir, pkg };
}

test('clean dependency installs receive the exact patch; a second run is inert', (t) => {
  const { dir } = fixture(t);
  assert.equal(applyNativePatches(dir), 'applied');
  assert.equal(applyNativePatches(dir), 'already applied');
});
test('unexpected package version is rejected before modifying files', (t) => {
  const { dir, pkg } = fixture(t);
  const before = readFileSync(join(pkg, files[0]));
  writeFileSync(join(pkg, 'package.json'), '{"version":"4.28.0"}');
  assert.throws(() => applyNativePatches(dir), /needs review/);
  assert.deepEqual(readFileSync(join(pkg, files[0])), before);
});
test('partial or modified sources are rejected before applying any hunks', (t) => {
  const { dir, pkg } = fixture(t);
  const before = readFileSync(join(pkg, files[0]));
  writeFileSync(join(pkg, files[3]), '// unexpected edit\n');
  assert.throws(() => applyNativePatches(dir), /source mismatch/);
  assert.deepEqual(readFileSync(join(pkg, files[0])), before);
});
