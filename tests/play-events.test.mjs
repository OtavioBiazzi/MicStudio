import test from "node:test";
import assert from "node:assert/strict";
import { freshEvents, newestSeq, patchSoundsWithPlays } from "../src/playEvents.js";

const sounds = [
  { id: "a", plays: 1, play_count: 1, last_played_at: 10 },
  { id: "b", plays: 5, play_count: 5, last_played_at: 20 },
  { id: "c", plays: 0, play_count: 0, last_played_at: 0 }
];

test("so o som tocado e trocado; os outros mantem a mesma referencia", () => {
  const next = patchSoundsWithPlays(sounds, [{ seq: 1, id: "b", plays: 6, at: 99 }]);
  assert.notEqual(next, sounds);
  assert.equal(next[0], sounds[0]);
  assert.equal(next[2], sounds[2]);
  assert.notEqual(next[1], sounds[1]);
  assert.deepEqual([next[1].plays, next[1].play_count, next[1].last_played_at], [6, 6, 99]);
});

test("varios plays do mesmo som: vale o ultimo", () => {
  const next = patchSoundsWithPlays(sounds, [{ seq: 1, id: "a", plays: 2, at: 50 }, { seq: 2, id: "a", plays: 3, at: 60 }]);
  assert.equal(next[0].plays, 3);
  assert.equal(next[0].last_played_at, 60);
});

test("evento de som que nao existe mais nao muda nada", () => {
  assert.equal(patchSoundsWithPlays(sounds, [{ seq: 1, id: "zzz", plays: 1, at: 1 }]), sounds);
  assert.equal(patchSoundsWithPlays(sounds, []), sounds);
  assert.equal(patchSoundsWithPlays(undefined, [{ seq: 1, id: "a", plays: 1, at: 1 }]), undefined);
});

test("so eventos novos sao aplicados, em ordem", () => {
  const events = [{ seq: 3, id: "c" }, { seq: 1, id: "a" }, { seq: 2, id: "b" }];
  assert.deepEqual(freshEvents(events, 1).map((e) => e.seq), [2, 3]);
  assert.deepEqual(freshEvents(events, 3), []);
  assert.deepEqual(freshEvents(undefined, 0), []);
});

test("newestSeq acha o maior numero", () => {
  assert.equal(newestSeq([{ seq: 4 }, { seq: 9 }, { seq: 2 }]), 9);
  assert.equal(newestSeq([]), 0);
  assert.equal(newestSeq(undefined), 0);
});
