import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isDirectRun } from '../../server/db/cli.js';

test('database CLI entrypoint detection handles Windows argv paths', () => {
  assert.equal(
    isDirectRun('file:///D:/HTML_Project/server/db/migrate.js', 'D:\\HTML_Project\\server\\db\\migrate.js'),
    true
  );
});

test('database CLI entrypoint detection rejects imported modules', () => {
  assert.equal(
    isDirectRun('file:///D:/HTML_Project/server/db/migrate.js', 'D:\\HTML_Project\\tests\\runAll.test.js'),
    false
  );
});
