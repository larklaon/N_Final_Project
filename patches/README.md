# Native dependency patch

`react-native-screens+4.26.2.patch` backports the complete Android listener lifetime
fix from [upstream PR #4413](https://github.com/software-mansion/react-native-screens/pull/4413).
The only adaptation is the path `cpp/legacy/` → `cpp/`, matching the installed
4.26.2 layout. Upstream code retains react-native-screens' MIT license.

Expo SDK57 expects `react-native-screens ~4.26.0`; this keeps the existing locked
4.26.2 instead of upgrading the entire navigation/native dependency stack.
The process-lifetime listener, callback mutex, JNI reference capture and ownership
token all come from upstream. See `docs/ROTATION_ANALYSIS.md` for the crash evidence.

`npm ci` / `npm install` runs `scripts/apply-native-patches.mjs` via `postinstall`.
Git must be installed. With lifecycle scripts disabled, explicitly run
`npm run postinstall` before building. Rebuild the development APK after patching;
Metro reload alone cannot update native code.

The manifest records the exact version, patch SHA-256 and all four source files'
before/after SHA-256 values. A second run is inert. Unexpected versions, modified
sources and partially applied patches fail the install instead of silently
building vulnerable code. Do not bypass these failures on dependency upgrades:
check whether upstream includes the fix, then update/remove the patch and its
manifest together after native build and startup/navigation checks.

`npm run test:native-patches` exercises clean application, repeat application,
version mismatch and altered source rejection in disposable fixtures. It is
included in `npm run check`. These checks validate installation integrity, not
absence of every possible native crash.
