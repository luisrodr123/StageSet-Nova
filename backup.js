const MAGIC = "SSTBK001";
const PREFIX_SIZE = 12;
const MAX_HEADER_SIZE = 32 * 1024 * 1024;
const MAX_BACKUP_SIZE = 4 * 1024 * 1024 * 1024;
const MAX_SONGS = 10000;

function asAsset(blob, offset) {
  if (!(blob instanceof Blob)) return null;
  return { descriptor: { offset, size: blob.size, type: blob.type }, blob };
}

export function createBackup(songs, preferences) {
  if (songs.length > MAX_SONGS) throw new Error("A biblioteca excede o limite de 10 000 faixas.");
  const payloads = [];
  let payloadSize = 0;
  const backedSongs = songs.map((song) => {
    const { audioBlob, midiBlob, cdgBlob, audioStems = [], ...metadata } = song;
    const audio = asAsset(audioBlob, payloadSize);
    if (!audio) throw new Error("A faixa “" + song.title + "” não tem áudio ou documento guardado.");
    payloads.push(audio.blob);
    payloadSize += audio.blob.size;
    const assets = { audio: audio.descriptor };
    for (const [key, blob] of [["midi", midiBlob], ["cdg", cdgBlob]]) {
      const asset = asAsset(blob, payloadSize);
      if (!asset) continue;
      assets[key] = asset.descriptor;
      payloads.push(asset.blob);
      payloadSize += asset.blob.size;
    }
    const backedStems = audioStems.map((stem, index) => {
      const key = `stem${index}`;
      const asset = asAsset(stem.blob, payloadSize);
      if (!asset) return { ...stem, blob: null, assetKey: null };
      assets[key] = asset.descriptor;
      payloads.push(asset.blob);
      payloadSize += asset.blob.size;
      const { blob, ...stemMetadata } = stem;
      return { ...stemMetadata, assetKey: key };
    });
    return { ...metadata, audioStems: backedStems, assets };
  });
  if (payloadSize + PREFIX_SIZE > MAX_BACKUP_SIZE) throw new Error("A cópia de segurança excede 4 GB.");

  const manifest = {
    version: 1,
    createdAt: new Date().toISOString(),
    songs: backedSongs,
    preferences: {
      setlist: preferences.setlist,
      playedSongIds: preferences.playedSongIds,
      currentId: preferences.currentId,
      autoScroll: preferences.autoScroll,
      volume: preferences.volume,
      pedalMappings: preferences.pedalMappings,
      setlistCcConfig: preferences.setlistCcConfig,
      quickies: preferences.quickies,
      hideSetlistDuringPlayback: preferences.hideSetlistDuringPlayback,
      interSongDelay: preferences.interSongDelay,
    },
  };
  const headerBytes = new TextEncoder().encode(JSON.stringify(manifest));
  if (headerBytes.byteLength > MAX_HEADER_SIZE) throw new Error("Os metadados excedem o limite do formato de cópia.");
  if (payloadSize + PREFIX_SIZE + headerBytes.byteLength > MAX_BACKUP_SIZE) throw new Error("A cópia de segurança excede 4 GB.");
  const prefix = new ArrayBuffer(PREFIX_SIZE);
  const prefixBytes = new Uint8Array(prefix);
  prefixBytes.set(new TextEncoder().encode(MAGIC), 0);
  new DataView(prefix).setUint32(8, headerBytes.byteLength, true);
  return new Blob([prefix, headerBytes, ...payloads], { type: "application/octet-stream" });
}

function readAsset(file, descriptor, payloadOffset) {
  if (!descriptor || !Number.isSafeInteger(descriptor.offset) || !Number.isSafeInteger(descriptor.size) ||
      descriptor.offset < 0 || descriptor.size < 0) {
    throw new Error("A cópia contém uma referência de ficheiro inválida.");
  }
  const start = payloadOffset + descriptor.offset;
  const end = start + descriptor.size;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end > file.size) {
    throw new Error("A cópia está incompleta ou foi alterada.");
  }
  const type = typeof descriptor.type === "string" ? descriptor.type : "application/octet-stream";
  return { blob: file.slice(start, end, type), range: [descriptor.offset, descriptor.offset + descriptor.size] };
}

export async function readBackup(file) {
  if (file.size < PREFIX_SIZE || file.size > MAX_BACKUP_SIZE) throw new Error("O tamanho do ficheiro de cópia não é suportado.");
  const prefix = await file.slice(0, PREFIX_SIZE).arrayBuffer();
  const view = new DataView(prefix);
  const magic = new TextDecoder().decode(new Uint8Array(prefix, 0, 8));
  if (magic !== MAGIC) throw new Error("Este ficheiro não é uma cópia StageSet válida.");
  const headerSize = view.getUint32(8, true);
  if (!headerSize || headerSize > MAX_HEADER_SIZE || PREFIX_SIZE + headerSize > file.size) {
    throw new Error("O cabeçalho da cópia está inválido.");
  }
  let manifest;
  try {
    const header = await file.slice(PREFIX_SIZE, PREFIX_SIZE + headerSize).text();
    manifest = JSON.parse(header);
  } catch {
    throw new Error("Não foi possível ler os metadados da cópia.");
  }
  if (manifest?.version !== 1 || !Array.isArray(manifest.songs) || manifest.songs.length > MAX_SONGS) {
    throw new Error("A versão ou a biblioteca desta cópia não é suportada.");
  }

  const payloadOffset = PREFIX_SIZE + headerSize;
  const ids = new Set();
  const ranges = [];
  const songs = manifest.songs.map((entry) => {
    if (!entry || typeof entry.id !== "string" || !entry.id || ids.has(entry.id) ||
        typeof entry.title !== "string" || typeof entry.fileName !== "string") {
      throw new Error("A cópia contém dados de faixa inválidos ou repetidos.");
    }
    if (Array.isArray(entry.audioStems) && entry.audioStems.length > 31) throw new Error("A cópia excede o limite de pistas de áudio por música.");
    ids.add(entry.id);
    const metadata = { ...entry };
    const assets = metadata.assets ?? {};
    delete metadata.assets;
    delete metadata.audioBlob;
    delete metadata.midiBlob;
    delete metadata.cdgBlob;
    const audio = readAsset(file, assets?.audio, payloadOffset);
    ranges.push(audio.range);
    const song = { ...metadata, audioBlob: audio.blob };
    for (const [key, property] of [["midi", "midiBlob"], ["cdg", "cdgBlob"]]) {
      if (!assets?.[key]) continue;
      const asset = readAsset(file, assets[key], payloadOffset);
      ranges.push(asset.range);
      song[property] = asset.blob;
    }
    song.audioStems = (Array.isArray(metadata.audioStems) ? metadata.audioStems : []).map((stem) => {
      const restored = { ...stem };
      const key = restored.assetKey;
      delete restored.assetKey;
      if (key && assets[key]) {
        const asset = readAsset(file, assets[key], payloadOffset);
        ranges.push(asset.range);
        restored.blob = asset.blob;
      } else {
        restored.blob = null;
      }
      return restored;
    });
    return song;
  });
  ranges.sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < ranges.length; i++) {
    if (ranges[i][0] < ranges[i - 1][1]) throw new Error("A cópia contém ficheiros sobrepostos.");
  }

  const preferences = manifest.preferences ?? {};
  const setlistCcConfig = preferences.setlistCcConfig ?? {};
  const setlist = Array.isArray(preferences.setlist)
    ? [...new Set(preferences.setlist.filter((id) => typeof id === "string" && ids.has(id)))]
    : [];
  const playedSongIds = Array.isArray(preferences.playedSongIds)
    ? [...new Set(preferences.playedSongIds.filter((id) => typeof id === "string" && ids.has(id)))]
    : [];
  const quickies = Array.isArray(preferences.quickies)
    ? Array.from({ length: 9 }, (_, index) => typeof preferences.quickies[index] === "string" && ids.has(preferences.quickies[index]) ? preferences.quickies[index] : null)
    : Array(9).fill(null);
  return {
    songs,
    setlist,
    playedSongIds,
    quickies,
    currentId: typeof preferences.currentId === "string" && ids.has(preferences.currentId) ? preferences.currentId : null,
    autoScroll: typeof preferences.autoScroll === "boolean" ? preferences.autoScroll : true,
    hideSetlistDuringPlayback: typeof preferences.hideSetlistDuringPlayback === "boolean" ? preferences.hideSetlistDuringPlayback : false,
    interSongDelay: Number.isFinite(preferences.interSongDelay) ? Math.max(0, Math.min(3600, preferences.interSongDelay)) : 0,
    volume: Number.isFinite(preferences.volume) ? Math.max(0, Math.min(1, preferences.volume)) : 0.8,
    setlistCcConfig: {
      enabled: typeof setlistCcConfig.enabled === "boolean" ? setlistCcConfig.enabled : false,
      type: setlistCcConfig.type === "program" ? "program" : "cc",
      channel: Number.isInteger(setlistCcConfig.channel) ? Math.max(0, Math.min(15, setlistCcConfig.channel)) : 0,
      number: Number.isInteger(setlistCcConfig.number) ? Math.max(0, Math.min(127, setlistCcConfig.number)) : 20,
    },
    pedalMappings: Array.isArray(preferences.pedalMappings) && preferences.pedalMappings.length === 4
      ? preferences.pedalMappings
      : null,
  };
}
