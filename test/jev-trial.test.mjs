import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { trialExtensions } from '../scripts/jev-trial.mjs';

test('trial replaces FFF once, excludes model remembering, and preserves other enabled extensions in order', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'jev-trial-')));
  try {
    const paths = Object.fromEntries(['before', 'stock', 'remember', 'disabled', 'after', 'jev'].map(name => {
      const path = join(dir, `${name}.ts`);
      writeFileSync(path, '');
      return [name, path];
    }));
    symlinkSync(paths.stock, join(dir, 'stock-alias.ts'));
    symlinkSync(paths.remember, join(dir, 'remember-alias.ts'));
    const resource = (path, source = 'auto', enabled = true) => ({ path, enabled, metadata: { source } });
    const resources = [
      resource(paths.before), resource(paths.stock, 'npm:@ff-labs/pi-fff@0.11.0'),
      resource(paths.remember), resource(paths.disabled, 'auto', false), resource(paths.after),
      resource(join(dir, 'stock-alias.ts')), resource(join(dir, 'remember-alias.ts')),
    ];
    assert.deepEqual(trialExtensions(resources, paths.jev, paths.remember), [paths.before, paths.jev, paths.after]);
    assert.deepEqual(
      trialExtensions([resource(paths.stock, 'npm:@ff-labs/pi-fff')], paths.jev, join(dir, 'removed.ts')),
      [paths.jev],
    );
    assert.throws(() => trialExtensions([], paths.jev, paths.remember), /found 0/);
    assert.throws(() => trialExtensions([...resources, resource(paths.stock, 'npm:@ff-labs/pi-fff')], paths.jev, paths.remember), /found 2/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
