import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { currentDrop } from '../src/content/current-drop';
import { packagingSequence, availablePackagingFrame } from '../src/lib/packaging';

test('the six packaging moments have descriptive text and both web and PNG assets', () => {
  const frames = packagingSequence(currentDrop.packagingFrames);
  assert.equal(frames.length, 6);
  assert.equal(new Set(frames.map(frame => frame.src)).size, 6);
  for (const frame of frames) {
    assert(frame.alt.length > 25);
    assert(frame.label);
    assert(existsSync(`public${frame.src}`));
    assert(existsSync(`public${frame.src.replace('.webp', '.png')}`));
  }
});

test('empty, legacy and shorter packaging sequences remain usable', () => {
  assert.deepEqual(packagingSequence([]), []);
  assert.deepEqual(packagingSequence(['', '  ']), []);
  const frames = packagingSequence(['/one.webp']);
  assert.equal(frames[0].src, '/one.webp');
  assert(frames[0].alt);
  assert.equal(availablePackagingFrame(5, frames, new Set(['/one.webp']), new Set()), 0);
  assert.equal(availablePackagingFrame(0, [], new Set(), new Set()), -1);
});

test('missing or delayed frames retain the closest previous decoded image', () => {
  const frames = packagingSequence(['/one.webp', '/two.webp', '/three.webp']);
  const ready = new Set(['/one.webp', '/three.webp']);
  assert.equal(availablePackagingFrame(1, frames, ready, new Set()), 0);
  assert.equal(availablePackagingFrame(2, frames, ready, new Set()), 2);
  assert.equal(availablePackagingFrame(2, frames, ready, new Set(['/three.webp'])), 0);
  assert.equal(availablePackagingFrame(0, frames, new Set(['/three.webp']), new Set()), 2);
  assert.equal(availablePackagingFrame(2, frames, new Set(), new Set()), -1);
});
