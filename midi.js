const decodeText = new TextDecoder("windows-1252");

function readUint32(bytes, offset) {
  return (bytes[offset] * 0x1000000) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3];
}

function readVariableLength(bytes, cursor, end) {
  let value = 0;
  for (let count = 0; count < 4 && cursor.offset < end; count += 1) {
    const byte = bytes[cursor.offset++];
    value = (value << 7) | (byte & 0x7f);
    if (!(byte & 0x80)) return value;
  }
  throw new Error("O ficheiro MIDI contém um valor variável inválido.");
}

function tickClock(tempoEvents, ticksPerQuarter) {
  const ordered = [...tempoEvents, { tick: 0, tempo: 500000 }].sort((a, b) => a.tick - b.tick);
  const points = [];
  let tick = 0;
  let seconds = 0;
  let tempo = 500000;
  for (const event of ordered) {
    seconds += ((event.tick - tick) * tempo) / (ticksPerQuarter * 1000000);
    tick = event.tick;
    tempo = event.tempo;
    const prior = points.at(-1);
    if (prior?.tick === tick) points[points.length - 1] = { tick, seconds, tempo };
    else points.push({ tick, seconds, tempo });
  }
  const secondsAtTick = (targetTick) => {
    let low = 0;
    let high = points.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (points[middle].tick <= targetTick) low = middle;
      else high = middle - 1;
    }
    const point = points[low];
    return point.seconds + ((targetTick - point.tick) * point.tempo) / (ticksPerQuarter * 1000000);
  };
  const tickAtSeconds = (targetSeconds) => {
    let low = 0;
    let high = points.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (points[middle].seconds <= targetSeconds) low = middle;
      else high = middle - 1;
    }
    const point = points[low];
    return point.tick + Math.max(0, (targetSeconds - point.seconds) * ticksPerQuarter * 1000000 / point.tempo);
  };
  return { secondsAtTick, tickAtSeconds };
}

export function parseMidiFile(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes.length > 64 * 1024 * 1024) throw new Error("O MIDI excede o limite de 64 MB deste leitor.");
  if (bytes.length < 14 || String.fromCharCode(...bytes.slice(0, 4)) !== "MThd") {
    throw new Error("Este ficheiro não tem um cabeçalho MIDI Standard válido.");
  }
  const headerLength = readUint32(bytes, 4);
  const format = (bytes[8] << 8) | bytes[9];
  const trackCount = (bytes[10] << 8) | bytes[11];
  const division = (bytes[12] << 8) | bytes[13];
  if (headerLength < 6 || 8 + headerLength > bytes.length) throw new Error("O cabeçalho MIDI está incompleto.");
  if (trackCount > 512) throw new Error("O MIDI contém mais de 512 faixas, acima do limite deste leitor.");
  if (format > 1) throw new Error("Ficheiros MIDI tipo 2 ainda não são suportados.");
  if (division & 0x8000) throw new Error("Este ficheiro usa relógio SMPTE, que ainda não é suportado.");
  const ticksPerQuarter = division;
  if (!ticksPerQuarter) throw new Error("O ficheiro MIDI tem uma resolução temporal inválida.");

  const channelEvents = [];
  const controllerEvents = [];
  const programEvents = [];
  const tempoEvents = [];
  const timeSignatureEvents = [];
  const lyricEvents = [];
  let offset = 8 + headerLength;
  let eventCount = 0;
  for (let trackIndex = 0; trackIndex < trackCount; trackIndex += 1) {
    if (String.fromCharCode(...bytes.slice(offset, offset + 4)) !== "MTrk") throw new Error("Não foi possível ler uma faixa MIDI.");
    const length = readUint32(bytes, offset + 4);
    const end = offset + 8 + length;
    if (!Number.isSafeInteger(end) || end > bytes.length) throw new Error("Uma faixa MIDI termina depois do fim do ficheiro.");
    const cursor = { offset: offset + 8 };
    let tick = 0;
    let runningStatus = 0;
    while (cursor.offset < end) {
      eventCount += 1;
      if (eventCount > 2000000) throw new Error("O MIDI excede o limite de eventos deste leitor.");
      tick += readVariableLength(bytes, cursor, end);
      let status = bytes[cursor.offset];
      if (status & 0x80) {
        cursor.offset += 1;
        if (status < 0xf0) runningStatus = status;
      } else {
        status = runningStatus;
        if (!status) throw new Error("A faixa MIDI começa um evento sem estado anterior.");
      }

      if (status === 0xff) {
        const metaType = bytes[cursor.offset++];
        const size = readVariableLength(bytes, cursor, end);
        const payload = bytes.subarray(cursor.offset, cursor.offset + size);
        cursor.offset += size;
        if (metaType === 0x51 && payload.length === 3) {
          tempoEvents.push({ tick, tempo: (payload[0] << 16) | (payload[1] << 8) | payload[2] });
        } else if (metaType === 0x58 && payload.length >= 2 && payload[0] > 0 && payload[1] <= 5) {
          timeSignatureEvents.push({ tick, numerator: payload[0], denominator: 2 ** payload[1] });
        } else if ((metaType === 0x05 || metaType === 0x01) && payload.length) {
          lyricEvents.push({ tick, text: decodeText.decode(payload).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim() });
        }
        if (metaType === 0x2f) break;
        continue;
      }

      if (status === 0xf0 || status === 0xf7) {
        cursor.offset += readVariableLength(bytes, cursor, end);
        continue;
      }

      const command = status & 0xf0;
      const channel = status & 0x0f;
      const dataLength = command === 0xc0 || command === 0xd0 ? 1 : 2;
      const first = bytes[cursor.offset++];
      const second = dataLength === 2 ? bytes[cursor.offset++] : 0;
      channelEvents.push({ tick, command, channel, first, second });
      if (command === 0xc0) programEvents.push({ tick, channel, program: first });
      if (command === 0xb0) {
        controllerEvents.push({ tick, channel, controller: first, value: second });
      }
    }
    offset = end;
  }

  channelEvents.sort((a, b) => a.tick - b.tick);
  const programs = new Array(16).fill(0);
  const openNotes = new Map();
  const notes = [];
  const key = (channel, note) => `${channel}:${note}`;
  for (const event of channelEvents) {
    if (event.command === 0xc0) {
      programs[event.channel] = event.first;
      continue;
    }
    if (event.command !== 0x80 && event.command !== 0x90) continue;
    const noteKey = key(event.channel, event.first);
    const isOn = event.command === 0x90 && event.second > 0;
    if (isOn) {
      const queue = openNotes.get(noteKey) ?? [];
      queue.push({ tick: event.tick, note: event.first, velocity: event.second, channel: event.channel, program: programs[event.channel] });
      openNotes.set(noteKey, queue);
    } else {
      const queue = openNotes.get(noteKey);
      const started = queue?.shift();
      if (started) notes.push({ ...started, endTick: Math.max(event.tick, started.tick + 1) });
    }
  }
  const lastEventTick = [...channelEvents, ...tempoEvents, ...lyricEvents, ...controllerEvents].reduce((last, event) => Math.max(last, event.tick), 0);
  for (const queue of openNotes.values()) {
    for (const started of queue) notes.push({ ...started, endTick: Math.max(lastEventTick, started.tick + 1) });
  }

  const clock = tickClock(tempoEvents, ticksPerQuarter);
  const { secondsAtTick } = clock;
  const controllers = controllerEvents
    .sort((a, b) => a.tick - b.tick)
    .map((event) => ({ ...event, time: secondsAtTick(event.tick) }));
  const programChanges = programEvents
    .sort((a, b) => a.tick - b.tick)
    .map((event) => ({ ...event, time: secondsAtTick(event.tick) }));
  const timedNotes = notes.map((note) => ({
    ...note,
    time: secondsAtTick(note.tick),
    endTime: secondsAtTick(note.endTick),
  })).sort((a, b) => a.time - b.time);
  const channelStats = Array.from({ length: 16 }, (_, channel) => ({ channel, noteCount: 0, programs: new Set() }));
  for (const note of timedNotes) {
    channelStats[note.channel].noteCount++;
    channelStats[note.channel].programs.add(note.program);
  }
  const channels = channelStats.map((channel) => ({ ...channel, programs: [...channel.programs].sort((a, b) => a - b) }));
  const lyrics = lyricEvents.map((event) => ({ time: secondsAtTick(event.tick), text: event.text })).filter((line) => line.text);
  const duration = timedNotes.reduce((last, note) => Math.max(last, note.endTime), secondsAtTick(lastEventTick));
  const signatures = [{ tick: 0, numerator: 4, denominator: 4 }, ...timeSignatureEvents].sort((a, b) => a.tick - b.tick);
  const barBeatToSeconds = (targetBar, targetBeat) => {
    let currentTick = 0;
    let currentBar = 1;
    let signatureIndex = 0;
    while (signatureIndex + 1 < signatures.length && signatures[signatureIndex + 1].tick <= currentTick) signatureIndex += 1;
    while (signatureIndex + 1 < signatures.length) {
      const signature = signatures[signatureIndex];
      const next = signatures[signatureIndex + 1];
      const ticksPerBar = ticksPerQuarter * 4 * signature.numerator / signature.denominator;
      const barsToNext = Math.max(0, Math.round((next.tick - currentTick) / ticksPerBar));
      if (targetBar < currentBar + barsToNext) {
        const beatTicks = ticksPerQuarter * 4 / signature.denominator;
        return secondsAtTick(currentTick + (targetBar - currentBar) * ticksPerBar + (targetBeat - 1) * beatTicks);
      }
      currentBar += barsToNext;
      currentTick = next.tick;
      signatureIndex += 1;
    }
    const signature = signatures[signatureIndex];
    const ticksPerBar = ticksPerQuarter * 4 * signature.numerator / signature.denominator;
    const beatTicks = ticksPerQuarter * 4 / signature.denominator;
    return secondsAtTick(currentTick + (targetBar - currentBar) * ticksPerBar + (targetBeat - 1) * beatTicks);
  };
  const positionToBarBeat = (seconds) => {
    const targetTick = clock.tickAtSeconds(Math.max(0, seconds));
    let currentTick = 0;
    let currentBar = 1;
    let signatureIndex = 0;
    while (signatureIndex + 1 < signatures.length && signatures[signatureIndex + 1].tick <= targetTick) {
      const signature = signatures[signatureIndex];
      const ticksPerBar = ticksPerQuarter * 4 * signature.numerator / signature.denominator;
      currentBar += Math.max(0, Math.round((signatures[signatureIndex + 1].tick - currentTick) / ticksPerBar));
      currentTick = signatures[signatureIndex + 1].tick;
      signatureIndex += 1;
    }
    const signature = signatures[signatureIndex];
    const beatTicks = ticksPerQuarter * 4 / signature.denominator;
    const ticksPerBar = beatTicks * signature.numerator;
    const localTick = Math.max(0, targetTick - currentTick);
    return {
      bar: currentBar + Math.floor(localTick / ticksPerBar),
      beat: Math.floor((localTick % ticksPerBar) / beatTicks) + 1,
    };
  };
  return { format, ticksPerQuarter, notes: timedNotes, channels, controllers, programChanges, lyrics, duration, barBeatToSeconds, positionToBarBeat, tickAtSeconds: clock.tickAtSeconds };
}

function encodeVariableLength(value) {
  let remaining = Math.max(0, Math.floor(value));
  const bytes = [remaining & 0x7f];
  while ((remaining >>= 7) > 0) bytes.unshift((remaining & 0x7f) | 0x80);
  return bytes;
}

function encodeUint32(value) {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

const cp1252Special = new Map([
  [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84], [0x2026, 0x85], [0x2020, 0x86],
  [0x2021, 0x87], [0x02c6, 0x88], [0x2030, 0x89], [0x0160, 0x8a], [0x2039, 0x8b], [0x0152, 0x8c],
  [0x017d, 0x8e], [0x2018, 0x91], [0x2019, 0x92], [0x201c, 0x93], [0x201d, 0x94], [0x2022, 0x95],
  [0x2013, 0x96], [0x2014, 0x97], [0x02dc, 0x98], [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b],
  [0x0153, 0x9c], [0x017e, 0x9e], [0x0178, 0x9f],
]);

function encodeKaraokeText(value) {
  return [...String(value ?? "")].map((character) => {
    const code = character.codePointAt(0);
    return code <= 0xff ? code : cp1252Special.get(code) ?? 0x3f;
  });
}

function makeMetaEvent(type, text) {
  const payload = encodeKaraokeText(text);
  return [0xff, type, ...encodeVariableLength(payload.length), ...payload];
}

function makeMidiTrack(events) {
  const ordered = [...events].sort((a, b) => a.tick - b.tick || a.order - b.order);
  const data = [];
  let lastTick = 0;
  for (const event of ordered) {
    const tick = Math.max(lastTick, Math.floor(event.tick));
    const delta = tick - lastTick;
    if (delta > 0x0fffffff) throw new Error("O intervalo entre letras excede o limite do MIDI.");
    data.push(...encodeVariableLength(delta), ...event.bytes);
    lastTick = tick;
  }
  data.push(0x00, 0xff, 0x2f, 0x00);
  if (data.length > 0xffffffff) throw new Error("A faixa KAR excede o tamanho permitido.");
  return [0x4d, 0x54, 0x72, 0x6b, ...encodeUint32(data.length), ...data];
}

function readMidiTrackChunks(bytes, headerLength, trackCount) {
  const chunks = [];
  let offset = 8 + headerLength;
  for (let track = 0; track < trackCount; track += 1) {
    if (String.fromCharCode(...bytes.slice(offset, offset + 4)) !== "MTrk") throw new Error("Não foi possível ler uma faixa do MIDI original.");
    const length = (bytes[offset + 4] * 0x1000000) + (bytes[offset + 5] << 16) + (bytes[offset + 6] << 8) + bytes[offset + 7];
    const end = offset + 8 + length;
    if (!Number.isSafeInteger(end) || end > bytes.length) throw new Error("Uma faixa do MIDI original está incompleta.");
    chunks.push([...bytes.slice(offset, end)]);
    offset = end;
  }
  return chunks;
}

function removeExistingLyricEvents(trackChunk, removeTempo = false) {
  const cursor = { offset: 8 }, end = trackChunk.length, output = [];
  let runningStatus = 0, pendingDelta = 0, changed = false, ended = false;
  while (cursor.offset < end) {
    pendingDelta += readVariableLength(trackChunk, cursor, end);
    const start = cursor.offset;
    let status = trackChunk[cursor.offset];
    if (status & 0x80) {
      cursor.offset += 1;
      if (status < 0xf0) runningStatus = status;
    } else {
      status = runningStatus;
      if (!status) throw new Error("O MIDI contém um evento sem estado anterior.");
    }
    if (status === 0xff) {
      const type = trackChunk[cursor.offset++];
      const length = readVariableLength(trackChunk, cursor, end);
      const payloadStart = cursor.offset;
      cursor.offset += length;
      if (cursor.offset > end) throw new Error("Um evento MIDI termina fora da faixa.");
      if (type === 0x01 || type === 0x05 || (removeTempo && type === 0x51)) { changed = true; continue; }
      output.push(...encodeVariableLength(pendingDelta), 0xff, type, ...encodeVariableLength(length), ...trackChunk.slice(payloadStart, cursor.offset));
      pendingDelta = 0;
      if (type === 0x2f) { ended = true; break; }
      continue;
    }
    if (status === 0xf0 || status === 0xf7) {
      const lengthStart = cursor.offset;
      const length = readVariableLength(trackChunk, cursor, end);
      cursor.offset += length;
      if (cursor.offset > end) throw new Error("Uma mensagem de sistema MIDI termina fora da faixa.");
      output.push(...encodeVariableLength(pendingDelta), status, ...trackChunk.slice(lengthStart, cursor.offset));
    } else {
      const command = status & 0xf0;
      const dataLength = command === 0xc0 || command === 0xd0 ? 1 : 2;
      cursor.offset += dataLength;
      if (cursor.offset > end) throw new Error("Um evento MIDI termina fora da faixa.");
      output.push(...encodeVariableLength(pendingDelta), status, ...trackChunk.slice(start + ((trackChunk[start] & 0x80) ? 1 : 0), cursor.offset));
    }
    pendingDelta = 0;
  }
  if (!changed) return trackChunk;
  if (!ended) output.push(...encodeVariableLength(pendingDelta), 0xff, 0x2f, 0x00);
  return [0x4d, 0x54, 0x72, 0x6b, ...encodeUint32(output.length), ...output];
}

export function createKaraokeMidi({ sourceBuffer = null, lyricEvents = [], title = "", artist = "", sourceData = null, bpm = null } = {}) {
  const sourceBytes = sourceBuffer ? new Uint8Array(sourceBuffer) : null;
  let format = 1, ticksPerQuarter = sourceData?.ticksPerQuarter ?? 480, originalTracks = [];
  if (sourceBytes) {
    if (sourceBytes.length < 14 || String.fromCharCode(...sourceBytes.slice(0, 4)) !== "MThd") throw new Error("A faixa associada não é um MIDI Standard válido.");
    const headerLength = (sourceBytes[4] * 0x1000000) + (sourceBytes[5] << 16) + (sourceBytes[6] << 8) + sourceBytes[7];
    format = (sourceBytes[8] << 8) | sourceBytes[9];
    const trackCount = (sourceBytes[10] << 8) | sourceBytes[11];
    const division = (sourceBytes[12] << 8) | sourceBytes[13];
    if (format > 1 || division & 0x8000 || !division) throw new Error("Este tipo de MIDI não pode ser exportado como KAR.");
    if (trackCount > 510) throw new Error("O MIDI original tem demasiadas faixas para acrescentar as letras.");
    ticksPerQuarter = division;
    originalTracks = readMidiTrackChunks(sourceBytes, headerLength, trackCount).map((chunk) => removeExistingLyricEvents(chunk, Number.isFinite(bpm)));
    format = 1;
  }

  const secondsToTick = Number.isFinite(bpm) ? (seconds) => Math.max(0, seconds) * ticksPerQuarter * bpm / 60 : (sourceData?.tickAtSeconds ?? ((seconds) => Math.max(0, seconds) * ticksPerQuarter * 2));
  const infoTrack = makeMidiTrack([
    { tick: 0, order: 0, bytes: makeMetaEvent(0x03, "Karaoke Info") },
    { tick: 0, order: 1, bytes: makeMetaEvent(0x01, "@KMIDI KARAOKE FILE") },
    { tick: 0, order: 2, bytes: makeMetaEvent(0x01, "@V0100") },
    { tick: 0, order: 3, bytes: makeMetaEvent(0x01, "@ISTAGESET") },
  ]);
  const lyricTrackEvents = [
    { tick: 0, order: 0, bytes: makeMetaEvent(0x03, "Karaoke Lyrics") },
    { tick: 0, order: 1, bytes: makeMetaEvent(0x01, "@T" + String(title).slice(0, 120)) },
  ];
  if (artist) lyricTrackEvents.push({ tick: 0, order: 2, bytes: makeMetaEvent(0x01, "@T" + String(artist).slice(0, 120)) });
  let priorSourceIndex = null;
  lyricEvents.forEach((line, index) => {
    const prefix = priorSourceIndex === null || line.sourceIndex !== priorSourceIndex ? "/" : "";
    const text = String(line.text ?? "").replace(/\[color=#[\da-f]{6}\]/gi, "").replace(/\[\/color\]/gi, "").replace(/[\r\n]+/g, " ").trim();
    if (text) lyricTrackEvents.push({ tick: Math.max(0, Math.round(secondsToTick(line.time))), order: index + 3, bytes: makeMetaEvent(0x01, prefix + text) });
    priorSourceIndex = line.sourceIndex;
  });
  const lyricTrack = makeMidiTrack(lyricTrackEvents);
  let middleTracks = originalTracks;
  if (!sourceBytes || Number.isFinite(bpm)) {
    const microsPerBeat = Number.isFinite(bpm) ? Math.round(60000000 / bpm) : 500000;
    const tempoTrack = makeMidiTrack([
      { tick: 0, order: 0, bytes: [0xff, 0x51, 0x03, (microsPerBeat >> 16) & 0xff, (microsPerBeat >> 8) & 0xff, microsPerBeat & 0xff] },
      { tick: 0, order: 1, bytes: [0xff, 0x58, 0x04, 0x04, 0x02, 0x18, 0x08] },
    ]);
    middleTracks = sourceBytes ? [tempoTrack, ...originalTracks] : [tempoTrack];
  }
  const tracks = [infoTrack, lyricTrack, ...middleTracks];
  const header = sourceBytes ? [...sourceBytes.slice(0, 8 + ((sourceBytes[4] * 0x1000000) + (sourceBytes[5] << 16) + (sourceBytes[6] << 8) + sourceBytes[7]))] : [0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06, 0x00, 0x01, 0x00, 0x00, (ticksPerQuarter >> 8) & 0xff, ticksPerQuarter & 0xff];
  header[8] = (format >> 8) & 0xff; header[9] = format & 0xff;
  header[10] = (tracks.length >> 8) & 0xff; header[11] = tracks.length & 0xff;
  const totalLength = header.length + tracks.reduce((sum, track) => sum + track.length, 0);
  const output = new Uint8Array(totalLength);
  output.set(header, 0);
  let offset = header.length;
  for (const track of tracks) { output.set(track, offset); offset += track.length; }
  return output;
}

export function createMidiFromNotes(notes = [], bpm = 120) {
  if (!Number.isFinite(bpm) || bpm < 20 || bpm > 300) throw new Error("O BPM deve estar entre 20 e 300.");
  const ticksPerQuarter = 480, tickAt = (seconds) => Math.max(0, Math.round(seconds * bpm / 60 * ticksPerQuarter));
  const events = [{ tick: 0, order: 0, bytes: makeMetaEvent(0x03, "StageSet Piano Roll") }];
  for (const note of notes) {
    const channel = Math.max(0, Math.min(15, Number(note.channel) || 0));
    const pitch = Math.max(0, Math.min(127, Number(note.note) || 0));
    const velocity = Math.max(1, Math.min(127, Number(note.velocity) || 90));
    const start = tickAt(Number(note.time) || 0), end = Math.max(start + 1, tickAt(Number(note.endTime) || (Number(note.time) + 0.25)));
    events.push({ tick: start, order: 2, bytes: [0x90 | channel, pitch, velocity] }, { tick: end, order: 1, bytes: [0x80 | channel, pitch, 0] });
  }
  const microsPerBeat = Math.round(60000000 / bpm);
  const tempo = makeMidiTrack([{ tick: 0, order: 0, bytes: [0xff, 0x51, 0x03, (microsPerBeat >> 16) & 0xff, (microsPerBeat >> 8) & 0xff, microsPerBeat & 0xff] }, { tick: 0, order: 1, bytes: [0xff, 0x58, 0x04, 0x04, 0x02, 0x18, 0x08] }]);
  const performance = makeMidiTrack(events);
  const header = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, 2, (ticksPerQuarter >> 8) & 0xff, ticksPerQuarter & 0xff];
  const output = new Uint8Array(header.length + tempo.length + performance.length);
  output.set(header); output.set(tempo, header.length); output.set(performance, header.length + tempo.length);
  return output;
}

const instrumentFamilies = [
  { wave: "triangle", partial: "sine", ratio: 2, blend: 0.16, attack: 0.004, decay: 0.22, sustain: 0.34, release: 0.15, cutoff: 5200 },
  { wave: "sine", partial: "sine", ratio: 2.76, blend: 0.24, attack: 0.003, decay: 0.12, sustain: 0.22, release: 0.22, cutoff: 9000 },
  { wave: "square", partial: "sine", ratio: 2, blend: 0.2, attack: 0.012, decay: 0.05, sustain: 0.86, release: 0.06, cutoff: 5200 },
  { wave: "triangle", partial: "square", ratio: 2, blend: 0.12, attack: 0.003, decay: 0.11, sustain: 0.18, release: 0.1, cutoff: 6200 },
  { wave: "triangle", partial: "sine", ratio: 0.5, blend: 0.18, attack: 0.006, decay: 0.08, sustain: 0.62, release: 0.05, cutoff: 3400 },
  { wave: "sawtooth", partial: "triangle", ratio: 1.005, blend: 0.32, attack: 0.16, decay: 0.2, sustain: 0.82, release: 0.2, cutoff: 4200 },
  { wave: "sawtooth", partial: "sawtooth", ratio: 0.997, blend: 0.34, attack: 0.11, decay: 0.15, sustain: 0.82, release: 0.18, cutoff: 3900 },
  { wave: "sawtooth", partial: "square", ratio: 2, blend: 0.18, attack: 0.045, decay: 0.12, sustain: 0.72, release: 0.09, cutoff: 2600 },
  { wave: "square", partial: "triangle", ratio: 2, blend: 0.16, attack: 0.025, decay: 0.1, sustain: 0.72, release: 0.08, cutoff: 3000 },
  { wave: "sine", partial: "triangle", ratio: 2, blend: 0.12, attack: 0.035, decay: 0.08, sustain: 0.85, release: 0.08, cutoff: 7200 },
  { wave: "sawtooth", partial: "square", ratio: 1.01, blend: 0.26, attack: 0.008, decay: 0.1, sustain: 0.72, release: 0.1, cutoff: 5200 },
  { wave: "sawtooth", partial: "triangle", ratio: 0.5, blend: 0.22, attack: 0.24, decay: 0.2, sustain: 0.88, release: 0.25, cutoff: 3600 },
  { wave: "sine", partial: "sawtooth", ratio: 1.5, blend: 0.2, attack: 0.05, decay: 0.22, sustain: 0.58, release: 0.18, cutoff: 4600 },
  { wave: "square", partial: "triangle", ratio: 1.5, blend: 0.2, attack: 0.012, decay: 0.13, sustain: 0.56, release: 0.12, cutoff: 3400 },
  { wave: "sine", partial: "triangle", ratio: 2, blend: 0.24, attack: 0.003, decay: 0.18, sustain: 0.3, release: 0.14, cutoff: 7600 },
  { wave: "sawtooth", partial: "sine", ratio: 1.5, blend: 0.2, attack: 0.035, decay: 0.18, sustain: 0.64, release: 0.2, cutoff: 4400 },
];

function instrumentProfile(program) {
  const preset = instrumentFamilies[Math.max(0, Math.min(127, program)) >> 3];
  const variation = (program & 7) - 3.5;
  return {
    ...preset,
    detune: variation * (preset.ratio === 1 ? 2.5 : 0.45),
    cutoff: Math.max(900, Math.min(10000, preset.cutoff + variation * 180)),
    blend: Math.max(0.08, Math.min(0.4, preset.blend + variation * 0.012)),
  };
}

export class MidiPlayer {
  constructor() {
    this.data = null;
    this.context = null;
    this.master = null;
    this.noiseBuffer = null;
    this.channelGains = [];
    this.channelPanners = [];
    this.controllerGains = [];
    this.controllerPanners = [];
    this.channelMix = Array.from({ length: 16 }, () => ({ volume: 1, muted: false, pan: 0 }));
    this.controllerValues = Array.from({ length: 16 }, () => ({ volume: 1, expression: 1, pan: 0 }));
    this.nodes = new Set();
    this.voiceMetadata = new Map();
    this.cursor = 0;
    this.controllerCursor = 0;
    this.programCursor = 0;
    this.position = 0;
    this.startedAt = 0;
    this.positionAtStart = 0;
    this.rate = 1;
    this.transpose = 0;
    this.volume = 0.8;
    this.playing = false;
    this.timer = null;
    this.onTime = () => {};
    this.onEnded = () => {};
    this.midiOutput = null;
    this.channelOutputs = Array(16).fill(undefined);
  }

  async load(buffer) {
    this.pause();
    this.data = parseMidiFile(buffer);
    this.position = 0;
    this.cursor = 0;
    return this.data;
  }

  get duration() { return this.data?.duration ?? 0; }
  get currentTime() {
    if (!this.playing || !this.context) return this.position;
    return Math.min(this.duration, this.positionAtStart + (this.context.currentTime - this.startedAt) * this.rate);
  }

  async ensureContext() {
    if (!this.context) {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) throw new Error("Este navegador não disponibiliza Web Audio para reprodução MIDI.");
      this.context = new Context();
      this.master = this.context.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.context.destination);
      this.noiseBuffer = this.context.createBuffer(1, this.context.sampleRate * 2, this.context.sampleRate);
      const noise = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < noise.length; i++) noise[i] = Math.random() * 2 - 1;
      this.channelGains = Array.from({ length: 16 }, () => this.context.createGain());
      this.channelPanners = Array.from({ length: 16 }, () => this.context.createStereoPanner?.() ?? null);
      this.controllerGains = Array.from({ length: 16 }, () => this.context.createGain());
      this.controllerPanners = Array.from({ length: 16 }, () => this.context.createStereoPanner?.() ?? null);
      this.channelGains.forEach((gain, channel) => {
        const panner = this.channelPanners[channel];
        if (panner) gain.connect(panner).connect(this.master);
        else gain.connect(this.master);
      });
      this.controllerGains.forEach((gain, channel) => {
        const panner = this.controllerPanners[channel];
        if (panner) gain.connect(panner).connect(this.channelGains[channel]);
        else gain.connect(this.channelGains[channel]);
      });
      for (let channel = 0; channel < 16; channel++) this.applyChannelMix(channel);
    }
    if (this.context.state === "suspended") await this.context.resume();
  }

  async play() {
    if (!this.data || this.playing) return;
    if (this.position >= this.duration) this.position = 0;
    await this.ensureContext();
    this.resetControllersAt(this.position);
    this.resetProgramsAt(this.position);
    this.playing = true;
    this.positionAtStart = this.position;
    this.startedAt = this.context.currentTime;
    this.cursor = this.data.notes.findIndex((note) => note.endTime > this.position);
    if (this.cursor < 0) this.cursor = this.data.notes.length;
    this.scheduleAhead();
    this.timer = setInterval(() => {
      this.scheduleAhead();
      this.onTime(this.currentTime, this.duration);
      if (this.currentTime >= this.duration) {
        this.pause();
        this.position = 0;
        this.onTime(0, this.duration);
        this.onEnded();
      }
    }, 40);
  }

  scheduleAhead() {
    const position = this.currentTime;
    const horizon = position + 2.25;
    this.scheduleControllers(position, horizon);
    this.schedulePrograms(position, horizon);
    while (this.cursor < this.data.notes.length && this.data.notes[this.cursor].time <= horizon) {
      const note = this.data.notes[this.cursor++];
      if (note.endTime <= position) continue;
      const startTime = this.context.currentTime + Math.max(0, note.time - position) / this.rate;
      const endTime = this.context.currentTime + Math.max(0.04, note.endTime - position) / this.rate;
      this.scheduleNote(note, startTime, endTime);
    }
  }

  scheduleNote(note, startTime, endTime) {
    if (this.hasMidiOutput(note.channel)) return this.scheduleMidiNote(note, startTime, endTime);
    if (note.channel === 9) return this.schedulePercussion(note, startTime, endTime);
    const oscillator = this.context.createOscillator();
    const partial = this.context.createOscillator();
    const partialGain = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    const envelope = this.context.createGain();
    const midiNote = Math.max(0, Math.min(127, note.note + this.transpose));
    const profile = instrumentProfile(this.channelMix[note.channel]?.program ?? note.program);
    const frequency = 440 * 2 ** ((midiNote - 69) / 12);
    oscillator.type = profile.wave;
    oscillator.frequency.setValueAtTime(frequency, startTime);
    partial.type = profile.partial;
    partial.frequency.setValueAtTime(frequency * profile.ratio, startTime);
    partial.detune.setValueAtTime(profile.detune, startTime);
    partialGain.gain.setValueAtTime(profile.blend, startTime);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(profile.cutoff, startTime);
    filter.Q.setValueAtTime(0.7 + profile.blend, startTime);
    const level = Math.max(0.001, Math.min(0.16, note.velocity / 900));
    const attackEnd = Math.min(endTime - 0.004, startTime + profile.attack);
    const releaseStart = Math.max(attackEnd, endTime - profile.release);
    const sustainLevel = Math.max(0.0001, level * profile.sustain);
    envelope.gain.setValueAtTime(0.0001, startTime);
    envelope.gain.linearRampToValueAtTime(level, attackEnd);
    if (profile.decay > 0 && releaseStart > attackEnd) {
      const decayEnd = Math.min(releaseStart, attackEnd + profile.decay);
      envelope.gain.exponentialRampToValueAtTime(sustainLevel, decayEnd);
    }
    envelope.gain.setValueAtTime(sustainLevel, releaseStart);
    envelope.gain.linearRampToValueAtTime(0.0001, endTime);
    oscillator.connect(filter);
    partial.connect(partialGain).connect(filter);
    filter.connect(envelope).connect(this.controllerGains[note.channel] ?? this.channelGains[note.channel] ?? this.master);
    oscillator.start(startTime);
    partial.start(startTime);
    oscillator.stop(endTime + 0.01);
    partial.stop(endTime + 0.01);
    this.trackVoice(oscillator, note.channel, note.time);
    this.trackVoice(partial, note.channel, note.time);
  }

  trackVoice(source, channel = null, songTime = null) {
    this.nodes.add(source);
    this.voiceMetadata.set(source, { channel, songTime });
    source.addEventListener("ended", () => {
      this.nodes.delete(source);
      this.voiceMetadata.delete(source);
    }, { once: true });
  }

  schedulePercussion(note, startTime, noteEndTime) {
    const output = this.controllerGains[note.channel] ?? this.channelGains[note.channel] ?? this.master;
    const velocity = note.velocity / 127;
    const rate = this.rate;
    const tone = (frequency, endFrequency, seconds, level, waveform = "sine") => {
      const oscillator = this.context.createOscillator();
      const envelope = this.context.createGain();
      const finish = startTime + seconds / rate;
      oscillator.type = waveform;
      oscillator.frequency.setValueAtTime(frequency, startTime);
      if (endFrequency && endFrequency !== frequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, finish);
      envelope.gain.setValueAtTime(0.0001, startTime);
      envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, level * velocity), startTime + 0.003 / rate);
      envelope.gain.exponentialRampToValueAtTime(0.0001, finish);
      oscillator.connect(envelope).connect(output);
      oscillator.start(startTime);
      oscillator.stop(finish + 0.015);
      this.trackVoice(oscillator, note.channel, note.time);
    };
    const noise = (seconds, level, filterType, cutoff, bursts = 1) => {
      const source = this.context.createBufferSource();
      const filter = this.context.createBiquadFilter();
      const envelope = this.context.createGain();
      const finish = startTime + seconds / rate;
      source.buffer = this.noiseBuffer;
      source.loop = true;
      filter.type = filterType;
      filter.frequency.setValueAtTime(cutoff, startTime);
      filter.Q.value = 0.8;
      if (bursts === 1) {
        envelope.gain.setValueAtTime(0.0001, startTime);
        envelope.gain.linearRampToValueAtTime(Math.max(0.0002, level * velocity), startTime + 0.004 / rate);
        envelope.gain.exponentialRampToValueAtTime(0.0001, finish);
      } else {
        envelope.gain.setValueAtTime(0.0001, startTime);
        for (let burst = 0; burst < bursts; burst++) {
          const at = startTime + (0.004 + burst * 0.032) / rate;
          if (at >= finish) break;
          envelope.gain.setValueAtTime(Math.max(0.0001, level * velocity * (1 - burst * 0.12)), at);
          envelope.gain.exponentialRampToValueAtTime(0.0001, Math.min(finish, at + 0.022 / rate));
        }
      }
      source.connect(filter).connect(envelope).connect(output);
      source.start(startTime);
      source.stop(finish + 0.02);
      this.trackVoice(source, note.channel, note.time);
    };
    const drum = note.note;
    const held = Math.max(0.04, (noteEndTime - startTime) * rate);
    if (drum === 35 || drum === 36) {
      tone(drum === 35 ? 120 : 145, 43, Math.max(0.12, held), 0.42);
      tone(1800, 800, 0.018, 0.07, "square");
    } else if (drum === 37 || drum === 75 || drum === 76 || drum === 77) {
      tone(drum === 37 ? 920 : drum === 75 ? 2450 : 820, 520, Math.max(0.035, Math.min(held, 0.12)), 0.2, "triangle");
      if (drum === 37) noise(0.035, 0.12, "highpass", 2600);
    } else if (drum === 38 || drum === 40) {
      noise(Math.max(0.12, held), 0.34, "bandpass", drum === 38 ? 1900 : 2400);
      tone(drum === 38 ? 190 : 155, 90, 0.14, 0.2);
    } else if (drum === 39) {
      noise(Math.max(0.12, held), 0.38, "bandpass", 1500, 4);
    } else if (drum === 42 || drum === 44 || drum === 46) {
      const open = drum === 46;
      noise(open ? 0.48 : 0.075, open ? 0.22 : 0.28, "highpass", open ? 4800 : 6200);
    } else if ([49, 51, 52, 53, 55, 57, 59].includes(drum)) {
      noise(Math.max(0.65, held), 0.25, "highpass", drum === 53 ? 6500 : 4200);
      tone(6400 + drum * 7, 5200 + drum * 5, 0.5, 0.035, "square");
      tone(8100 + drum * 3, 6100 + drum * 4, 0.7, 0.024, "triangle");
    } else if ([54, 69, 70, 73, 74].includes(drum)) {
      noise(Math.max(0.09, Math.min(held, 0.32)), 0.22, "highpass", drum === 54 ? 3100 : 4600, drum === 70 ? 2 : 1);
      if (drum === 54) tone(620, 480, 0.12, 0.08, "square");
    } else if (drum === 56 || drum === 67 || drum === 68) {
      const base = drum === 56 ? 560 : drum === 67 ? 1050 : 760;
      tone(base, base, Math.max(0.09, Math.min(held, 0.36)), 0.22, "square");
      tone(base * 1.48, base * 1.48, Math.max(0.09, Math.min(held, 0.36)), 0.16, "square");
    } else if (drum === 71 || drum === 72) {
      tone(drum === 71 ? 1900 : 1420, drum === 71 ? 1700 : 1300, drum === 71 ? 0.13 : 0.38, 0.15, "sine");
      noise(drum === 71 ? 0.08 : 0.24, 0.05, "highpass", 5000);
    } else if ([80, 81].includes(drum)) {
      tone(6300, 6300, drum === 80 ? 0.1 : 0.7, 0.16, "square");
      tone(8000, 8000, drum === 80 ? 0.1 : 0.7, 0.11, "square");
    } else if (drum >= 60 && drum <= 66 || drum === 78 || drum === 79) {
      const frequency = Math.max(75, 520 - (drum - 60) * 36);
      tone(frequency, frequency * 0.72, Math.max(0.12, Math.min(held, 0.34)), 0.27, drum >= 65 ? "triangle" : "sine");
    } else if (drum >= 35 && drum <= 81) {
      const frequency = 120 + (drum - 35) * 18;
      tone(frequency, frequency * 0.82, Math.max(0.08, Math.min(held, 0.3)), 0.18, "triangle");
    } else {
      tone(150, 60, Math.max(0.1, Math.min(held, 0.24)), 0.24);
    }
  }

  pause() {
    if (this.playing) this.position = this.currentTime;
    this.playing = false;
    clearInterval(this.timer);
    this.timer = null;
    for (const node of this.nodes) {
      try { node.stop(); } catch {}
    }
    this.nodes.clear();
    this.voiceMetadata.clear();
    this.clearMidiOutput();
  }

  outputTimestamp(audioTime) {
    return performance.now() + Math.max(0, audioTime - (this.context?.currentTime ?? 0)) * 1000;
  }

  sendMidi(bytes, audioTime = this.context?.currentTime ?? 0) {
    const status = bytes?.[0] ?? 0;
    if (status < 0x80 || status >= 0xf0) return;
    const channel = status & 0x0f;
    const output = this.channelOutputs[channel] === undefined ? this.midiOutput : this.channelOutputs[channel];
    if (!output) return;
    try { output.send(bytes, this.outputTimestamp(audioTime)); } catch {}
  }

  clearMidiOutput() {
    const outputs = new Set([this.midiOutput, ...this.channelOutputs].filter(Boolean));
    if (!outputs.size) return;
    for (const output of outputs) { try { output.clear(); } catch {} }
    for (let channel = 0; channel < 16; channel++) this.sendMidi([0xb0 | channel, 123, 0]);
  }

  hasMidiOutput(channel) {
    return this.channelOutputs[channel] === undefined ? Boolean(this.midiOutput) : Boolean(this.channelOutputs[channel]);
  }

  hasAnyMidiOutput() {
    return Array.from({ length: 16 }, (_, channel) => this.hasMidiOutput(channel)).some(Boolean);
  }

  scheduleMidiNote(note, startTime, endTime) {
    const channel = note.channel;
    const pitch = channel === 9 ? note.note : Math.max(0, Math.min(127, note.note + this.transpose));
    const settings = this.channelMix[channel];
    const hasSolo = this.channelMix.some((setting) => setting.solo);
    const muted = settings.muted || (hasSolo && !settings.solo);
    const velocity = muted ? 0 : note.velocity;
    if (velocity) this.sendMidi([0x90 | channel, pitch, velocity], startTime);
    this.sendMidi([0x80 | channel, pitch, 0], endTime);
  }

  async setMidiOutput(output) {
    const wasPlaying = this.playing;
    const position = this.currentTime;
    if (wasPlaying) this.pause();
    this.midiOutput = output ?? null;
    this.position = position;
    if (this.midiOutput) {
      try { await this.midiOutput.open(); } catch {}
    }
    if (wasPlaying) await this.play();
  }

  async setChannelOutput(channel, output) {
    if (!Number.isInteger(channel) || channel < 0 || channel > 15) return;
    const wasPlaying = this.playing;
    const position = this.currentTime;
    if (wasPlaying) this.pause();
    this.channelOutputs[channel] = output === undefined ? undefined : output ?? null;
    const selected = this.channelOutputs[channel] === undefined ? this.midiOutput : this.channelOutputs[channel];
    if (selected) { try { await selected.open(); } catch {} }
    if (this.data && selected) {
      const program = this.channelMix[channel]?.program;
      if (channel !== 9) this.sendMidi([0xc0 | channel, program ?? this.data.channels[channel]?.programs?.[0] ?? 0]);
      this.sendMidiChannelMix(channel);
    }
    this.position = position;
    if (wasPlaying) await this.play();
  }

  midiChannelPan(channel) {
    const sourcePan = this.controllerValues[channel]?.pan ?? 0;
    const mixPan = this.channelMix[channel]?.pan ?? 0;
    return Math.round(Math.max(0, Math.min(127, 64 + (sourcePan + mixPan) * 63)));
  }

  midiChannelVolume(channel) {
    const settings = this.channelMix[channel];
    const hasSolo = this.channelMix.some((setting) => setting.solo);
    if (!settings || settings.muted || (hasSolo && !settings.solo)) return 0;
    return Math.round(127 * this.volume * settings.volume * (this.controllerValues[channel]?.volume ?? 1));
  }

  sendMidiChannelMix(channel, audioTime = this.context?.currentTime ?? 0) {
    this.sendMidi([0xb0 | channel, 7, this.midiChannelVolume(channel)], audioTime);
    this.sendMidi([0xb0 | channel, 10, this.midiChannelPan(channel)], audioTime);
    this.sendMidi([0xb0 | channel, 11, Math.round(127 * (this.controllerValues[channel]?.expression ?? 1))], audioTime);
  }

  resetProgramsAt(position) {
    const events = this.data?.programChanges ?? [];
    const programs = new Array(16).fill(0);
    let cursor = 0;
    while (cursor < events.length && events[cursor].time <= position) {
      programs[events[cursor].channel] = events[cursor].program;
      cursor++;
    }
    this.programCursor = cursor;
    if (!this.hasAnyMidiOutput()) return;
    for (let channel = 0; channel < 16; channel++) {
      if (channel === 9) continue;
      const selected = this.channelMix[channel]?.program;
      this.sendMidi([0xc0 | channel, selected ?? programs[channel]]);
      this.sendMidiChannelMix(channel);
    }
  }

  schedulePrograms(position, horizon) {
    const events = this.data?.programChanges ?? [];
    while (this.programCursor < events.length && events[this.programCursor].time <= horizon) {
      const event = events[this.programCursor++];
      if (this.channelMix[event.channel]?.program !== null && this.channelMix[event.channel]?.program !== undefined) continue;
      const at = this.context.currentTime + Math.max(0, event.time - position) / this.rate;
      this.sendMidi([0xc0 | event.channel, event.program], at);
    }
  }

  async seek(seconds) {
    const wasPlaying = this.playing;
    this.pause();
    this.position = Math.max(0, Math.min(this.duration, seconds));
    this.resetControllersAt(this.position);
    this.onTime(this.position, this.duration);
    if (wasPlaying) await this.play();
  }

  async setRate(rate) {
    const wasPlaying = this.playing;
    const position = this.currentTime;
    this.pause();
    this.rate = Math.max(0.5, Math.min(1.5, rate));
    this.position = position;
    if (wasPlaying) await this.play();
  }

  async setTranspose(semitones) {
    const wasPlaying = this.playing;
    const position = this.currentTime;
    this.pause();
    this.transpose = Math.max(-12, Math.min(12, semitones));
    this.position = position;
    if (wasPlaying) await this.play();
  }

  setVolume(volume) {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.master && this.context) this.master.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.015);
    for (let channel = 0; channel < 16; channel++) this.sendMidiChannelMix(channel);
  }

  controllerDefaults() {
    return Array.from({ length: 16 }, () => ({ volume: 1, expression: 1, pan: 0 }));
  }

  updateControllerValue(values, event) {
    const setting = values[event.channel];
    if (!setting) return;
    if (event.controller === 7) setting.volume = event.value / 127;
    else if (event.controller === 11) setting.expression = event.value / 127;
    else if (event.controller === 10) setting.pan = event.value < 64 ? (event.value - 64) / 64 : (event.value - 64) / 63;
  }

  resetControllersAt(position) {
    const values = this.controllerDefaults();
    const events = this.data?.controllers ?? [];
    let cursor = 0;
    while (cursor < events.length && events[cursor].time <= position) {
      this.updateControllerValue(values, events[cursor]);
      cursor++;
    }
    this.controllerValues = values;
    this.controllerCursor = cursor;
    if (!this.context) return;
    const now = this.context.currentTime;
    for (let channel = 0; channel < 16; channel++) {
      const setting = values[channel];
      const gain = this.controllerGains[channel]?.gain;
      const panner = this.controllerPanners[channel]?.pan;
      if (gain) {
        gain.cancelScheduledValues(now);
        gain.setValueAtTime(setting.volume * setting.expression, now);
      }
      if (panner) {
        panner.cancelScheduledValues(now);
        panner.setValueAtTime(setting.pan, now);
      }
      this.sendMidiChannelMix(channel);
    }
  }

  scheduleControllers(position, horizon) {
    const events = this.data?.controllers ?? [];
    while (this.controllerCursor < events.length && events[this.controllerCursor].time <= horizon) {
      const event = events[this.controllerCursor++];
      this.updateControllerValue(this.controllerValues, event);
      const at = this.context.currentTime + Math.max(0, event.time - position) / this.rate;
      const gain = this.controllerGains[event.channel]?.gain;
      const panner = this.controllerPanners[event.channel]?.pan;
      if (gain) gain.setValueAtTime(this.controllerValues[event.channel].volume * this.controllerValues[event.channel].expression, at);
      if (panner) panner.setValueAtTime(this.controllerValues[event.channel].pan, at);
      if (this.hasMidiOutput(event.channel)) {
        if (event.controller === 7) this.sendMidi([0xb0 | event.channel, 7, this.midiChannelVolume(event.channel)], at);
        else if (event.controller === 10) this.sendMidi([0xb0 | event.channel, 10, this.midiChannelPan(event.channel)], at);
        else if (event.controller === 11) this.sendMidi([0xb0 | event.channel, 11, Math.round(127 * this.controllerValues[event.channel].expression)], at);
        else this.sendMidi([0xb0 | event.channel, event.controller, event.value], at);
      }
    }
  }

  applyChannelMix(channel) {
    const settings = this.channelMix[channel];
    if (!settings || !this.context) return;
    const hasSolo = this.channelMix.some((setting) => setting.solo);
    const soloExcluded = hasSolo && !settings.solo;
    const gain = this.channelGains[channel];
    if (gain) gain.gain.setTargetAtTime(settings.muted || soloExcluded ? 0 : settings.volume, this.context.currentTime, 0.02);
    const panner = this.channelPanners[channel];
    if (panner) panner.pan.setTargetAtTime(settings.pan, this.context.currentTime, 0.02);
    this.sendMidiChannelMix(channel);
  }

  setChannelMix(mix) {
    this.channelMix = Array.from({ length: 16 }, (_, channel) => {
      const setting = mix?.[channel] ?? {};
      return {
        volume: Number.isFinite(setting.volume) ? Math.max(0, Math.min(1, setting.volume)) : 1,
        muted: Boolean(setting.muted),
        solo: Boolean(setting.solo),
        program: Number.isInteger(setting.program) && setting.program >= 0 && setting.program <= 127 ? setting.program : null,
        pan: Number.isFinite(setting.pan) ? Math.max(-1, Math.min(1, setting.pan)) : 0,
      };
    });
    for (let channel = 0; channel < 16; channel++) this.applyChannelMix(channel);
  }

  setChannelVolume(channel, volume) {
    if (!Number.isInteger(channel) || channel < 0 || channel > 15) return;
    this.channelMix[channel].volume = Math.max(0, Math.min(1, volume));
    this.applyChannelMix(channel);
  }

  setChannelPan(channel, pan) {
    if (!Number.isInteger(channel) || channel < 0 || channel > 15) return;
    this.channelMix[channel].pan = Math.max(-1, Math.min(1, pan));
    this.applyChannelMix(channel);
  }

  setChannelMuted(channel, muted) {
    if (!Number.isInteger(channel) || channel < 0 || channel > 15) return;
    this.channelMix[channel].muted = Boolean(muted);
    this.applyChannelMix(channel);
  }

  setChannelSolo(channel, solo) {
    if (!Number.isInteger(channel) || channel < 0 || channel > 15) return;
    this.channelMix[channel].solo = Boolean(solo);
    for (let index = 0; index < 16; index++) this.applyChannelMix(index);
  }

  setChannelProgram(channel, program) {
    if (!Number.isInteger(channel) || channel < 0 || channel > 15 || channel === 9) return;
    if (program !== null && (!Number.isInteger(program) || program < 0 || program > 127)) return;
    this.channelMix[channel].program = program;
    if (this.hasMidiOutput(channel)) {
      if (this.playing) {
        const position = this.currentTime;
        this.pause();
        this.position = position;
        this.play().catch(() => {});
      }
      return;
    }
    if (!this.playing || !this.data || !this.context) return;

    const position = this.currentTime;
    const cutoff = position + 0.015;
    const audioTime = this.context.currentTime;
    for (const source of this.nodes) {
      const voice = this.voiceMetadata.get(source);
      if (Number.isFinite(voice?.songTime) && voice.songTime > cutoff) {
        try { source.stop(audioTime); } catch {}
      }
    }
    this.cursor = this.data.notes.findIndex((note) => note.time > cutoff);
    if (this.cursor < 0) this.cursor = this.data.notes.length;
    this.scheduleAhead();
  }
}
