import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
import * as score from '../../src/game/music-score.ts';
import * as synth from '../../src/game/music-synth.ts';
import * as places from '../../src/game/story-place-themes.ts';
import type { GameAudio } from '../../src/game/audio.ts';

// Record the real renderer and synthesizer's Web Audio calls without creating PCM
// masters. This deliberately does not implement a browser DSP engine. Unknown API
// use fails instead of silently passing through an unobserved mock method.
class TraceContext {
  currentTime = 0;
  readonly sampleRate = 44100;
  readonly state = 'suspended';
  readonly hash = createHash('sha256');
  private nextId = 0;
  readonly buffers: Float32Array[][] = [];
  readonly destination = this.node('destination');
  private last: unknown[] = [];
  operations = 0;

  record(...event: unknown[]): void {
    this.hash.update(JSON.stringify(event)); this.hash.update('\n');
    this.last = event; this.operations++;
  }
  parameter(id: string, initial: number) {
    let value = initial;
    const methods = new Set(['cancelAndHoldAtTime', 'cancelScheduledValues', 'setValueAtTime',
      'setTargetAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime']);
    return new Proxy({ id }, {
      get: (_target, key) => {
        if (key === 'id') return id;
        if (key === 'value') return value;
        if (typeof key !== 'string' || !methods.has(key)) throw new Error(`Untraced AudioParam API ${String(key)}`);
        return (...args: number[]) => {
          // glide adds this redundant write while retiring the initial, unvoiced
          // layer. Normalize only a same-value write at time zero immediately
          // after holding that very parameter at zero; later writes remain exact.
          if (!(key === 'setValueAtTime' && this.currentTime === 0 && args[0] === value && args[1] === 0
            && this.last[0] === id && this.last[1] === 'cancelAndHoldAtTime' && this.last[2] === 0)) {
            this.record(id, key, ...args);
          }
          if (key === 'setValueAtTime' && args[1]! <= this.currentTime) value = args[0]!;
        };
      },
      set: (_target, key, next: number) => {
        assert.equal(key, 'value'); value = next; this.record(id, 'value', next); return true;
      },
    });
  }
  node(kind: string): unknown {
    const id = `${kind}:${this.nextId++}`;
    this.record('create', id);
    const fields: Record<string, unknown> = { id, context: this };
    for (const [key, initial] of Object.entries({ gain: 1, frequency: 440, detune: 0, Q: 1, pan: 0,
      delayTime: 0, threshold: -24, knee: 30, ratio: 12, attack: .003, release: .25 })) {
      fields[key] = this.parameter(`${id}.${key}`, initial);
    }
    const compact = (value: unknown): unknown => {
      if (ArrayBuffer.isView(value)) return createHash('sha256').update(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)).digest('hex');
      if (value && typeof value === 'object' && 'id' in value) return value.id;
      return value;
    };
    const api = new Set(['connect', 'disconnect', 'start', 'stop', 'setPeriodicWave']);
    const properties = new Set(['type', 'curve', 'oversample', 'buffer', 'loop', 'onended']);
    const proxy = new Proxy(fields, {
      get: (target, key) => {
        if (typeof key === 'string' && key in target) return target[key];
        if (typeof key !== 'string' || !api.has(key)) throw new Error(`Untraced AudioNode API ${String(key)}`);
        return (...args: unknown[]) => { this.record(id, key, ...args.map(compact)); return key === 'connect' ? args[0] : undefined; };
      },
      set: (target, key, value) => {
        assert.ok(typeof key === 'string' && properties.has(key), `Untraced AudioNode property ${String(key)}`);
        target[key] = value;
        // Ended callbacks only release nodes; real-time delivery is outside this
        // scheduling trace. Their assignment and all explicit cleanup are counted.
        this.record(id, key, key === 'onended' ? 'callback' : compact(value)); return true;
      },
    });
    return proxy;
  }
  createGain() { return this.node('gain'); }
  createBiquadFilter() { return this.node('filter'); }
  createDynamicsCompressor() { return this.node('compressor'); }
  createWaveShaper() { return this.node('shaper'); }
  createOscillator() { return this.node('oscillator'); }
  createStereoPanner() { return this.node('panner'); }
  createBufferSource() { return this.node('source'); }
  createConvolver() { return this.node('convolver'); }
  createDelay(seconds: number) { this.record('delay-limit', seconds); return this.node('delay'); }
  createChannelMerger(channels: number) { this.record('merger-channels', channels); return this.node('merger'); }
  createPeriodicWave(real: Float32Array, imaginary: Float32Array) {
    const id = `wave:${this.nextId++}`;
    this.record(id, [...real], [...imaginary]); return { id };
  }
  createBuffer(channels: number, length: number, sampleRate: number) {
    const id = `buffer:${this.nextId++}`, data = Array.from({ length: channels }, () => new Float32Array(length));
    this.record(id, channels, length, sampleRate); this.buffers.push(data);
    return { id, length, duration: length / sampleRate, sampleRate, numberOfChannels: channels, getChannelData: (channel: number) => data[channel]! };
  }
  finish() {
    for (const channels of this.buffers) for (const data of channels) this.hash.update(new Uint8Array(data.buffer));
    return { operations: this.operations, sha256: this.hash.digest('hex') };
  }
}

export function compileAudioSource(source: string): typeof GameAudio {
  const dependencies: Record<string, unknown> = { './music-score': score, './music-synth': synth, './story-place-themes': places };
  const javascript = stripTypeScriptTypes(source).replace(/^import \{([^}]+)\} from '([^']+)';$/gm,
    (_match, bindings: string, module: string) => {
      assert.ok(Object.hasOwn(dependencies, module), `Unqualified renderer dependency ${module}`);
      return `const {${bindings}} = dependencies[${JSON.stringify(module)}];`;
    }).replace('export class GameAudio', 'class GameAudio');
  // The source is checked against a closed reviewed hash inventory by the caller.
  return new Function('dependencies', 'AudioContext', 'OfflineAudioContext', `${javascript}\nreturn GameAudio;`)(dependencies, class {}, TraceContext) as typeof GameAudio;
}

export function traceSoundtrack(Audio: typeof GameAudio, index: number) {
  const ctx = new TraceContext(), audio = new Audio(ctx as unknown as OfflineAudioContext);
  const composition = score.makeScore(index), notes: { note: score.ScoreNote; time: number }[] = [];
  audio.onNote = (note, time) => { notes.push({ note, time }); ctx.record('note', note, time); };
  audio.musicEnabled = true; audio.setVolumes(.75, 0); audio.setTrack(index);
  const lastOnset = .08 + composition.beats * 60 / composition.bpm - 1 / ctx.sampleRate;
  for (let at = 0; at < lastOnset; at += 8) {
    ctx.currentTime = at; audio.scheduleOfflineMusic(Math.min(8, lastOnset - at));
  }
  audio.dispose();
  assert.equal(notes.length, composition.notes.length, 'the entire score is scheduled exactly once');
  assert.deepEqual(notes.map(entry => entry.note), composition.notes);
  return { ...ctx.finish(), notes };
}
