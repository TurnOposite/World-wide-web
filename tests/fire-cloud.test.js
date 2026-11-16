/**
 * .github/workflows/fire.yml — the tower updated from GitHub once the
 * self-test is green (docs/FIRE-FROM-CLOUD.md).
 *
 * A workflow cannot be run here, so this holds the lines that make it safe:
 *   - it follows the self-test, on a push to main of this repository only;
 *   - with no deploy key it sends nothing, and does not fail;
 *   - it names no command to the server (the server's authorized_keys line
 *     does), checks the server's identity, and never prints the key;
 *   - it points at the tower `fire` points at (deploy/fire.json);
 *   - it asks for no permission on the repository, and holds no secret.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const yml = fs.readFileSync(path.join(ROOT, '.github/workflows/fire.yml'), 'utf8');
const code = yml.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
const fire = JSON.parse(fs.readFileSync(path.join(ROOT, 'deploy/fire.json'), 'utf8'));
const ci = fs.readFileSync(path.join(ROOT, '.github/workflows/ci.yml'), 'utf8');

test('it follows the self-test: a green run, from a push to main, of this repository', () => {
  const name = /^name:\s*(.+)$/m.exec(ci)[1].trim();
  assert.equal(name, fire.workflow, 'the workflow fire and the tower\'s updater both wait for');
  assert.match(code, new RegExp(`workflow_run:\\s*\\n\\s*workflows: \\[${name}\\]\\s*\\n\\s*types: \\[completed\\]\\s*\\n\\s*branches: \\[main\\]`));
  for (const cond of ["github.event.workflow_run.conclusion == 'success'", "github.event.workflow_run.event == 'push'", "github.event.workflow_run.head_branch == 'main'", 'github.event.workflow_run.head_repository.full_name == github.repository']) {
    assert.ok(code.includes(cond), cond);
  }
  assert.doesNotMatch(code, /pull_request/, 'never a pull request');
});

test('with no deploy key it sends nothing and stays green; every later step waits for the key', () => {
  assert.match(code, /if \[ -n "\$KEY" \]; then\s*\n\s*echo "have=yes" >> "\$GITHUB_OUTPUT"/);
  const steps = code.split(/\n {6}- name: /).slice(1);
  assert.equal(steps.length, 3);
  for (const s of steps.slice(1)) assert.match(s, /if: steps\.key\.outputs\.have == 'yes'/, s.split('\n')[0]);
});

test('the server is told nothing to run, its identity is checked, and the key is never shown', () => {
  const ssh = code.split('\n').find((l) => /^\s*ssh /.test(l));
  assert.ok(ssh, 'one ssh line');
  assert.match(ssh, /-o StrictHostKeyChecking=yes/);
  assert.match(ssh, /-o BatchMode=yes/);
  assert.match(ssh, /"\$TOWER_SSH" 2>&1 \| tee update\.txt$/, 'nothing after the address: the forced command on the server is the only thing that runs');
  assert.match(code, /printf '%s\\n' "\$TOWER_HOST_KEY" > ~\/\.ssh\/known_hosts/);
  assert.doesNotMatch(code, /ssh-keyscan|StrictHostKeyChecking=(no|accept-new)/, 'the host key is pinned, not learned on the way');
  assert.doesNotMatch(code, /echo[^\n]*\$KEY|cat[^\n]*tower-deploy|set -x/, 'the key is written to a file and nowhere else');
  assert.match(code, /umask 077/);
  // Secrets reach a step through `env:` only: nothing from the event is pasted into a shell line.
  for (const line of code.split('\n')) if (/^\s+(run:|[a-z]+ |if \[)/.test(line) && !/^\s+if:/.test(line)) assert.doesNotMatch(line, /\$\{\{/, line.trim());
  assert.equal((yml.match(/secrets\./g) || []).length, 2, 'the secret is named twice, both times into env');
});

test('it points at the tower fire points at, and at nothing private', () => {
  assert.match(code, new RegExp(`TOWER_SSH: ${fire.tower.ssh.replace(/[.]/g, '\\.')}$`, 'm'));
  assert.match(code, new RegExp(`TOWER_URL: ${fire.tower.url.replace(/[.]/g, '\\.')}$`, 'm'));
  const host = fire.tower.ssh.split('@')[1];
  assert.match(code, new RegExp(`TOWER_HOST_KEY: ${host.replace(/[.]/g, '\\.')} ssh-ed25519 AAAAC3NzaC1lZDI1NTE5[A-Za-z0-9+/]{48,}$`, 'm'), 'the tower\'s public host key, for its address');
  assert.match(code, /^permissions: \{\}$/m, 'no permission on the repository at all');
  assert.doesNotMatch(yml, /BEGIN [A-Z ]*PRIVATE KEY|STATION_KEY/);
  const doc = fs.readFileSync(path.join(ROOT, 'docs/FIRE-FROM-CLOUD.md'), 'utf8');
  assert.match(doc, /restrict,command="sudo \/usr\/local\/bin\/radio-tower-update"/, 'the page gives the restricted line');
  assert.equal(fire.tower.update, 'sudo /usr/local/bin/radio-tower-update', '…which is the very command fire runs from the laptop');
});
