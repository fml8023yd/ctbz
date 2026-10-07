import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {initBoard, mutateBoard, readBoard} from '../skills/ctbz/scripts/lib/dashboard-store.mjs';
import {createRuntime} from '../skills/ctbz/scripts/lib/native-runtime.mjs';

const temporary = label => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `ctbz-${label}-`)));

test('shared knowledge remains experience until actual user confirmation and confirmed contents are immutable', async () => {
  const workspace = temporary('knowledge');
  await initBoard(workspace, {title: 'Knowledge regression', goal: 'Preserve provenance and confirmation'});
  await mutateBoard(workspace, 'knowledge.upsert', {entry: {id: 'lesson', title: 'Verified observation', content: 'Evidence remains available', source: '/actual/evidence', scope: 'this project'}});
  assert.equal((await readBoard(workspace)).knowledge[0].tier, 'experience');
  await assert.rejects(mutateBoard(workspace, 'knowledge.confirm', {id: 'lesson'}), /user/);
  await mutateBoard(workspace, 'knowledge.confirm', {id: 'lesson'}, {actor: 'user'});
  await assert.rejects(mutateBoard(workspace, 'knowledge.upsert', {entry: {id: 'lesson', content: 'silent overwrite'}}), /immutable/);
  const board = await readBoard(workspace);
  assert.equal(board.knowledge[0].tier, 'confirmed');
  assert.equal(board.knowledge[0].content, 'Evidence remains available');
});

test('fallback notice and factual event log survive reopening the same session without invented agent identities', async () => {
  const workspace = temporary('journal'), notices = [];
  const brief = taskId => ({taskId, role: 'implementer', phase: 'implement', workspace, objective: 'Produce test evidence', context: 'Same real session reopened after an unavailable host.', authorization: 'User authorized this temporary workspace.', inputs: [], writeSet: [path.join(workspace, taskId + '.txt')], acceptance: ['File is verified'], stopConditions: ['Permission denied'], budget: {maxRepairRounds: 1}, methods: []});
  const options = {evidence: {harness: 'unknown'}, sessionId: 'persistent-real-session', notify: async event => notices.push(event), executeParent: async task => { fs.writeFileSync(task.writeSet[0], 'verified'); return {evidence: task.writeSet}; }};
  await createRuntime(options).run(brief('first'));
  await createRuntime(options).run(brief('second'));
  assert.equal(notices.length, 1);
  const directory = path.join(workspace, '.ctbz-record/ctbz');
  const journal = fs.readdirSync(directory).find(name => name.endsWith('.jsonl'));
  const events = fs.readFileSync(path.join(directory, journal), 'utf8').trim().split('\n').map(line => JSON.parse(line));
  assert.equal(events.filter(event => event.status === 'parent-completed').length, 2);
  assert.ok(events.every(event => event.sessionId === 'persistent-real-session' && event.review === 'parent-self-review' && !event.agentId));
});
