const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const MAX_ENTRIES = 1000;
const MAX_EXPANDED_BYTES = 512 * 1024 * 1024;

function extensionOf(name) {
  return name.slice(name.lastIndexOf(".") + 1).toLowerCase();
}

function pairKey(path) {
  const normalized = path.replaceAll("\\", "/");
  const slash = normalized.lastIndexOf("/");
  const directory = slash < 0 ? "" : normalized.slice(0, slash + 1).toLocaleLowerCase();
  const name = slash < 0 ? normalized : normalized.slice(slash + 1);
  return directory + name.slice(0, name.lastIndexOf(".")).toLocaleLowerCase();
}

function findEndRecord(view) {
  const minimum = Math.max(0, view.byteLength - 22 - 65535);
  for (let offset = view.byteLength - 22; offset >= minimum; offset--) {
    if (view.getUint32(offset, true) === EOCD_SIGNATURE && offset + 22 + view.getUint16(offset + 20, true) <= view.byteLength) return offset;
  }
  throw new Error("O ZIP não tem um diretório central válido.");
}

function readEntries(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = findEndRecord(view);
  const disk = view.getUint16(end + 4, true);
  const centralDisk = view.getUint16(end + 6, true);
  const entriesOnDisk = view.getUint16(end + 8, true);
  const entryCount = view.getUint16(end + 10, true);
  const centralSize = view.getUint32(end + 12, true);
  const centralOffset = view.getUint32(end + 16, true);
  if (disk !== 0 || centralDisk !== 0 || entriesOnDisk !== entryCount) {
    throw new Error("Este ZIP dividido em volumes não é suportado.");
  }
  if (entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    throw new Error("ZIP64 não é suportado.");
  }
  if (entryCount > MAX_ENTRIES || centralOffset + centralSize > bytes.length) {
    throw new Error("O ZIP excede os limites suportados ou está incompleto.");
  }

  const entries = [];
  let offset = centralOffset;
  for (let index = 0; index < entryCount; index++) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== CENTRAL_SIGNATURE) {
      throw new Error("O diretório central do ZIP está incompleto.");
    }
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const expandedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const end = offset + 46 + nameLength + extraLength + commentLength;
    if (end > bytes.length) throw new Error("Um registo do ZIP está incompleto.");
    const decoder = new TextDecoder((flags & 0x0800) ? "utf-8" : "windows-1252");
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    if (compressedSize === 0xffffffff || expandedSize === 0xffffffff || localOffset === 0xffffffff) {
      throw new Error("ZIP64 não é suportado.");
    }
    entries.push({ name, flags, method, compressedSize, expandedSize, localOffset });
    offset = end;
  }
  return entries;
}

async function readEntry(bytes, entry) {
  if (entry.flags & 1) throw new Error("Os ficheiros ZIP protegidos por palavra-passe não são suportados.");
  if (entry.expandedSize > MAX_EXPANDED_BYTES) throw new Error("Um ficheiro dentro do ZIP é demasiado grande.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const local = entry.localOffset;
  if (local + 30 > bytes.length || view.getUint32(local, true) !== LOCAL_SIGNATURE) {
    throw new Error("O cabeçalho de um ficheiro no ZIP é inválido.");
  }
  const nameLength = view.getUint16(local + 26, true);
  const extraLength = view.getUint16(local + 28, true);
  const dataStart = local + 30 + nameLength + extraLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataEnd > bytes.length) throw new Error("Os dados de um ficheiro no ZIP estão incompletos.");
  const compressed = bytes.subarray(dataStart, dataEnd);
  let result;
  if (entry.method === 0) result = compressed.slice();
  else if (entry.method === 8) {
    if (!("DecompressionStream" in globalThis)) throw new Error("Este browser não consegue descomprimir ficheiros ZIP.");
    try {
      const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      result = new Uint8Array(await new Response(stream).arrayBuffer());
    } catch {
      throw new Error("Não foi possível descomprimir este ficheiro ZIP.");
    }
  } else throw new Error("O ZIP usa um método de compressão não suportado.");
  if (result.byteLength !== entry.expandedSize) throw new Error("O tamanho de um ficheiro descomprimido não corresponde ao ZIP.");
  return result;
}

function makeFile(bytes, name, type) {
  return new File([bytes], name.split(/[\\/]/).at(-1), { type });
}

export async function extractMp3CdgPairs(archiveFile) {
  if (archiveFile.size > MAX_EXPANDED_BYTES) throw new Error("O ZIP excede o limite de 512 MB.");
  const bytes = new Uint8Array(await archiveFile.arrayBuffer());
  const candidates = new Map();
  for (const entry of readEntries(bytes)) {
    const extension = extensionOf(entry.name);
    if (!["mp3", "wav", "cdg"].includes(extension) || /[\\/]$/.test(entry.name)) continue;
    const key = pairKey(entry.name);
    const group = candidates.get(key) ?? {};
    if (extension === "cdg") group.cdg = entry;
    else group.audio = entry;
    candidates.set(key, group);
  }

  const pairs = [...candidates.values()].filter((group) => group.audio && group.cdg);
  if (!pairs.length) throw new Error("Não encontrei um par MP3/WAV e CD+G com o mesmo nome dentro do ZIP.");
  const totalSize = pairs.reduce((sum, group) => sum + group.audio.expandedSize + group.cdg.expandedSize, 0);
  if (totalSize > MAX_EXPANDED_BYTES) throw new Error("O conteúdo descomprimido excede 512 MB.");

  const output = [];
  for (const pair of pairs) {
    const [audioBytes, cdgBytes] = await Promise.all([readEntry(bytes, pair.audio), readEntry(bytes, pair.cdg)]);
    const audioName = pair.audio.name.split(/[\\/]/).at(-1);
    const cdgName = pair.cdg.name.split(/[\\/]/).at(-1);
    const audioType = extensionOf(audioName) === "mp3" ? "audio/mpeg" : "audio/wav";
    output.push({
      audioFile: makeFile(audioBytes, audioName, audioType),
      cdgFile: makeFile(cdgBytes, cdgName, "application/octet-stream"),
    });
  }
  return output;
}

const STEM_AUDIO_TYPES = new Map([
  ["mp3", "audio/mpeg"],
  ["wav", "audio/wav"],
  ["m4a", "audio/mp4"],
  ["ogg", "audio/ogg"],
  ["flac", "audio/flac"],
  ["mogg", "audio/ogg"],
]);

export async function extractAudioStems(archiveFile) {
  if (archiveFile.size > MAX_EXPANDED_BYTES) throw new Error("O ZIP excede o limite de 512 MB.");
  const bytes = new Uint8Array(await archiveFile.arrayBuffer());
  const entries = readEntries(bytes).filter((entry) => STEM_AUDIO_TYPES.has(extensionOf(entry.name)) && !/[\\/]$/.test(entry.name));
  if (!entries.length) throw new Error("O ZIP não contém pistas de áudio compatíveis.");
  const totalSize = entries.reduce((sum, entry) => sum + entry.expandedSize, 0);
  if (totalSize > MAX_EXPANDED_BYTES) throw new Error("O conteúdo descomprimido excede 512 MB.");

  const output = [];
  for (const entry of entries) {
    const extension = extensionOf(entry.name);
    const fileName = entry.name.split(/[\\/]/).at(-1);
    const fileBytes = await readEntry(bytes, entry);
    output.push(makeFile(fileBytes, fileName, STEM_AUDIO_TYPES.get(extension)));
  }
  return output;
}
