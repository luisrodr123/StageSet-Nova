// Bounded preflight for the experimental shared-clock transport. No user files are modified.
const MAX_HEADER_BYTES = 1024 * 1024;
const MAX_TRACKS = 16;
export const DEFAULT_DECODED_BUDGET = 512 * 1024 * 1024;

export async function inspectWav(blob, outputSampleRate) {
  if (!(blob instanceof Blob) || blob.size < 44) throw new Error('Ficheiro WAV incompleto.');
  if (!Number.isFinite(outputSampleRate) || outputSampleRate <= 0) throw new RangeError('Frequência de áudio inválida.');
  const data = await blob.slice(0, Math.min(blob.size, MAX_HEADER_BYTES)).arrayBuffer();
  const view = new DataView(data);
  const text = (start, length) => String.fromCharCode(...new Uint8Array(data, start, length));
  if (text(0, 4) !== 'RIFF' || text(8, 4) !== 'WAVE') throw new Error('Formato WAV RIFF não suportado.');
  const riffEnd = view.getUint32(4, true) + 8;
  if (riffEnd > blob.size || riffEnd < 44) throw new Error('Tamanho RIFF inválido.');
  let format, dataSize;
  for (let offset = 12; offset + 8 <= data.byteLength && offset + 8 <= riffEnd;) {
    const id = text(offset, 4), size = view.getUint32(offset + 4, true), start = offset + 8;
    if (start + size > riffEnd) throw new Error('Secção WAV ultrapassa o ficheiro.');
    if (id === 'fmt ') {
      if (size < 16 || start + Math.min(size, 40) > data.byteLength) throw new Error('Formato WAV incompleto.');
      let type = view.getUint16(start, true);
      const channels = view.getUint16(start + 2, true), sampleRate = view.getUint32(start + 4, true);
      const blockAlign = view.getUint16(start + 12, true), bits = view.getUint16(start + 14, true);
      if (type === 0xfffe) {
        if (size < 40 || view.getUint16(start + 16, true) < 22) throw new Error('WAV extensível incompleto.');
        const guid = [...new Uint8Array(data, start + 24, 16)];
        const suffix = [0,0,0,0,0x10,0,0x80,0,0,0xaa,0,0x38,0x9b,0x71];
        if (!suffix.every((byte, i) => guid[i + 2] === byte)) throw new Error('Subformato WAV extensível não suportado.');
        type = view.getUint16(start + 24, true);
      }
      if (![1, 3].includes(type) || channels < 1 || channels > 32 || sampleRate < 8000 || sampleRate > 384000 || ![8,16,24,32,64].includes(bits) || (type === 3 && ![32,64].includes(bits)) || blockAlign !== channels * bits / 8) throw new Error('Formato WAV PCM não suportado.');
      format = { channels, sampleRate, blockAlign };
    }
    if (id === 'data') { dataSize = size; if (format) break; }
    offset = start + size + (size & 1);
  }
  if (!format || dataSize === undefined || dataSize % format.blockAlign) throw new Error('Dados WAV inválidos ou cabeçalho demasiado grande.');
  const frames = dataSize / format.blockAlign;
  const decodedBytes = Math.ceil(frames * outputSampleRate / format.sampleRate) * format.channels * 4;
  if (!Number.isSafeInteger(decodedBytes) || decodedBytes <= 0) throw new Error('Duração WAV inválida.');
  return { ...format, frames, decodedBytes };
}

export async function decodeWavTracks(context, files, { budget = DEFAULT_DECODED_BUDGET, signal } = {}) {
  if (!context || !Array.isArray(files) || files.length < 1 || files.length > MAX_TRACKS) throw new RangeError('São necessárias entre 1 e 16 WAV.');
  if (!Number.isSafeInteger(budget) || budget <= 0) throw new RangeError('Limite de memória inválido.');
  const check = () => { if (signal?.aborted) throw new DOMException('Preparação cancelada.', 'AbortError'); };
  const metadata = [];
  for (const file of files) { check(); metadata.push(await inspectWav(file, context.sampleRate)); }
  check();
  if (metadata.reduce((sum, item) => sum + item.decodedBytes, 0) > budget) throw new Error('As WAV excedem o limite de memória para sincronismo; a reprodução não foi iniciada.');
  const buffers = [];
  let used = 0;
  for (const file of files) {
    check();
    const bytes = await file.arrayBuffer();
    check();
    const buffer = await context.decodeAudioData(bytes);
    check();
    used += buffer.length * buffer.numberOfChannels * 4;
    if (used > budget) throw new Error('As WAV descodificadas excedem o limite de memória.');
    buffers.push(buffer);
  }
  return buffers;
}
