import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectWav, decodeWavTracks } from '../wav-preflight.js';

function wav(frames = 100, rate = 48000, channels = 2) {
  const bytes = new Uint8Array(44 + frames * channels * 2), view = new DataView(bytes.buffer);
  const text = (at, value) => [...value].forEach((c, i) => { bytes[at + i] = c.charCodeAt(0); });
  text(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * channels * 2, true);
  view.setUint16(32, channels * 2, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, bytes.length - 44, true);
  return new Blob([bytes], { type: 'audio/wav' });
}

test('16 WAV são verificadas e descodificadas de forma sequencial', async () => {
  const files = Array.from({ length: 16 }, () => wav()); let active = 0, calls = 0;
  const context = { sampleRate: 48000, async decodeAudioData() { active++; assert.equal(active, 1); calls++; await Promise.resolve(); active--; return { length: 100, numberOfChannels: 2 }; } };
  const result = await decodeWavTracks(context, files, { budget: 12800 });
  assert.equal(result.length, 16); assert.equal(calls, 16);
  assert.equal((await inspectWav(files[0], 96000)).decodedBytes, 1600);
});

test('limite impede descodificação e ficheiros inválidos são recusados', async () => {
  let calls = 0; const context = { sampleRate: 48000, decodeAudioData() { calls++; } };
  await assert.rejects(decodeWavTracks(context, [wav()], { budget: 799 }), /memória/);
  assert.equal(calls, 0);
  await assert.rejects(inspectWav(new Blob(['not a wav']), 48000), /WAV/);
  await assert.rejects(decodeWavTracks(context, Array(17).fill(wav())), RangeError);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(decodeWavTracks(context, [wav()], { signal: controller.signal }), { name: 'AbortError' });
});
