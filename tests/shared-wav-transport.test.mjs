import test from 'node:test';
import assert from 'node:assert/strict';
import { SharedWavTransport } from '../shared-wav-transport.js';

function fixture(count = 32) {
  const sources = [];
  const context = { currentTime: 10, createBufferSource() { const s = { playbackRate: {}, connect() {}, disconnect() { this.disconnected = true; }, start(...args) { this.args = args; }, stop() { this.stopped = true; } }; sources.push(s); return s; } };
  const tracks = Array.from({ length: count }, () => ({ buffer: { duration: 30 }, destination: {} }));
  return { context, sources, transport: new SharedWavTransport(context, tracks) };
}

test('32 pistas arrancam no mesmo instante e posição após pausa e procura', () => {
  const { context, sources, transport } = fixture();
  transport.play();
  assert.equal(sources.length, 32);
  assert.ok(sources.every(source => source.args[0] === 10.1 && source.args[1] === 0));
  context.currentTime = 12.1;
  transport.pause();
  assert.ok(Math.abs(transport.position - 2) < 1e-9);
  assert.ok(sources.every(source => source.stopped && source.disconnected));
  transport.seek(5);
  transport.play();
  assert.ok(sources.slice(32).every(source => source.args[0] === 12.2 && source.args[1] === 5));
  context.currentTime = 14.2;
  transport.seek(1);
  assert.ok(sources.slice(64).every(source => Math.abs(source.args[0] - 14.3) < 1e-9 && source.args[1] === 1));
});

test('velocidade e final mantêm o relógio de transporte coerente', () => {
  const { context, sources, transport } = fixture(2);
  transport.play();
  context.currentTime = 11.1;
  transport.setRate(2);
  assert.ok(Math.abs(transport.position - 1) < 1e-9);
  assert.ok(sources.slice(2).every(source => source.playbackRate.value === 2));
  sources[0].onended(); // Um callback antigo não pode parar o novo arranque.
  assert.equal(transport.playing, true);
  sources[2].onended();
  assert.equal(transport.playing, false);
  assert.equal(transport.position, 30);
});

test('erro ao agendar interrompe todas as fontes já criadas', () => {
  const { context, sources, transport } = fixture(3);
  const create = context.createBufferSource;
  context.createBufferSource = () => { const source = create(); if (sources.length === 2) source.start = () => { throw Error('falha'); }; return source; };
  assert.throws(() => transport.play(), /falha/);
  assert.equal(transport.playing, false);
  assert.ok(sources.every(source => source.stopped && source.disconnected));
});

test('limites e velocidades inválidos são rejeitados', () => {
  const { context, transport } = fixture();
  assert.throws(() => new SharedWavTransport(context, []), RangeError);
  assert.throws(() => transport.setRate(0), RangeError);
  assert.throws(() => transport.seek(NaN), TypeError);
});
