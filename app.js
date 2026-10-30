import { MidiPlayer, createKaraokeMidi, createMidiFromNotes, parseMidiFile } from "./midi.js";
import { CdgDecoder } from "./cdg.js";
import { isDocumentSong, readDocumentText } from "./documents.js";
import { extractMp3CdgPairs, extractAudioStems } from "./zip-import.js";
import { createBackup, readBackup } from "./backup.js";
import { NetworkMidi } from './network-midi.js';
import { setupSync } from './sync.js';
import { setupSession } from './session-ui.js';
import { normalizeBackground, applyBackground, setupBackgroundEditor } from './backgrounds.js';

if ("serviceWorker" in navigator && (location.hostname === "127.0.0.1" || location.hostname === "localhost")) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

const DB_NAME = "stageset-library";
const DB_VERSION = 1;
const STORE = "songs";
const validSelectTypes = ["cc", "program", "note", "song"];
const savedSelectType = localStorage.getItem("stageset-midi-select-type");
let buttonShortcuts = {};
try { buttonShortcuts = JSON.parse(localStorage.getItem("stageset-button-shortcuts") || "{}"); } catch {}
let buttonLearnTarget = null;
const shortcutMidiDown = new Set();
function buttonKey(button){
  if(button.id)return button.id;
  const scope=button.closest('[data-learn-scope]')||button.parentElement.closest('[id]')||document.body;
  const path=[];let el=button;
  while(el!==scope&&el){path.unshift([...el.parentElement.children].indexOf(el));el=el.parentElement;}
  return 'learn:'+JSON.stringify([scope.dataset.learnScope||scope.id||'body',...path]);
}
function shortcutButton(key){return document.getElementById(key)||[...document.querySelectorAll('button')].find(button=>buttonKey(button)===key);}
function assignButtonShortcut(kind,value){const old=buttonShortcuts[buttonLearnTarget]||{};buttonShortcuts[buttonLearnTarget]={...(old.type?{[old.type==='key'?'key':'midi']:old}:old),[kind]:value};localStorage.setItem('stageset-button-shortcuts',JSON.stringify(buttonShortcuts));buttonLearnTarget=null;}
let buttonLearnKind='key';
document.addEventListener('contextmenu',event=>{
  const button=event.target.closest('button');if(!button||button.disabled||!requireStudio())return;
  event.preventDefault();buttonLearnTarget=buttonKey(button);buttonLearnKind='pending';
  $('#learn-button-name').textContent=button.getAttribute('aria-label')||button.title||button.textContent.trim();$('#learn-modal').hidden=false;
});

function loadDisplayOutputs() {
  const fallback = ["Vocalista", "Banda", "Público", "Teleponto"].map((name, index) => ({ id: String(index + 1), name, color: ["#65e2c1", "#79a9ff", "#f0b36c", "#d59aff"][index] }));
  try {
    const saved = JSON.parse(localStorage.getItem("stageset-display-outputs") || "null");
    if (Array.isArray(saved)) return saved.slice(0, 8).map((item, index) => ({ id: String(item.id || index + 1), name: String(item.name || `Ecrã ${index + 1}`).slice(0, 40), displayId: String(item.displayId || ""), mosaicVisible: item.mosaicVisible !== false, background:normalizeBackground(item.background), color: /^#[\da-f]{6}$/i.test(item.color) ? item.color : fallback[index % fallback.length].color }));
  } catch {}
  localStorage.setItem("stageset-display-outputs", JSON.stringify(fallback));
  return fallback;
}
const state = { songs: [], setlist: [], quickies: loadQuickies(), quickiePlaying: false, currentId: null, query: "", librarySort: localStorage.getItem("stageset-library-sort") ?? "title", favoritesOnly: false, historyOnly: false, setlistCcEnabled: localStorage.getItem("stageset-cc-select-enabled") === "true", setlistMidiType: validSelectTypes.includes(savedSelectType) ? savedSelectType : "cc", setlistCcChannel: Math.max(0, Math.min(15, Number(localStorage.getItem("stageset-cc-select-channel") ?? "0"))), setlistCcNumber: Math.max(0, Math.min(127, Number(localStorage.getItem("stageset-cc-select-number") ?? "20"))), activeObjectUrl: null, toastTimer: null, autoScroll: true, manualLyricOffset: 0, cdgView: false, midiAccess: null, midiPermissionStatus: "pending", midiOutputId: "", pedalInput: null, pedalInputId: "", learningPedal: -1, lyricShortcutLearning: false, learningSetlistMidi: false, learningSongMidiId: null, pedalDown: new Set(), pedalSequenceStarted: new Set(), pedalMappings: loadPedalMappings(), hideSetlistDuringPlayback: localStorage.getItem("stageset-hide-setlist") === "true", interSongDelay: Math.max(0, Math.min(3600, Number(localStorage.getItem("stageset-inter-song-delay")) || 0)), queueDisplayHidden: false, mode: "live", playedSongIds: new Set(loadPlayedSongIds()), lyricHighlightColor: localStorage.getItem("stageset-lyric-highlight") || "#65e2c1", timelineZoom: 1, displayWindows: [], mosaicWindow: null, displayOutputs: loadDisplayOutputs(), expandedLibrarySongId: null, timelineUndo: [], lyricLastPosition: 0, timelineLastPosition: -0.001 };

const $ = (selector) => document.querySelector(selector);
const audio = $("#audio");
const midiPlayer = new MidiPlayer();
let syncController;
let sessionController;
let backgroundEditor;
const sentBackgrounds = new WeakMap();
function mainBackground() { try{return normalizeBackground(JSON.parse(localStorage.getItem('stageset-main-background')||'{}'));}catch{return normalizeBackground();} }
const networkMidi = new NetworkMidi((event,id)=>syncController?.receiveMidi(event,id), error=>{
  renderMidiInputs();renderMidiOutputs();syncController?.refreshPorts();
  $("#ip-midi-status").textContent=error||`${networkMidi.outputs.size} portas ligadas · 16 canais em cada porta`;
  if(error)toast(error);
});
function allMidiInputs(){return [...(state.midiAccess?.inputs.values()||[]),...networkMidi.inputs.values()].filter(p=>p.state!=="disconnected");}
function allMidiOutputs(){return [...(state.midiAccess?.outputs.values()||[]),...networkMidi.outputs.values()].filter(p=>p.state!=="disconnected");}
let midiData = null;
let pitchContext = null;
let pitchNode = null;
let pitchSource = null;
let audioMixerMaster = null;
let audioMixerSplitter = null;
let audioMixerMerger = null;
let audioMixerChannels = [];
let audioMixerSongId = null;
let audioMixerChannelCount = 0;
let audioOutputChannelCount = 2;
let audioOutputDeviceId = localStorage.getItem("stageset-audio-output-device") ?? "";
let audioOutputDeviceName = "Saída do sistema";
let stemPlayers = [];
let queueDelayTimer = null;
let libraryClickTimer = null;
let pitchGraphPromise = null;
let pitchModuleLoaded = false;
let loopJumping = false;
let editingSongId = null;
let editingLyricsSongId = null;
let editingLyricsOutput = "main";
let lyricsEditorOutputOnly = false;
let lyricsEditorDrafts = {};
let lyricsAutoSaveTimer = null;
let editingCcSongId = null;
let settingStudioPassword = false;
let cdgDecoder = null;
let cdgAnimation = 0;
let cdgLastFrame = -1;
let timelineWaveform = null;
let timelineWaveformSongId = null;
let stemDeckJobId = null;
let stemDeckCancelRequested = false;
let timelineDrag = null;
let timelinePointerDragged = false;

function isMidiSong(song) {
  return Boolean(song && /\.(mid|midi|kar)$/i.test(song.fileName));
}

function loadPlayedSongIds() {
  try { return JSON.parse(localStorage.getItem("stageset-played-song-ids") || "[]").filter((id) => typeof id === "string"); }
  catch { return []; }
}

function requireStudio() {
  if (state.mode === "studio") return true;
  toast("Entra no modo Studio para programar o espetáculo.");
  return false;
}

function updateModeUi() {
  const studio = state.mode === "studio";
  document.body.classList.toggle("studio-mode", studio);
  document.body.classList.toggle("live-mode", !studio);
  $("#mode-label").textContent = studio ? "MODO STUDIO" : "MODO PALCO PROTEGIDO";
  $("#studio-mode-toggle").textContent = studio ? "Voltar a Live" : "Entrar no Studio";
  $("#studio-mode-toggle").setAttribute("aria-pressed", String(studio));
  if (!studio) {
    for (const selector of ["#song-editor-modal", "#lyrics-editor-modal", "#timeline-editor-modal", "#midi-mixer-modal", "#audio-mixer-modal", "#pedal-modal", "#song-cc-modal"]) {
      const modal = $(selector); if (modal) modal.hidden = true;
    }
    editingSongId = null; editingLyricsSongId = null; editingCcSongId = null; state.learningPedal = -1; state.learningSongMidiId = null; state.learningSetlistMidi = false; state.lyricShortcutLearning = false;
  }
}

async function deriveStudioPasswordHash(password, salt) {
  if (!crypto.subtle) throw new Error("A proteção por palavra-passe requer o StageSet aberto por localhost/HTTPS ou pela aplicação desktop.");
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 160000 }, material, 256);
  return [...new Uint8Array(bits)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function bytesToBase64(bytes) {
  return btoa(String.fromCharCode(...bytes));
}

function base64ToBytes(value) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function openStudioPassword() {
  settingStudioPassword = !localStorage.getItem("stageset-studio-password-hash");
  $("#studio-password-title").textContent = settingStudioPassword ? "Criar palavra-passe do Studio" : "Entrar no Studio";
  $("#studio-password-confirm-field").hidden = !settingStudioPassword;
  $("#studio-password-confirm").required = settingStudioPassword;
  $("#studio-password-confirm-field").style.display = settingStudioPassword ? "" : "none";
  $("#studio-password-submit").textContent = settingStudioPassword ? "Criar e entrar" : "Entrar no Studio";
  $("#studio-password-help").textContent = settingStudioPassword
    ? "Define uma palavra-passe com pelo menos 6 caracteres. O StageSet abre sempre em modo Live."
    : "Introduz a palavra-passe para desbloquear a programação deste espetáculo.";
  $("#studio-password-input").value = "";
  $("#studio-password-confirm").value = "";
  $("#studio-password-modal").hidden = false;
  $("#studio-password-input").focus();
}

async function submitStudioPassword(event) {
  event.preventDefault();
  const password = $("#studio-password-input").value;
  if (password.length < 6) return toast("A palavra-passe deve ter pelo menos 6 caracteres.");
  try {
    if (settingStudioPassword) {
      if (password !== $("#studio-password-confirm").value) return toast("As palavras-passe não coincidem.");
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const hash = await deriveStudioPasswordHash(password, salt);
      localStorage.setItem("stageset-studio-password-salt", bytesToBase64(salt));
      localStorage.setItem("stageset-studio-password-hash", hash);
    } else {
      const salt = base64ToBytes(localStorage.getItem("stageset-studio-password-salt") || "");
      const hash = await deriveStudioPasswordHash(password, salt);
      if (hash !== localStorage.getItem("stageset-studio-password-hash")) return toast("Palavra-passe incorreta.");
    }
    state.mode = "studio";
    updateModeUi();
    $("#studio-password-modal").hidden = true;
    toast("Modo Studio desbloqueado.");
  } catch (error) {
    toast(error.message || "Não foi possível verificar a palavra-passe.");
  }
}

async function saveStudioPasswordFromSettings() {
  const current = $("#studio-password-current").value, next = $("#studio-password-new").value, confirm = $("#studio-password-new-confirm").value;
  if (next.length < 6) return toast("A nova palavra-passe deve ter pelo menos 6 caracteres.");
  if (next !== confirm) return toast("A confirmação da palavra-passe não coincide.");
  const existingHash = localStorage.getItem("stageset-studio-password-hash");
  if (existingHash) {
    try {
      const salt = base64ToBytes(localStorage.getItem("stageset-studio-password-salt") || "");
      if (await deriveStudioPasswordHash(current, salt) !== existingHash) return toast("A palavra-passe atual está incorreta.");
    } catch (error) { return toast(error.message || "Não foi possível validar a palavra-passe atual."); }
  }
  try {
    const salt = crypto.getRandomValues(new Uint8Array(16)), hash = await deriveStudioPasswordHash(next, salt);
    localStorage.setItem("stageset-studio-password-salt", bytesToBase64(salt));
    localStorage.setItem("stageset-studio-password-hash", hash);
    $("#studio-password-current").value = $("#studio-password-new").value = $("#studio-password-new-confirm").value = "";
    toast("Palavra-passe do Studio atualizada.");
  } catch (error) { toast(error.message || "Não foi possível guardar a palavra-passe."); }
}

function setlistHasSong(id) {
  return state.setlist.includes(id);
}

function hasCdgLayer(song) {
  return Boolean(song?.cdgBlob && !isMidiSong(song));
}

function drawCdgFrame() {
  if (!cdgDecoder || !state.cdgView) return;
  const frame = Math.floor(currentPosition() * 30);
  if (frame !== cdgLastFrame) {
    cdgDecoder.draw($("#cdg-canvas").getContext("2d"), currentPosition());
    cdgLastFrame = frame;
  }
  if (isPlaying()) cdgAnimation = requestAnimationFrame(drawCdgFrame);
}

function refreshCdgFrame() {
  if (cdgAnimation) cancelAnimationFrame(cdgAnimation);
  cdgAnimation = 0;
  if (state.cdgView && cdgDecoder) drawCdgFrame();
}

function setCdgView(enabled) {
  state.cdgView = Boolean(enabled && hasCdgLayer(selectedSong()));
  $("#lyrics-content").hidden = state.cdgView;
  $("#cdg-canvas").hidden = !state.cdgView;
  $("#cdg-view-button").classList.toggle("active-tool", state.cdgView);
  $("#cdg-view-button").querySelector("span:last-child").textContent = state.cdgView ? "Ver letras" : "Ver karaoke";
  if (state.cdgView) $("#lyric-mode").textContent = "KARAOKE · CD+G";
  else renderLyrics();
  cdgLastFrame = -1;
  refreshCdgFrame();
}

function hasMidiLayer(song) {
  return Boolean(song?.midiBlob && !isMidiSong(song));
}

function normalizeMidiMix(mix) {
  return Array.from({ length: 16 }, (_, channel) => {
    const setting = mix?.[channel] ?? {};
    return {
      volume: Number.isFinite(setting.volume) ? Math.max(0, Math.min(1, setting.volume)) : 1,
      muted: Boolean(setting.muted),
      solo: Boolean(setting.solo),
      program: Number.isInteger(setting.program) && setting.program >= 0 && setting.program <= 127 ? setting.program : null,
      pan: Number.isFinite(setting.pan) ? Math.max(-1, Math.min(1, setting.pan)) : 0,
    };
  });
}

function currentDuration() {
  const song = selectedSong();
  if (isDocumentSong(song)) return 0;
  if (isMidiSong(song)) return midiData?.duration ?? 0;
  const audioDuration = Number.isFinite(audio.duration) ? audio.duration : 0;
  const stemDuration = stemPlayers.reduce((duration, player) => Math.max(duration, Number.isFinite(player.audio.duration) ? player.audio.duration : 0), 0);
  return Math.max(audioDuration, stemDuration, hasMidiLayer(song) ? midiData?.duration ?? 0 : 0);
}

function currentPosition() {
  const song = selectedSong();
  if (isDocumentSong(song)) return 0;
  if (isMidiSong(song)) return midiPlayer.currentTime;
  if (audio.ended) {
    const runningStem = stemPlayers.find((player) => !player.audio.ended && !player.audio.paused);
    if (runningStem) return runningStem.audio.currentTime;
    if (hasMidiLayer(song)) return midiPlayer.currentTime;
  }
  return Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
}

function seekPlaybackTo(time) {
  const duration = currentDuration();
  const target = Math.max(0, Math.min(duration || Number(time) || 0, Number(time) || 0));
  if (isMidiSong(selectedSong())) void midiPlayer.seek(target);
  else {
    try { audio.currentTime = target; } catch {}
    seekStemPlayers(target);
    if (hasMidiLayer(selectedSong()) && midiData) void midiPlayer.seek(target);
  }
  updatePlayback();
}

function isPlaying() {
  const song = selectedSong();
  if (isDocumentSong(song)) return false;
  return isMidiSong(song) ? midiPlayer.playing : !audio.paused || stemPlayers.some((player) => !player.audio.paused && !player.audio.ended) || (hasMidiLayer(song) && midiPlayer.playing);
}

function disposeStemPlayers() {
  for (const player of stemPlayers) {
    player.audio.pause();
    try { player.source.disconnect(); player.gain.disconnect(); player.panner.disconnect(); player.outputSplitter.disconnect(); } catch {}
    if (player.url) URL.revokeObjectURL(player.url);
  }
  stemPlayers = [];
}

function applyStemMix(song = selectedSong()) {
  if (!song) return;
  const settings = song.audioStems ?? [];
  const hasSolo = settings.some((stem) => stem.solo);
  const hasChannelSolo = (song.audioMix ?? []).some((channel) => channel.solo);
  stemPlayers.forEach((player) => {
    const stem = settings.find((item) => item.id === player.id);
    if (!stem) return;
    const audible = !stem.muted && ((!hasSolo && !hasChannelSolo) || stem.solo);
    player.gain.gain.setTargetAtTime(audible ? Math.max(0, Math.min(1, stem.volume ?? 1)) : 0, pitchContext.currentTime, 0.015);
    player.panner.pan.setTargetAtTime(Math.max(-1, Math.min(1, stem.pan ?? 0)), pitchContext.currentTime, 0.015);
    routeStemOutput(player, stem.outputPair ?? 0);
  });
  updateAudioMixerRows(song);
}

function routeStemOutput(player, outputPair = 0) {
  if (!player.outputSplitter || !audioMixerMerger) return;
  const pairCount = Math.max(1, Math.floor(audioOutputChannelCount / 2));
  const pair = Math.max(0, Math.min(pairCount - 1, Number(outputPair) || 0));
  player.outputSplitter.disconnect();
  player.outputSplitter.connect(audioMixerMerger, 0, pair * 2);
  player.outputSplitter.connect(audioMixerMerger, 1, pair * 2 + 1);
}

function refreshAudioOutputStatus() {
  const status = $("#audio-output-status");
  if (!status) return;
  const pairCount = Math.max(1, Math.floor(audioOutputChannelCount / 2));
  status.textContent = `${audioOutputDeviceName} · ${audioOutputChannelCount} canais · ${pairCount} ${pairCount === 1 ? "par" : "pares"} estéreo`;
}

function hasDeviceAccessOrigin() {
  const localHttp = location.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(location.hostname);
  return window.isSecureContext && (location.protocol === "https:" || localHttp);
}

async function refreshAudioInputDevices({ requestAccess = false, notify = false } = {}) {
  const audioSelect = $("#audio-input-device");
  const videoSelect = $("#video-input-device");
  const status = $("#device-access-status");
  const media = navigator.mediaDevices;
  if (!media?.enumerateDevices) {
    const message = hasDeviceAccessOrigin()
      ? "Este browser não disponibiliza a deteção de áudio/vídeo."
      : "Para detetar dispositivos, abre o StageSet através de localhost ou HTTPS.";
    if (status) status.textContent = message;
    if (notify) toast(message);
    return false;
  }

  const permissionResults = [];
  if (requestAccess && media.getUserMedia) {
    for (const [label, constraints] of [["microfone", { audio: true }], ["câmara", { video: true }]]) {
      try {
        const stream = await media.getUserMedia(constraints);
        stream.getTracks().forEach((track) => track.stop());
        permissionResults.push(`${label}: autorizado`);
      } catch (error) {
        permissionResults.push(`${label}: ${error?.name === "NotAllowedError" ? "permissão recusada" : "indisponível"}`);
      }
    }
  }

  try {
    const devices = await media.enumerateDevices();
    const inputs = devices.filter((device) => device.kind === "audioinput");
    const cameras = devices.filter((device) => device.kind === "videoinput");
    if (audioSelect) {
      audioSelect.replaceChildren(new Option(inputs.length ? "Seleciona uma entrada" : "Nenhuma entrada disponível", ""));
      inputs.forEach((device, index) => audioSelect.add(new Option(device.label || `Entrada áudio ${index + 1}`, device.deviceId)));
      audioSelect.value = localStorage.getItem("stageset-audio-input-device") || "";
    }
    if (videoSelect) {
      videoSelect.replaceChildren(new Option(cameras.length ? "Seleciona uma câmara" : "Nenhuma câmara disponível", ""));
      cameras.forEach((device, index) => videoSelect.add(new Option(device.label || `Câmara ${index + 1}`, device.deviceId)));
      videoSelect.value = localStorage.getItem("stageset-video-input-device") || "";
    }
    const midiSummary = state.midiAccess
      ? `${state.midiAccess.inputs.size} entrada(s) / ${state.midiAccess.outputs.size} saída(s) MIDI`
      : state.midiPermissionStatus === "denied" ? "MIDI sem autorização"
        : state.midiPermissionStatus === "unavailable" ? "MIDI indisponível neste browser/endereço" : "MIDI por autorizar";
    const summary = `${inputs.length} entrada(s) áudio · ${cameras.length} entrada(s) vídeo · ${midiSummary}`;
    if (status) status.textContent = permissionResults.length ? `${summary} · ${permissionResults.join(" · ")}` : summary;
    if (notify) toast(`${inputs.length} entradas áudio e ${cameras.length} câmaras encontradas.`);
    return true;
  } catch {
    if (status) status.textContent = "Não foi possível consultar as interfaces de áudio e vídeo.";
    if (notify) toast("Não foi possível consultar as interfaces de áudio e vídeo.");
    return false;
  }
}

function addOutputPairOptions(select, selectedPair = 0) {
  const pairCount = Math.max(1, Math.floor(audioOutputChannelCount / 2));
  select.replaceChildren(...Array.from({ length: pairCount }, (_, pair) => {
    const option = document.createElement("option");
    option.value = String(pair);
    option.textContent = `Saídas ${pair * 2 + 1}/${pair * 2 + 2}`;
    return option;
  }));
  select.value = String(Math.max(0, Math.min(pairCount - 1, Number(selectedPair) || 0)));
}

async function chooseAudioOutputDevice() {
  const mediaDevices = navigator.mediaDevices;
  if (!mediaDevices?.selectAudioOutput || !pitchContext?.setSinkId) {
    toast("Este browser não permite escolher uma interface de saída para o mixer. Abre o StageSet num browser compatível, através de localhost ou HTTPS.");
    return;
  }
  try {
    const device = await mediaDevices.selectAudioOutput();
    await applyAudioOutputDevice(device.deviceId, device.label);
    await refreshAudioOutputDevices();
    if (audioOutputChannelCount <= 2) toast("O browser só expõe duas saídas para esta interface.");
  } catch (error) {
    if (error?.name !== "NotAllowedError") toast(error.message || "Não foi possível procurar as interfaces de áudio.");
  }
}

async function applyAudioOutputDevice(deviceId, label = "") {
  if (!pitchContext?.setSinkId) throw new Error("Este browser não suporta seleção de saída Web Audio.");
  await pitchContext.setSinkId(deviceId);
  audioOutputDeviceId = deviceId;
  audioOutputDeviceName = label || (deviceId ? "Interface de áudio" : "Saída do sistema");
  if (deviceId) localStorage.setItem("stageset-audio-output-device", deviceId);
  else localStorage.removeItem("stageset-audio-output-device");
  const maximum = Number(pitchContext.destination.maxChannelCount) || 2;
  audioOutputChannelCount = Math.max(2, Math.min(32, maximum - (maximum % 2)));
  try {
    pitchContext.destination.channelCountMode = "explicit";
    pitchContext.destination.channelInterpretation = "discrete";
    pitchContext.destination.channelCount = audioOutputChannelCount;
  } catch { audioOutputChannelCount = 2; }
  refreshAudioOutputStatus();
  const song = selectedSong();
  if (song && !isMidiSong(song) && !isDocumentSong(song)) {
    await ensureAudioMixerGraph(song, true);
    if (pitchNode) await rebuildPitchNode();
    renderAudioMixer();
  }
}

async function refreshAudioOutputDevices() {
  const select = $("#audio-output-device");
  const mediaDevices = navigator.mediaDevices;
  if (!select || !mediaDevices?.enumerateDevices) return;
  try {
    const devices = (await mediaDevices.enumerateDevices()).filter((device) => device.kind === "audiooutput");
    const options = [new Option("Saída padrão do sistema", "")];
    for (const device of devices) {
      if (!device.deviceId || device.deviceId === "default") continue;
      options.push(new Option(device.label || ("Interface de áudio " + options.length), device.deviceId));
    }
    if (audioOutputDeviceId && !options.some((option) => option.value === audioOutputDeviceId)) {
      options.push(new Option(audioOutputDeviceName || "Interface selecionada", audioOutputDeviceId));
    }
    select.replaceChildren(...options);
    select.value = audioOutputDeviceId;
  } catch {
    select.replaceChildren(new Option("Dispositivos indisponíveis", ""));
  }
}

function updateAudioMixerRows(song) {
  if (!song || selectedSong()?.id !== song.id) return;
  const rows = $("#audio-mixer-list").querySelectorAll(".audio-channel-row");
  const channelRows = [...rows].filter((row) => !row.dataset.stem);
  const hasChannelSolo = (song.audioMix ?? []).some((item) => item.solo);
  const hasStemSolo = (song.audioStems ?? []).some((item) => item.solo);
  channelRows.forEach((row, index) => {
    const channel = song.audioMix?.[index];
    if (!channel) return;
    row.classList.toggle("muted", channel.muted || ((hasChannelSolo || hasStemSolo) && !channel.solo));
    const solo = row.querySelector(".audio-channel-solo");
    const mute = row.querySelector(".audio-channel-mute");
    if (solo) { solo.textContent = channel.solo ? "Desolo" : "Solo"; solo.setAttribute("aria-pressed", String(channel.solo)); solo.setAttribute("aria-label", channel.solo ? "Desativar solo" : "Ouvir apenas este canal"); }
    if (mute) { mute.textContent = channel.muted ? "Ativar" : "Silenciar"; mute.setAttribute("aria-pressed", String(channel.muted)); }
  });
  for (const row of rows) {
    if (!row.dataset.stem) continue;
    const stem = song.audioStems?.find((item) => item.id === row.dataset.stem);
    if (stem) {
      row.classList.toggle("muted", stem.muted || ((hasChannelSolo || hasStemSolo) && !stem.solo));
      const solo = row.querySelector(".midi-channel-solo");
      const mute = row.querySelector(".midi-channel-mute");
      if (solo) { solo.textContent = stem.solo ? "Desolo" : "Solo"; solo.setAttribute("aria-pressed", String(stem.solo)); solo.setAttribute("aria-label", stem.solo ? "Desativar solo" : `Ouvir apenas ${stem.name}`); }
      if (mute) { mute.textContent = stem.muted ? "Ativar" : "Silenciar"; mute.setAttribute("aria-pressed", String(stem.muted)); }
    }
  }
}

async function connectAudioStems(song) {
  disposeStemPlayers();
  if (!song?.audioStems?.length || isMidiSong(song) || isDocumentSong(song)) return;
  await ensureAudioMixerGraph(song, true);
  for (const stem of song.audioStems.slice(0, 31)) {
    if (!(stem.blob instanceof Blob)) continue;
    const element = new Audio();
    element.preload = "auto";
    element.playbackRate = song.tempo ?? 1;
    const playableBlob = stem.audioFormat === "mogg" && Number.isInteger(stem.moggOffset) ? stem.blob.slice(stem.moggOffset, stem.blob.size, "audio/ogg") : stem.blob;
    const url = URL.createObjectURL(playableBlob);
    element.src = url;
    element.volume = audio.volume;
    const source = pitchContext.createMediaElementSource(element);
    const gain = pitchContext.createGain();
    const panner = pitchContext.createStereoPanner();
    const outputSplitter = pitchContext.createChannelSplitter(2);
    source.connect(gain);
    gain.connect(panner);
    panner.connect(outputSplitter);
    const player = { id: stem.id, audio: element, source, gain, panner, outputSplitter, outputPair: stem.outputPair ?? 0, url };
    routeStemOutput(player, player.outputPair);
    stemPlayers.push(player);
    element.addEventListener("timeupdate", updatePlayback);
    element.addEventListener("loadedmetadata", () => {
      stem.duration = element.duration;
      song.duration = Math.max(hasMidiLayer(song) ? midiData?.duration || 0 : 0, Number.isFinite(audio.duration) ? audio.duration : 0, ...song.audioStems.map((item) => Number.isFinite(item.duration) ? item.duration : 0));
      dbPut(song).catch(() => {});
      if (selectedSong()?.id === song.id) syncTrackDetails();
      renderLibrary();
    }, { once: true });
    element.addEventListener("ended", () => {
      if (audio.ended && stemPlayers.every((item) => item.audio.ended || item.audio.paused) && (!hasMidiLayer(selectedSong()) || !midiPlayer.playing)) advanceAfterTrack();
      else updatePlayback();
    });
    element.addEventListener("loadedmetadata", updatePlayback, { once: true });
  }
  applyStemMix(song);
}

function syncStemPosition(force = false) {
  if (!Number.isFinite(audio.currentTime)) return;
  for (const player of stemPlayers) {
    player.audio.volume = audio.volume;
    if (player.audio.ended && !force) continue;
    if (!Number.isFinite(player.audio.duration)) continue;
    const target = Math.min(audio.currentTime, Math.max(0, player.audio.duration - 0.02));
    if (force || Math.abs(player.audio.currentTime - target) > 0.35) {
      try { player.audio.currentTime = target; } catch {}
    }
  }
}

function startStemPlayers() {
  const song = selectedSong();
  if (!song || !stemPlayers.length) return;
  syncStemPosition(true);
  for (const player of stemPlayers) {
    player.audio.playbackRate = song.tempo ?? 1;
    player.audio.play().catch(() => toast(`Não foi possível reproduzir ${song.audioStems?.find((stem) => stem.id === player.id)?.name ?? "uma pista"}.`));
  }
}

function pauseStemPlayers() {
  stemPlayers.forEach((player) => player.audio.pause());
}

function seekStemPlayers(position) {
  for (const player of stemPlayers) {
    if (!Number.isFinite(player.audio.duration)) continue;
    try { player.audio.currentTime = Math.max(0, Math.min(position, Math.max(0, player.audio.duration - 0.02))); } catch {}
  }
}

async function ensurePitchGraph() {
  if (pitchNode) return pitchNode;
  if (pitchGraphPromise) return pitchGraphPromise;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass || !window.AudioWorkletNode) throw new Error("Este browser não suporta transposição de áudio em tempo real.");
  pitchContext ??= new AudioContextClass();
  pitchGraphPromise = (async () => {
    try {
      const song = selectedSong();
      await ensureAudioMixerGraph(song, true);
      if (!pitchModuleLoaded) {
        await pitchContext.audioWorklet.addModule(new URL("./pitch-worklet.js", import.meta.url));
        pitchModuleLoaded = true;
      }
      pitchNode = createPitchNode();
      audioMixerMaster.disconnect();
      audioMixerMaster.connect(pitchNode);
      pitchNode.connect(pitchContext.destination);
      return pitchNode;
    } catch (error) {
      pitchNode?.disconnect();
      pitchNode = null;
      if (audioMixerMaster) {
        try { audioMixerMaster.connect(pitchContext.destination); } catch {}
      }
      pitchModuleLoaded = false;
      pitchGraphPromise = null;
      throw error;
    }
  })();
  return pitchGraphPromise;
}

function createPitchNode() {
  const channelCount = audioOutputChannelCount;
  const node = new AudioWorkletNode(pitchContext, "stageset-pitch-shifter", {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [channelCount],
    channelCount,
    channelCountMode: "explicit",
    channelInterpretation: "discrete",
    processorOptions: { channelCount },
  });
  return node;
}

async function rebuildPitchNode() {
  if (!pitchNode || !pitchModuleLoaded) return;
  const oldNode = pitchNode;
  const previousShift = oldNode.parameters.get("semitones")?.value ?? 0;
  audioMixerMaster.disconnect();
  oldNode.disconnect();
  pitchNode = createPitchNode();
  pitchNode.parameters.get("semitones").setValueAtTime(previousShift, pitchContext.currentTime);
  audioMixerMaster.connect(pitchNode);
  pitchNode.connect(pitchContext.destination);
  oldNode.port.postMessage({ type: "dispose" });
}

function normalizeAudioMix(mix, channelCount, centerByDefault = false) {
  return Array.from({ length: channelCount }, (_, channel) => {
    const setting = mix?.[channel] ?? {};
    return {
      volume: Number.isFinite(setting.volume) ? Math.max(0, Math.min(1, setting.volume)) : 1,
      muted: Boolean(setting.muted),
      solo: Boolean(setting.solo),
      pan: Number.isFinite(setting.pan) ? Math.max(-1, Math.min(1, setting.pan)) : centerByDefault || channelCount === 1 ? 0 : channel === 0 ? -1 : channel === 1 ? 1 : 0,
      outputPair: Math.max(0, Math.min(Math.floor(audioOutputChannelCount / 2) - 1, Number.isInteger(setting.outputPair) ? setting.outputPair : 0)),
    };
  });
}

function audioMixerControlCount(song, channelCount) {
  return channelCount;
}

function normalizeSongAudioMix(song, channelCount) {
  const oldMoggControlCount = Math.ceil(channelCount / 2);
  if (song.audioFormat === "mogg" && Array.isArray(song.audioMix) && song.audioMix.length === oldMoggControlCount && oldMoggControlCount !== channelCount) {
    song.audioMix = song.audioMix.flatMap((setting) => [
      { ...setting, pan: 0 },
      { ...setting, pan: 0 },
    ]).slice(0, channelCount);
  }
  const previous = Array.isArray(song.audioMix) ? song.audioMix : [];
  const normalized = normalizeAudioMix(previous, channelCount, song.audioFormat === "mogg");
  song.audioMix = normalized.map((setting, index) => Object.assign(previous[index] ?? {}, setting));
  return song.audioMix;
}

function applyAudioMix(song) {
  if (!song || song.id !== audioMixerSongId) return;
  const channelCount = audioMixerChannels.length;
  const settings = normalizeSongAudioMix(song, channelCount);
  const hasSolo = settings.some((channel) => channel.solo);
  const hasStemSolo = (song.audioStems ?? []).some((stem) => stem.solo);
  audioMixerChannels.forEach((nodes, channelIndex) => {
    const channel = settings[channelIndex];
    if (!channel) return;
    const audible = !channel.muted && ((!hasSolo && !hasStemSolo) || channel.solo);
    nodes.gain.gain.setTargetAtTime(audible ? channel.volume : 0, pitchContext.currentTime, 0.015);
    const panAngle = ((channel.pan + 1) * Math.PI) / 4;
    nodes.leftPan.gain.setTargetAtTime(Math.cos(panAngle), pitchContext.currentTime, 0.015);
    nodes.rightPan.gain.setTargetAtTime(Math.sin(panAngle), pitchContext.currentTime, 0.015);
  });
  applyStemMix(song);
  updateAudioMixerRows(song);
}

async function ensureAudioMixerGraph(song = selectedSong(), force = false) {
  if (!song || isMidiSong(song) || isDocumentSong(song)) throw new Error("Seleciona uma faixa de áudio para abrir o mixer.");
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass || !AudioContextClass.prototype.createChannelSplitter || !AudioContextClass.prototype.createChannelMerger) {
    throw new Error("Este browser não suporta mistura de canais de áudio.");
  }
  pitchContext ??= new AudioContextClass();
  if (audioOutputDeviceId && pitchContext.setSinkId && pitchContext.sinkId !== audioOutputDeviceId) {
    try { await pitchContext.setSinkId(audioOutputDeviceId); }
    catch { audioOutputDeviceId = ""; localStorage.removeItem("stageset-audio-output-device"); }
  }
  if (audioOutputDeviceId && navigator.mediaDevices?.enumerateDevices) {
    try {
      const selectedDevice = (await navigator.mediaDevices.enumerateDevices()).find((device) => device.kind === "audiooutput" && device.deviceId === audioOutputDeviceId);
      if (selectedDevice?.label) audioOutputDeviceName = selectedDevice.label;
    } catch {}
  }
  const maximumOutputChannels = Number(pitchContext.destination.maxChannelCount) || 2;
  audioOutputChannelCount = Math.max(2, Math.min(32, maximumOutputChannels - (maximumOutputChannels % 2)));
  try {
    pitchContext.destination.channelCountMode = "explicit";
    pitchContext.destination.channelInterpretation = "discrete";
    pitchContext.destination.channelCount = audioOutputChannelCount;
  } catch { audioOutputChannelCount = 2; }
  refreshAudioOutputStatus();
  if (!pitchSource) {
    pitchSource = pitchContext.createMediaElementSource(audio);
  }
  const channelCount = Math.max(1, Math.min(32, Number.isInteger(song.audioChannels) ? song.audioChannels : 2));
  if (!audioMixerMaster) {
    audioMixerMaster = pitchContext.createGain();
    audioMixerMaster.channelCount = audioOutputChannelCount;
    audioMixerMaster.channelCountMode = "explicit";
    audioMixerMaster.channelInterpretation = "discrete";
  }
  if (force || audioMixerSongId !== song.id || audioMixerChannelCount !== channelCount) {
    pitchSource.disconnect();
    audioMixerSplitter?.disconnect();
    audioMixerMerger?.disconnect();
    audioMixerChannels.forEach(({ gain, leftPan, rightPan }) => { gain.disconnect(); leftPan.disconnect(); rightPan.disconnect(); });
    audioMixerMaster.disconnect();
    audioMixerChannels = [];
    audioMixerSplitter = pitchContext.createChannelSplitter(channelCount);
    audioMixerMerger = pitchContext.createChannelMerger(audioOutputChannelCount);
    audioMixerMerger.connect(audioMixerMaster);
    audioMixerMaster.channelCount = audioOutputChannelCount;
    pitchSource.connect(audioMixerSplitter);
    for (let channel = 0; channel < channelCount; channel++) {
      const gain = pitchContext.createGain();
      const leftPan = pitchContext.createGain();
      const rightPan = pitchContext.createGain();
      audioMixerSplitter.connect(gain, channel, 0);
      gain.connect(leftPan);
      gain.connect(rightPan);
      const setting = song.audioMix?.[channel] ?? {};
      const pair = Math.max(0, Math.min(Math.floor(audioOutputChannelCount / 2) - 1, Number(setting.outputPair) || 0));
      leftPan.connect(audioMixerMerger, 0, pair * 2);
      rightPan.connect(audioMixerMerger, 0, pair * 2 + 1);
      audioMixerChannels.push({ gain, leftPan, rightPan, outputPair: pair });
    }
    audioMixerSongId = song.id;
    audioMixerChannelCount = channelCount;
    audioMixerMaster.connect(pitchNode ?? pitchContext.destination);
    applyAudioMix(song);
  }
  if (pitchContext.state === "suspended" && !audio.paused) pitchContext.resume().catch(() => {});
  return audioMixerChannels.length;
}

async function readAudioChannelMetadata(file) {
  if (/\.mogg$/i.test(file.name)) {
    if (file.size < 64) throw new Error(`${file.name}: cabeçalho MOGG incompleto.`);
    const header = await file.slice(0, 8).arrayBuffer();
    const headerView = new DataView(header);
    const version = headerView.getUint32(0, true);
    const oggOffset = headerView.getUint32(4, true);
    if (version !== 10) throw new Error(`${file.name}: variante MOGG cifrada ou não suportada; só é aceite MOGG v10 sem cifragem.`);
    if (oggOffset < 8 || oggOffset + 27 > file.size) {
      throw new Error(`${file.name}: deslocamento do fluxo Ogg inválido.`);
    }
    const page = await file.slice(oggOffset, Math.min(file.size, oggOffset + 65536)).arrayBuffer();
    const view = new DataView(page);
    if (String.fromCharCode(...new Uint8Array(page, 0, 4)) !== "OggS") throw new Error(`${file.name}: não foi encontrado um fluxo Ogg válido.`);
    const segmentCount = view.getUint8(26);
    const segmentTable = 27;
    const packetStart = segmentTable + segmentCount;
    if (!segmentCount || packetStart >= view.byteLength) throw new Error(`${file.name}: cabeçalho Vorbis incompleto.`);
    let packetSize = 0;
    let packetComplete = false;
    for (let segment = 0; segment < segmentCount; segment++) {
      const size = view.getUint8(segmentTable + segment);
      packetSize += size;
      if (size < 255) { packetComplete = true; break; }
    }
    if (!packetComplete || packetSize < 16 || packetStart + 16 > view.byteLength) throw new Error(`${file.name}: cabeçalho Vorbis inválido.`);
    const packet = new Uint8Array(page, packetStart, Math.min(packetSize, 16));
    if (packet[0] !== 1 || String.fromCharCode(...packet.slice(1, 7)) !== "vorbis") {
      throw new Error(`${file.name}: o MOGG não contém Vorbis reconhecido.`);
    }
    const channels = packet[11];
    if (!channels || channels > 32) throw new Error(`${file.name}: número de canais MOGG não suportado.`);
    return { channels, moggOffset: oggOffset, format: "mogg" };
  }
  if (!/\.wav$/i.test(file.name) || file.size < 44) return null;
  try {
    const bytes = await file.slice(0, Math.min(file.size, 1024 * 1024)).arrayBuffer();
    const view = new DataView(bytes);
    const ascii = (offset, length) => String.fromCharCode(...new Uint8Array(bytes, offset, length));
    if (ascii(0, 4) !== "RIFF" || ascii(8, 4) !== "WAVE") return null;
    for (let offset = 12; offset + 8 <= view.byteLength;) {
      const chunkId = ascii(offset, 4);
      const chunkSize = view.getUint32(offset + 4, true);
      const dataOffset = offset + 8;
      if (chunkId === "fmt " && chunkSize >= 16 && dataOffset + 16 <= view.byteLength) {
        const channels = view.getUint16(dataOffset + 2, true);
        return channels > 0 && channels <= 32 ? { channels, format: "wav" } : null;
      }
      const nextOffset = dataOffset + chunkSize + (chunkSize & 1);
      if (!Number.isSafeInteger(nextOffset) || nextOffset <= offset || nextOffset > view.byteLength) break;
      offset = nextOffset;
    }
  } catch {}
  return null;
}

function getPlayableAudioBlob(song) {
  return song?.audioFormat === "mogg" && Number.isInteger(song.moggOffset)
    ? song.audioBlob.slice(song.moggOffset, song.audioBlob.size, "audio/ogg")
    : song.audioBlob;
}

function persistAudioMix(song) {
  if (!song || song.id !== audioMixerSongId) return;
  song.audioMix = normalizeSongAudioMix(song, audioMixerControlCount(song, audioMixerChannels.length));
  dbPut(song).catch(() => toast("Não foi possível guardar a mistura de áudio."));
}

function persistAudioStemMix(song) {
  applyStemMix(song);
  dbPut(song).catch(() => toast("Não foi possível guardar a mistura das pistas."));
}

function renderAudioMixer() {
  const song = selectedSong();
  if (!song || isMidiSong(song) || isDocumentSong(song)) return toast("Escolhe primeiro um ficheiro de áudio.");
  refreshAudioOutputDevices();
  const channelCount = Math.max(1, Math.min(32, Number.isInteger(song.audioChannels) ? song.audioChannels : 2));
  const controlCount = audioMixerControlCount(song, channelCount);
  const container = $("#audio-mixer-list");
  container.innerHTML = "";
  ensureAudioMixerGraph(song, true).then(() => {
    if (selectedSong()?.id !== song.id || $("#audio-mixer-modal").hidden) return;
    const settings = song.audioMix;
    $("#audio-mixer-description").textContent = song.audioFormat === "mogg"
      ? `MOGG v10 sem cifragem · ${channelCount} canais mono independentes. Volume, pan, Solo e silêncio por canal.`
      : channelCount > 2
        ? `Este áudio contém ${channelCount} canais mono separados. Ajusta cada canal durante a reprodução.`
        : channelCount === 1 ? "Controla o volume e a panorâmica deste canal mono." : "Controla separadamente os canais mono esquerdo e direito deste ficheiro de áudio.";
    for (let channel = 0; channel < controlCount; channel++) {
      const setting = settings[channel];
      const channelNumber = String(channel + 1).padStart(2, "0");
      const label = song.audioFormat === "mogg" ? `Canal mono ${channelNumber}` : channelCount === 2 ? (channel === 0 ? "Esquerda · mono" : "Direita · mono") : `Canal mono ${channelNumber}`;
      const detail = `Saída mono · canal ${channel + 1}`;
      const row = document.createElement("div");
      row.className = "audio-channel-row";
      row.dataset.learnScope="audio-channel-"+channel;
      row.innerHTML = `<div class="audio-channel-label"><strong></strong><span>Canal ${channel + 1}</span></div><label class="midi-mix-control"><span>Volume</span><output></output><input class="audio-channel-volume" type="range" min="0" max="1" step="0.01" /></label><label class="midi-mix-control"><span>Pan</span><output></output><input class="audio-channel-pan" type="range" min="-1" max="1" step="0.01" /></label><label class="midi-mix-control audio-output-pair-control"><span>Saída</span><select class="audio-channel-output"></select></label><button class="midi-channel-solo audio-channel-solo" type="button"></button><button class="midi-channel-mute audio-channel-mute" type="button"></button>`;
      const channelName = document.createElement("input"); channelName.value = song.audioChannelNames?.[channel] || label; channelName.maxLength = 80; channelName.setAttribute("aria-label", `Nome do canal ${channel + 1}`);
      channelName.addEventListener("change", () => { song.audioChannelNames ??= {}; song.audioChannelNames[channel] = channelName.value.trim() || label; channelName.value = song.audioChannelNames[channel]; void dbPut(song).catch(() => toast("Não foi possível guardar o nome do canal.")); });
      row.querySelector(".audio-channel-label strong").replaceWith(document.createTextNode(`${channel + 1} · `), channelName);
      row.querySelector(".audio-channel-label span").textContent = detail;
      const volume = row.querySelector(".audio-channel-volume");
      const volumeOutput = volume.parentElement.querySelector("output");
      volume.value = String(setting.volume);
      volume.setAttribute("aria-label", `Volume do canal mono ${channel + 1}`);
      volumeOutput.value = `${Math.round(setting.volume * 100)}%`;
      volume.addEventListener("input", () => {
        setting.volume = Number(volume.value);
        volumeOutput.value = `${Math.round(setting.volume * 100)}%`;
        applyAudioMix(song);
      });
      volume.addEventListener("change", () => persistAudioMix(song));
      const pan = row.querySelector(".audio-channel-pan");
      const panOutput = pan.parentElement.querySelector("output");
      const formatPan = (value) => value < -0.01 ? `E ${Math.round(-value * 100)}` : value > 0.01 ? `D ${Math.round(value * 100)}` : "C";
      pan.value = String(setting.pan);
      pan.setAttribute("aria-label", `Panorâmica do canal mono ${channel + 1}`);
      panOutput.value = formatPan(setting.pan);
      pan.addEventListener("input", () => {
        setting.pan = Number(pan.value);
        panOutput.value = formatPan(setting.pan);
        applyAudioMix(song);
      });
      pan.addEventListener("change", () => persistAudioMix(song));
      const output = row.querySelector(".audio-channel-output");
      addOutputPairOptions(output, setting.outputPair);
      output.setAttribute("aria-label", `Saída física do canal mono ${channel + 1}`);
      output.addEventListener("change", () => {
        setting.outputPair = Number(output.value);
        const nodes = audioMixerChannels[channel];
        nodes?.leftPan.disconnect();
        nodes?.rightPan.disconnect();
        if (nodes && audioMixerMerger) {
          nodes.leftPan.connect(audioMixerMerger, 0, setting.outputPair * 2);
          nodes.rightPan.connect(audioMixerMerger, 0, setting.outputPair * 2 + 1);
          nodes.outputPair = setting.outputPair;
        }
        persistAudioMix(song);
      });
      const mute = row.querySelector(".audio-channel-mute");
      const solo = row.querySelector(".audio-channel-solo");
      const updateButtons = () => {
        const hasSolo = song.audioMix.some((item) => item.solo) || (song.audioStems ?? []).some((item) => item.solo);
        const audible = !setting.muted && (!hasSolo || setting.solo);
        row.classList.toggle("muted", !audible);
        mute.textContent = setting.muted ? "Ativar" : "Silenciar";
        mute.setAttribute("aria-label", `${setting.muted ? "Ativar" : "Silenciar"} canal mono ${channel + 1}`);
        mute.setAttribute("aria-pressed", String(setting.muted));
        solo.textContent = setting.solo ? "Desolo" : "Solo";
        solo.setAttribute("aria-label", `${setting.solo ? "Desativar solo" : "Ouvir apenas"} canal mono ${channel + 1}`);
        solo.setAttribute("aria-pressed", String(setting.solo));
      };
      mute.addEventListener("click", () => {
        setting.muted = !setting.muted;
        applyAudioMix(song);
        updateButtons();
        persistAudioMix(song);
      });
      solo.addEventListener("click", () => {
        setting.solo = !setting.solo;
        applyAudioMix(song);
        updateButtons();
        persistAudioMix(song);
      });
      updateButtons();
      container.append(row);
    }
    for (const [stemIndex, stem] of (song.audioStems ?? []).entries()) {
      const row = document.createElement("div");
      row.className = "audio-channel-row";
      row.innerHTML = `<div class="audio-channel-label"><strong></strong><span>Pista importada</span><button class="stem-remove" type="button" title="Remover pista" aria-label="Remover pista">×</button></div><label class="midi-mix-control"><span>Volume</span><output></output><input class="audio-channel-volume" type="range" min="0" max="1" step="0.01" /></label><label class="midi-mix-control"><span>Pan</span><output></output><input class="audio-channel-pan" type="range" min="-1" max="1" step="0.01" /></label><label class="midi-mix-control audio-output-pair-control"><span>Saída</span><select class="audio-channel-output"></select></label><button class="midi-channel-solo" type="button"></button><button class="midi-channel-mute" type="button"></button>`;
      const stemName = document.createElement("input"); stemName.value = stem.name; stemName.maxLength = 80; stemName.setAttribute("aria-label", `Nome da pista ${controlCount + stemIndex + 1}`);
      stemName.addEventListener("change", () => { stem.name = stemName.value.trim() || stem.fileName; stemName.value = stem.name; void dbPut(song).catch(() => toast("Não foi possível guardar o nome da pista.")); });
      row.querySelector(".audio-channel-label strong").replaceWith(document.createTextNode(`${controlCount + stemIndex + 1} · `), stemName);
      row.querySelector(".audio-channel-label span").textContent = stem.fileName;
      const volume = row.querySelector(".audio-channel-volume");
      volume.value = String(stem.volume ?? 1);
      volume.parentElement.querySelector("output").value = `${Math.round((stem.volume ?? 1) * 100)}%`;
      volume.addEventListener("input", () => { stem.volume = Number(volume.value); volume.parentElement.querySelector("output").value = `${Math.round(stem.volume * 100)}%`; applyStemMix(song); });
      volume.addEventListener("change", () => persistAudioStemMix(song));
      const pan = row.querySelector(".audio-channel-pan");
      pan.value = String(stem.pan ?? 0);
      pan.parentElement.querySelector("output").value = stem.pan < -0.01 ? `E ${Math.round(-stem.pan * 100)}` : stem.pan > 0.01 ? `D ${Math.round(stem.pan * 100)}` : "C";
      pan.addEventListener("input", () => { stem.pan = Number(pan.value); pan.parentElement.querySelector("output").value = stem.pan < -0.01 ? `E ${Math.round(-stem.pan * 100)}` : stem.pan > 0.01 ? `D ${Math.round(stem.pan * 100)}` : "C"; applyStemMix(song); });
      pan.addEventListener("change", () => persistAudioStemMix(song));
      const output = row.querySelector(".audio-channel-output");
      addOutputPairOptions(output, stem.outputPair ?? 0);
      output.setAttribute("aria-label", `Saída física da pista ${stem.name}`);
      output.addEventListener("change", () => {
        stem.outputPair = Number(output.value);
        const player = stemPlayers.find((item) => item.id === stem.id);
        if (player) routeStemOutput(player, stem.outputPair);
        persistAudioStemMix(song);
      });
      const solo = row.querySelector(".midi-channel-solo");
      const mute = row.querySelector(".midi-channel-mute");
      const updateButtons = () => {
        solo.textContent = stem.solo ? "Desolo" : "Solo";
        mute.textContent = stem.muted ? "Ativar" : "Silenciar";
        const anySolo = (song.audioStems ?? []).some((item) => item.solo) || (song.audioMix ?? []).some((item) => item.solo);
        row.classList.toggle("muted", stem.muted || (anySolo && !stem.solo));
      };
      solo.addEventListener("click", () => { stem.solo = !stem.solo; row.dataset.solo = String(stem.solo); applyStemMix(song); updateButtons(); persistAudioStemMix(song); });
      mute.addEventListener("click", () => { stem.muted = !stem.muted; row.dataset.muted = String(stem.muted); applyStemMix(song); updateButtons(); persistAudioStemMix(song); });
      row.dataset.stem = stem.id;
      row.dataset.solo = String(stem.solo);
      row.dataset.muted = String(stem.muted);
      row.querySelector(".stem-remove").addEventListener("click", async () => {
        if (!window.confirm(`Remover a pista “${stem.name}” desta música?`)) return;
        song.audioStems = song.audioStems.filter((item) => item.id !== stem.id);
        await dbPut(song);
        const wasPlaying = !audio.paused;
        await connectAudioStems(song);
        if (wasPlaying) startStemPlayers();
        renderAudioMixer();
        syncTrackDetails();
      });
      updateButtons();
      container.append(row);
    }
  }).catch((error) => {
    container.innerHTML = "";
    const message = document.createElement("p");
    message.className = "midi-mixer-empty";
    message.textContent = error.message || "Não foi possível abrir o mixer deste ficheiro.";
    container.append(message);
    toast(error.message || "Não foi possível abrir o mixer de áudio.");
  });
}

async function setAudioTranspose(semitones) {
  if (!semitones && !pitchNode) return;
  const node = await ensurePitchGraph();
  const parameter = node.parameters.get("semitones");
  parameter.setTargetAtTime(semitones, pitchContext.currentTime, 0.035);
}

function loadPedalMappings() {
  try {
    const saved = JSON.parse(localStorage.getItem("stageset-pedals") || "null");
    return Array.isArray(saved) && saved.length >= 1
      ? saved
      : Array.from({ length: 4 }, () => ({ trigger: null, action: "none" }));
  } catch {
    return Array.from({ length: 4 }, () => ({ trigger: null, action: "none" }));
  }
}

function loadQuickies() {
  try {
    const saved = JSON.parse(localStorage.getItem("stageset-quickies") || "null");
    return Array.from({ length: 9 }, (_, index) => typeof saved?.[index] === "string" ? saved[index] : null);
  } catch {
    return Array(9).fill(null);
  }
}

function persistQuickies() {
  localStorage.setItem("stageset-quickies", JSON.stringify(state.quickies));
}

function assignQuickie(index) {
  if (!requireStudio()) return;
  const song = selectedSong();
  if (!song || isDocumentSong(song)) return toast("Escolhe primeiro uma faixa de áudio ou MIDI.");
  state.quickies[index] = song.id;
  persistQuickies();
  toast(`Quickie ${index + 1}: ${song.title}`);
}

async function playQuickie(index) {
  const id = state.quickies[index];
  const song = state.songs.find((item) => item.id === id);
  if (!song) {
    state.quickies[index] = null;
    persistQuickies();
    return toast(`Quickie ${index + 1} ainda não está definido.`);
  }
  if (isDocumentSong(song)) return toast("Este Quickie aponta para um documento; associa uma faixa de áudio ou MIDI.");
  await selectSong(id, true, { quickie: !state.setlist.includes(id) });
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(mode, action) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const result = action(tx.objectStore(STORE));
    tx.oncomplete = () => { db.close(); resolve(result?.result); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

const dbGetAll = () => withStore("readonly", (store) => store.getAll());
const dbPut = (song) => withStore("readwrite", (store) => store.put(song));
const dbDelete = (id) => withStore("readwrite", (store) => store.delete(id));

async function dbReplaceAll(songs) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    store.clear();
    for (const song of songs) store.put(song);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
    tx.onabort = () => { db.close(); reject(tx.error ?? new Error("A transação foi cancelada.")); };
  });
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainder}`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>\"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
  })[character]);
}

function exportReport(scope) {
  const isSetlist = scope === "setlist";
  const songs = (isSetlist ? state.setlist.map((id) => state.songs.find((song) => song.id === id)) : state.songs).filter(Boolean);
  if (!songs.length) return toast(isSetlist ? "A setlist está vazia." : "A biblioteca está vazia.");
  const knownDurations = songs.filter((song) => Number.isFinite(song.duration) && song.duration > 0);
  const durationTotal = knownDurations.reduce((total, song) => total + song.duration, 0);
  const rows = songs.map((song, index) => {
    const duration = Number.isFinite(song.duration) && song.duration > 0 ? formatTime(song.duration) : "—";
    return `<tr><td>${String(index + 1).padStart(2, "0")}</td><td>${escapeHtml(song.title)}</td><td>${escapeHtml(song.artist || "—")}</td><td>${escapeHtml(song.fileName || "—")}</td><td class="time">${duration}</td></tr>`;
  }).join("");
  const scopeName = isSetlist ? "Setlist" : "Biblioteca";
  const date = new Date().toLocaleString("pt-PT");
  const html = `<!doctype html><html lang="pt-PT"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${scopeName} — StageSet</title><style>
    :root{font-family:Segoe UI,Arial,sans-serif;color:#17212b;background:#fff}body{max-width:1100px;margin:38px auto;padding:0 24px}header{display:flex;justify-content:space-between;align-items:start;gap:20px;border-bottom:2px solid #186456;padding-bottom:18px}h1{margin:0;font-size:28px}p{color:#5c6974}.meta{text-align:right;font-size:13px}.summary{margin:24px 0;padding:14px 16px;background:#eef5f3;border-radius:8px}table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:10px 8px;border-bottom:1px solid #dce3e6}th{color:#53616d;font-size:11px;text-transform:uppercase;letter-spacing:.06em}.time{text-align:right;font-variant-numeric:tabular-nums}.actions{display:flex;gap:8px;margin:20px 0}.actions button{padding:9px 14px;border:0;border-radius:6px;background:#186456;color:#fff;font:600 13px Segoe UI,Arial,sans-serif;cursor:pointer}@media print{body{margin:0 auto;padding:0 8px}.actions{display:none}tr{break-inside:avoid}thead{display:table-header-group}}
  </style></head><body><header><div><h1>${scopeName}</h1><p>Relatório criado com StageSet</p></div><div class="meta">${date}<br>${songs.length} ${songs.length === 1 ? "item" : "itens"}</div></header><div class="summary">Duração conhecida: <strong>${formatTime(durationTotal)}</strong> (${knownDurations.length} de ${songs.length} itens com duração disponível).</div><div class="actions"><button onclick="window.print()">Imprimir / Guardar como PDF</button></div><table><thead><tr><th>#</th><th>Título</th><th>Artista</th><th>Ficheiro</th><th class="time">Duração</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
  const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `StageSet-${isSetlist ? "setlist" : "biblioteca"}-${new Date().toISOString().slice(0, 10)}.html`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  $("#report-modal").hidden = true;
  toast("Relatório HTML guardado nas transferências.");
}

function parseLyrics(text) {
  const timeLines = [];
  const barBeatLines = [];
  const timePattern = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]\s*((?:(?!\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\]).)*)/g;
  const barBeatPattern = /\[(\d{1,4}):(\d{1,2})\]\s*(.*)/g;
  for (const [sourceIndex, source] of text.split(/\r?\n/).entries()) {
    const timeMatches = [...source.matchAll(timePattern)];
    if (timeMatches.length) {
      for (const match of timeMatches) {
        const fraction = match[3] ? Number(`0.${match[3]}`) : 0;
        timeLines.push({ time: Number(match[1]) * 60 + Number(match[2]) + fraction, text: match[4].trim(), sourceIndex });
      }
      continue;
    }
    for (const match of source.matchAll(barBeatPattern)) {
      barBeatLines.push({ bar: Number(match[1]), beat: Number(match[2]), text: match[3].trim(), sourceIndex });
    }
  }
  return { timeLines: timeLines.sort((a, b) => a.time - b.time), barBeatLines };
}

function stripLyricColorTags(text) { return String(text ?? "").replace(/\[color=#[\da-f]{6}\]/gi, "").replace(/\[\/color\]/gi, ""); }

function coloredLyricHtml(text) {
  const source = String(text ?? ""), pattern = /\[color=(#[\da-f]{6})\]|\[\/color\]/gi;
  let cursor = 0, html = "", open = 0;
  for (const match of source.matchAll(pattern)) {
    html += escapeHtml(source.slice(cursor, match.index));
    if (match[1]) { html += `<span style="color:${match[1]}">`; open++; }
    else if (open) { html += "</span>"; open--; }
    cursor = match.index + match[0].length;
  }
  html += escapeHtml(source.slice(cursor));
  while (open-- > 0) html += "</span>";
  return html;
}

function appendColoredLyricText(element, text) {
  const source = String(text ?? ""), pattern = /\[color=(#[\da-f]{6})\]|\[\/color\]/gi;
  const parents = [element];
  let cursor = 0;
  for (const match of source.matchAll(pattern)) {
    if (match.index > cursor) parents.at(-1).append(document.createTextNode(source.slice(cursor, match.index)));
    if (match[1]) {
      const span = document.createElement("span"); span.style.color = match[1]; parents.at(-1).append(span); parents.push(span);
    } else if (parents.length > 1) parents.pop();
    cursor = match.index + match[0].length;
  }
  if (cursor < source.length) parents.at(-1).append(document.createTextNode(source.slice(cursor)));
}

function renderLyricsEditorPreview() {
  const textarea = $("#lyrics-editor-text"), preview = $("#lyrics-editor-preview");
  if (!textarea || !preview) return;
  preview.replaceChildren();
  const lines = textarea.value.split("\n");
  lines.forEach((line, index) => {
    const row = document.createElement("div"); row.className = "editor-preview-line"; row.dataset.sourceIndex = String(index);
    appendColoredLyricText(row, line); if (!line) row.append(document.createTextNode("\u00a0")); preview.append(row);
  });
  preview.scrollTop = textarea.scrollTop;
  preview.scrollLeft = textarea.scrollLeft;
  updateLyricsEditorFocus(false);
}

let editorFocusIndex = -1;
function updateLyricsEditorFocus(follow = true) {
  const modal = $("#lyrics-editor-modal"), textarea = $("#lyrics-editor-text"), preview = $("#lyrics-editor-preview");
  if (!modal || modal.hidden || !textarea || !preview || editingLyricsSongId !== state.currentId) return;
  const parsed = parseLyrics(textarea.value), position = currentPosition();
  const timed = parsed.timeLines.length ? parsed.timeLines : midiData?.barBeatToSeconds ? parsed.barBeatLines.map((line) => ({ ...line, time: midiData.barBeatToSeconds(line.bar, line.beat) })).sort((a, b) => a.time - b.time) : [];
  let index = -1;
  if (timed.length) index = timed.reduce((found, line) => line.time <= position ? line.sourceIndex : found, -1);
  else { const lines = textarea.value.split("\n"); if (lines.some((line) => line.trim())) index = state.autoScroll && currentDuration() ? Math.min(lines.length - 1, Math.floor(position / currentDuration() * lines.length)) : Math.max(0, Math.min(lines.length - 1, state.manualLyricOffset)); }
  const previous = preview.querySelector(".editor-preview-current"); if (previous) previous.classList.remove("editor-preview-current");
  const row = index >= 0 ? preview.children[index] : null;
  if (row) { row.classList.add("editor-preview-current"); row.style.backgroundColor = colorWithAlpha(lyricOutputSettings(selectedSong(), editingLyricsOutput).highlightColor || state.lyricHighlightColor); }
  if (follow && index !== editorFocusIndex && row && isPlaying() && document.activeElement !== textarea) {
    textarea.scrollTop = Math.max(0, row.offsetTop - textarea.clientHeight / 2 + row.offsetHeight / 2); preview.scrollTop = textarea.scrollTop;
  }
  editorFocusIndex = index;
}

function renderedLyricSource(element) {
  const song = selectedSong();
  const sourceIndex = Number(element?.dataset?.sourceIndex);
  if (song && Number.isInteger(sourceIndex)) return (song.lyricsText || "").split(/\r?\n/)[sourceIndex] ?? element.textContent ?? "";
  return element?.textContent ?? "";
}

function currentRenderedLyricLines() {
  return [...document.querySelectorAll("#lyrics-content .lyric-line, #lyrics-content .lyric-spacer")].map(renderedLyricSource);
}

function colorWithAlpha(hex, alpha = 0.34) {
  const match = /^#([\da-f]{6})$/i.exec(hex || "");
  if (!match) return `rgba(101,226,193,${alpha})`;
  const value = Number.parseInt(match[1], 16);
  return `rgba(${value >> 16},${(value >> 8) & 255},${value & 255},${alpha})`;
}

function lyricOutputSettings(song, target = "main") {
  return target === "main" ? song?.lyricDisplaySettings ?? {} : song?.lyricOutputSettings?.[target] ?? {};
}

function outputWindowName(output) { return 'stageset-lyrics-' + output.id; }

function outputLyricFrame(song, output, fallback, fallbackIndex, timestamps = false) {
  const raw = song?.lyricOutputLyrics?.[output.id] ?? song?.lyricsText;
  if (!raw && !Object.hasOwn(song?.lyricOutputLyrics ?? {}, output.id)) return { lines: fallback.map(line => timestamps ? line : line.replace(/\[\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?\]\s*/g, '')), currentIndex: fallbackIndex };
  const parsed = parseLyrics(raw || '');
  const timed = parsed.timeLines.length ? parsed.timeLines : midiData?.barBeatToSeconds ? parsed.barBeatLines.map(line => ({...line, time:midiData.barBeatToSeconds(line.bar,line.beat)})) : [];
  const source = (raw || '').split(/\r?\n/);
  const all = timed.length ? timed.map(line => timestamps ? source[line.sourceIndex] : line.text) : source;
  const active = timed.length ? timed.reduce((found,line,index) => line.time <= currentPosition() ? index : found, -1) : state.autoScroll && currentDuration() ? Math.min(all.length-1, Math.floor(currentPosition()/currentDuration()*all.length)) : Math.min(all.length-1,state.manualLyricOffset);
  const start = Math.max(0, Math.min(all.length - 5, active - 2));
  return {lines:all.slice(start,start+5), currentIndex:active < 0 ? -1 : active-start};
}

function broadcastLyricWindows(lines, currentIndex = -1) {
  const song = selectedSong(), timestamps = localStorage.getItem('stageset-mosaic-timestamps') === 'true';
  if (state.mosaicWindow && !state.mosaicWindow.closed) state.mosaicWindow.postMessage({type:'stageset-mosaic-outputs', outputs:state.displayOutputs.map(output=>output.id)}, location.origin);
  state.displayOutputs.forEach((output,index) => {
    const prefs = lyricOutputSettings(song,output.id);
    const common = {displays:availableDisplays,desktop:!!window.stageSetDesktop,displayId:output.displayId||'',output:output.id,name:output.name,color:prefs.highlightColor||output.color,baseColor:output.color,fontSize:Number(prefs.fontSize)||42,visible:output.mosaicVisible!==false};
    const send = (ref,type,withTimes) => {
      if(!ref||ref.closed)return;
      let sent=sentBackgrounds.get(ref);if(!sent){sent=new Map();sentBackgrounds.set(ref,sent);}
      for(const id of sent.keys())if(!state.displayOutputs.some(item=>item.id===id))sent.delete(id);
      const changed=!sent.has(output.id)||sent.get(output.id)!==output.background;
      const frame=outputLyricFrame(song,output,lines,currentIndex,withTimes);
      ref.postMessage({type,...common,...frame,htmlLines:frame.lines.map(coloredLyricHtml),timestamps,...(changed?{background:normalizeBackground(output.background)}:{})},location.origin);
      sent.set(output.id,output.background);
    };
    send(state.displayWindows[index],'stageset-lyrics',false);
    send(state.mosaicWindow,'stageset-mosaic',timestamps);
  });
}

function parseEmbeddedMidiActions(text) {
  const actions = [];
  const tag = /^\s*\[midi(?:@(play|stop|(\d{2}:\d{2}(?:\.\d{1,3})?))|):\s*(.*?)\]\s*$/i;
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const match = line.match(tag);
    if (!match) continue;
    const trigger = match[1]?.toLowerCase() || "load";
    const timestamp = match[2];
    const time = timestamp ? Number(timestamp.slice(0, 2)) * 60 + Number(timestamp.slice(3)) : null;
    actions.push({ trigger: timestamp ? "time" : trigger, time, commands: match[3].split(",").map((item) => item.trim()).filter(Boolean) });
  }
  return actions;
}

function isEmbeddedMidiTag(line) {
  return /^\s*\[midi(?:@(play|stop|\d{2}:\d{2}(?:\.\d{1,3})?))?:\s*.*\]\s*$/i.test(line);
}

function lyricMidiOutput(song, channel) {
  const route = Number.isInteger(channel) ? song?.midiOutputIds?.[channel] : undefined;
  if (route === "internal") return null;
  const id = route && route !== "inherit" ? route : state.midiOutputId;
  return id ? allMidiOutputs().find((output) => output.id === id && output.state !== "disconnected") ?? null : null;
}

function sendEmbeddedMidiCommand(song, command) {
  const send = (bytes, channel = null) => {
    const output = lyricMidiOutput(song, channel);
    if (!output) return false;
    output.open().then(() => output.send(bytes)).catch(() => {});
    return true;
  };
  const system = command.toUpperCase();
  const systemBytes = { START: [0xfa], CONTINUE: [0xfb], STOP: [0xfc] }[system];
  if (systemBytes) return send(systemBytes);
  const songSelect = system.match(/^SS(\d{1,3})$/);
  if (songSelect) { const value = Number(songSelect[1]); return value <= 127 && send([0xf3, value]); }
  const sysex = command.match(/^SX\s*([\da-f\s]+)$/i);
  if (sysex) {
    const hex = sysex[1].replace(/\s+/g, "");
    if (hex.length < 4 || hex.length % 2) return false;
    const bytes = Array.from({ length: hex.length / 2 }, (_, index) => Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16));
    if (bytes.some((byte) => !Number.isInteger(byte))) return false;
    return send(bytes);
  }
  const program = command.match(/^PC(\d{1,3})(?:\.(\d{1,3}))?@(\d{1,2})$/i);
  if (program) {
    const [, rawProgram, rawBank, rawChannel] = program;
    const channel = Number(rawChannel) - 1, value = Number(rawProgram), bank = rawBank === undefined ? null : Number(rawBank);
    if (channel < 0 || channel > 15 || value > 127 || (bank !== null && bank > 127)) return false;
    if (bank !== null) send([0xb0 | channel, 32, bank], channel);
    return send([0xc0 | channel, value], channel);
  }
  const match = command.match(/^(CC|N)(\d{1,3})(?:\.(\d{1,3}))?@(\d{1,2})$/i);
  if (!match) return false;
  const [, kind, rawNumber, rawValue, rawChannel] = match;
  const channel = Number(rawChannel) - 1, number = Number(rawNumber), value = rawValue === undefined ? 127 : Number(rawValue);
  if (channel < 0 || channel > 15 || number > 127 || value > 127) return false;
  return kind.toUpperCase() === "CC"
    ? send([0xb0 | channel, number, value], channel)
    : send([value ? 0x90 | channel : 0x80 | channel, number, value], channel);
}

function fireEmbeddedMidiActions(trigger, song = selectedSong(), position = null) {
  if (!song) return;
  for (const action of parseEmbeddedMidiActions(song.lyricsText)) {
    if (action.trigger !== trigger || (trigger === "time" && (action.time > position || action.time <= embeddedMidiLastPosition))) continue;
    for (const command of action.commands) sendEmbeddedMidiCommand(song, command);
  }
}

let embeddedMidiLastPosition = -1;

const chordRoots = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const pitchClass = { C: 0, "B#": 0, "C#": 1, Db: 1, D: 2, "C##": 2, "D#": 3, Eb: 3, E: 4, Fb: 4, "E#": 5, F: 5, "F#": 6, Gb: 6, G: 7, "F##": 7, "G#": 8, Ab: 8, A: 9, "G##": 9, "A#": 10, Bb: 10, B: 11, Cb: 11 };

function transposeChord(chord, semitones) {
  const match = chord.match(/^([A-G])([#b]?)(.*?)(?:\/([A-G])([#b]?))?$/);
  if (!match) return chord;
  const [, root, accidental, suffix, bass, bassAccidental] = match;
  const rootIndex = pitchClass[`${root}${accidental}`];
  if (rootIndex === undefined) return chord;
  const transposedRoot = chordRoots[(rootIndex + semitones % 12 + 12) % 12];
  const bassIndex = bass ? pitchClass[`${bass}${bassAccidental ?? ""}`] : undefined;
  if (bass && bassIndex === undefined) return chord;
  const transposedBass = bass ? `/${chordRoots[(bassIndex + semitones % 12 + 12) % 12]}` : "";
  return `${transposedRoot}${suffix}${transposedBass}`;
}

function transposeLyricLine(text, semitones) {
  if (!semitones) return text;
  const chordExpression = "[A-G](?:#|b)?(?:m(?:aj)?|maj|dim|aug|sus[24]?|add\\d+)?\\d*(?:/[A-G](?:#|b)?)?";
  const chordOnly = new RegExp(`^\\s*(?:${chordExpression})(?:\\s+(?:${chordExpression}))*\\s*$`);
  if (chordOnly.test(text)) {
    return text.replace(/\S+/g, (token) => transposeChord(token, semitones));
  }
  return text.replace(/\[([^\]]+)\]/g, (whole, chord) => chordOnly.test(chord) ? `[${transposeChord(chord, semitones)}]` : whole);
}

function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("visible");
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => element.classList.remove("visible"), 2600);
}

const pedalActions = [
  ["none", "Desativado"], ["playPause", "Reproduzir / pausar"], ["next", "Faixa seguinte"], ["previous", "Faixa anterior"],
  ["back10", "REW · recuar 10 segundos"], ["forward10", "FFW · avançar 10 segundos"], ["pause", "Pausa (manter posição)"], ["stop", "STOP (parar e voltar ao início)"],
  ["autoScroll", "Alternar avanço automático das letras"],
  ["scrollLyrics", "Avançar uma linha das letras"], ["playThenScroll", "Reproduzir e depois avançar letras"],
  ["loopIn", "Marcar início do loop"], ["loopOut", "Marcar fim e ativar o loop"], ["loopToggle", "Ativar / desativar loop"], ["loopExit", "Desativar loop"],
  ["volumeUp", "Aumentar volume"], ["volumeDown", "Diminuir volume"],
];

function persistPedals() {
  localStorage.setItem("stageset-pedals", JSON.stringify(state.pedalMappings));
}

function saveSetlistCcConfig() {
  if (!requireStudio()) return;
  state.setlistCcEnabled = $("#setlist-cc-enabled").checked;
  state.setlistMidiType = validSelectTypes.includes($("#setlist-midi-type").value) ? $("#setlist-midi-type").value : "cc";
  state.setlistCcChannel = Math.max(0, Math.min(15, Number($("#setlist-cc-channel").value) || 0));
  state.setlistCcNumber = Math.max(0, Math.min(127, Number($("#setlist-cc-number").value) || 0));
  localStorage.setItem("stageset-cc-select-enabled", String(state.setlistCcEnabled));
  localStorage.setItem("stageset-midi-select-type", state.setlistMidiType);
  localStorage.setItem("stageset-cc-select-channel", String(state.setlistCcChannel));
  localStorage.setItem("stageset-cc-select-number", String(state.setlistCcNumber));
  $("#setlist-cc-channel").value = String(state.setlistCcChannel);
  $("#setlist-cc-number").value = String(state.setlistCcNumber);
  $("#setlist-midi-type").value = state.setlistMidiType;
  $("#setlist-cc-channel").disabled = !state.setlistCcEnabled;
  $("#setlist-midi-type").disabled = !state.setlistCcEnabled;
  const needsNumber = state.setlistMidiType === "cc";
  $("#setlist-cc-number").disabled = !state.setlistCcEnabled || !needsNumber;
  $("#setlist-cc-number-label").hidden = !needsNumber;
  $("#setlist-cc-number-label").style.display = needsNumber ? "" : "none";
  $("#setlist-cc-channel").closest("label").hidden = state.setlistMidiType === "song";
  $("#setlist-cc-number-label").firstChild.textContent = "Número do Control Change (CC)";
  $("#setlist-midi-type-hint").hidden = needsNumber;
  $("#setlist-midi-type-hint").textContent = ({ program: "Atribui o número Program Change em cada linha da setlist (PC).", note: "Atribui a nota MIDI em cada linha da setlist.", song: "Atribui o Song Select em cada linha da setlist." })[state.setlistMidiType] || "";
  $("#midi-assign-value-label").textContent = ({ cc: "Valor CC", program: "Número Program Change", note: "Número da nota", song: "Número Song Select" })[state.setlistMidiType];
  const songSelect = $("#midi-assign-song"), previousSong = songSelect.value; songSelect.replaceChildren(new Option("Escolhe uma música", ""));
  state.setlist.forEach((id) => { const song = state.songs.find((item) => item.id === id); if (song) songSelect.add(new Option(song.title, id)); });
  if ([...songSelect.options].some((option) => option.value === previousSong)) songSelect.value = previousSong;
  const selectedMapping = songMidiSelectMapping(state.songs.find((song) => song.id === songSelect.value));
  $("#midi-assign-value").value = selectedMapping ? String(selectedMapping.value) : "";
  $("#setlist-cc-number").title = needsNumber ? "Número do controlador CC a monitorizar" : "O número/mensagem é atribuído em cada linha da setlist";
  $("#setlist-midi-learn").textContent = state.learningSetlistMidi ? "A ouvir MIDI…" : "Aprender mensagem MIDI";
  $("#setlist-midi-learn").disabled = state.learningSetlistMidi;
  const midiTypeNames = { cc: `CC ${state.setlistCcNumber}`, program: "Program Change", note: "MIDI Note", song: "Song Select" };
  $("#setlist-cc-status").textContent = state.setlistCcEnabled
    ? `Ativo · ${state.setlistMidiType === "song" ? "Song Select" : `canal ${state.setlistCcChannel + 1} · ${midiTypeNames[state.setlistMidiType]}`}. Atribui um valor único por música; a reprodução continua manual.`
    : "Liga uma entrada MIDI, escolhe o tipo de mensagem e atribui um valor diferente a cada música. A seleção não inicia a reprodução.";
  renderLibrary();
  renderSetlist();
}

function songMidiSelectMapping(song, type = state.setlistMidiType) {
  const selected = song?.setlistMidi?.[type];
  if (selected && Number.isInteger(selected.channel) && Number.isInteger(selected.value)) return { ...selected, type };
  if (song?.setlistMidi?.type === type) return song.setlistMidi;
  if (type !== "cc") return null;
  if (song?.setlistCc) return { type: "cc", ...song.setlistCc };
  if (Number.isInteger(song?.setlistCcValue)) return { type: "cc", channel: state.setlistCcChannel, number: state.setlistCcNumber, value: song.setlistCcValue };
  return null;
}

function midiSelectLabel(type) { return ({ cc: "Control Change", program: "Program Change", note: "MIDI Note", song: "Song Select" })[type] || "Control Change"; }

function formatPedalTrigger(trigger) {
  if (!trigger) return "Não aprendido";
  const kind = trigger.type === "note" ? "Nota" : "CC";
  return `${kind} ${trigger.number} · canal ${trigger.channel + 1}`;
}

function renderPedalMap() {
  const container = $("#pedal-map");
  if (!container) return;
  container.innerHTML = "";
  const channelSelect = $("#setlist-cc-channel");
  if (channelSelect && !channelSelect.options.length) {
    for (let channel = 0; channel < 16; channel++) {
      channelSelect.add(new Option(`Canal ${channel + 1}`, String(channel)));
      $("#song-cc-channel")?.add(new Option(`Canal ${channel + 1}`, String(channel)));
    }
  }
  if (channelSelect) channelSelect.value = String(state.setlistCcChannel);
  if ($("#setlist-midi-type")) $("#setlist-midi-type").value = state.setlistMidiType;
  if ($("#setlist-cc-enabled")) $("#setlist-cc-enabled").checked = state.setlistCcEnabled;
  if ($("#setlist-cc-number")) $("#setlist-cc-number").value = String(state.setlistCcNumber);
  if ($("#setlist-cc-enabled")) saveSetlistCcConfig();
  state.pedalMappings.forEach((mapping, index) => {
    const row = document.createElement("div");
    row.className = "pedal-row";row.dataset.learnScope="pedal-"+index;
    row.innerHTML = `<span class="pedal-name">Pedal ${index + 1}</span><span class="pedal-signal"></span><div class="pedal-action-cell"><button class="pedal-learn" type="button"></button><select class="pedal-action" aria-label="Ação do pedal ${index + 1}"></select></div>`;
    row.querySelector(".pedal-signal").textContent = formatPedalTrigger(mapping.trigger);
    const learn = row.querySelector(".pedal-learn");
    learn.textContent = state.learningPedal === index ? "Aguarda sinal…" : "Aprender";
    learn.classList.toggle("learning", state.learningPedal === index);
    learn.addEventListener("click", () => {
      if (!state.pedalInput) return toast("Liga e seleciona primeiro um dispositivo MIDI.");
      state.learningPedal = index;
      renderPedalMap();
      $("#pedal-status").textContent = `Carrega no pedal ${index + 1}`;
    });
    const select = row.querySelector(".pedal-action");
    for (const [value, label] of pedalActions) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      select.append(option);
    }
    select.value = mapping.action;
    select.addEventListener("change", () => {
      mapping.action = select.value;
      state.pedalSequenceStarted.clear();
      persistPedals();
    });
    container.append(row);
  });
}

function persistMidiMix(song) {
  dbPut(song).catch(() => toast("Não foi possível guardar a mistura MIDI."));
}

const midiProgramGroups = [
  ["Piano", ["Acoustic Grand Piano", "Bright Acoustic Piano", "Electric Grand Piano", "Honky-tonk Piano", "Electric Piano 1", "Electric Piano 2", "Harpsichord", "Clavinet"]],
  ["Chromatic Percussion", ["Celesta", "Glockenspiel", "Music Box", "Vibraphone", "Marimba", "Xylophone", "Tubular Bells", "Dulcimer"]],
  ["Organ", ["Drawbar Organ", "Percussive Organ", "Rock Organ", "Church Organ", "Reed Organ", "Accordion", "Harmonica", "Tango Accordion"]],
  ["Guitar", ["Acoustic Guitar (nylon)", "Acoustic Guitar (steel)", "Electric Guitar (jazz)", "Electric Guitar (clean)", "Electric Guitar (muted)", "Overdriven Guitar", "Distortion Guitar", "Guitar harmonics"]],
  ["Bass", ["Acoustic Bass", "Electric Bass (finger)", "Electric Bass (pick)", "Fretless Bass", "Slap Bass 1", "Slap Bass 2", "Synth Bass 1", "Synth Bass 2"]],
  ["Strings", ["Violin", "Viola", "Cello", "Contrabass", "Tremolo Strings", "Pizzicato Strings", "Orchestral Harp", "Timpani"]],
  ["Ensemble", ["String Ensemble 1", "String Ensemble 2", "SynthStrings 1", "SynthStrings 2", "Choir Aahs", "Voice Oohs", "Synth Voice", "Orchestra Hit"]],
  ["Brass", ["Trumpet", "Trombone", "Tuba", "Muted Trumpet", "French Horn", "Brass Section", "SynthBrass 1", "SynthBrass 2"]],
  ["Reed", ["Soprano Sax", "Alto Sax", "Tenor Sax", "Baritone Sax", "Oboe", "English Horn", "Bassoon", "Clarinet"]],
  ["Pipe", ["Piccolo", "Flute", "Recorder", "Pan Flute", "Blown Bottle", "Shakuhachi", "Whistle", "Ocarina"]],
  ["Synth Lead", ["Lead 1 (square)", "Lead 2 (sawtooth)", "Lead 3 (calliope)", "Lead 4 (chiff)", "Lead 5 (charang)", "Lead 6 (voice)", "Lead 7 (fifths)", "Lead 8 (bass + lead)"]],
  ["Synth Pad", ["Pad 1 (new age)", "Pad 2 (warm)", "Pad 3 (polysynth)", "Pad 4 (choir)", "Pad 5 (bowed)", "Pad 6 (metallic)", "Pad 7 (halo)", "Pad 8 (sweep)"]],
  ["Synth Effects", ["FX 1 (rain)", "FX 2 (soundtrack)", "FX 3 (crystal)", "FX 4 (atmosphere)", "FX 5 (brightness)", "FX 6 (goblins)", "FX 7 (echoes)", "FX 8 (sci-fi)"]],
  ["Ethnic", ["Sitar", "Banjo", "Shamisen", "Koto", "Kalimba", "Bag pipe", "Fiddle", "Shanai"]],
  ["Percussive", ["Tinkle Bell", "Agogo", "Steel Drums", "Woodblock", "Taiko Drum", "Melodic Tom", "Synth Drum", "Reverse Cymbal"]],
  ["Sound Effects", ["Guitar Fret Noise", "Breath Noise", "Seashore", "Bird Tweet", "Telephone Ring", "Helicopter", "Applause", "Gunshot"]],
];

function renderMidiMixer() {
  const song = selectedSong();
  if (!song || !midiData) return toast("Escolhe uma faixa MIDI ou um mix com MIDI.");
  song.midiMix = normalizeMidiMix(song.midiMix);
  midiPlayer.setChannelMix(song.midiMix);
  const container = $("#midi-mixer-list");
  container.innerHTML = "";
  const activeChannels = midiData.channels;
  const outputs = allMidiOutputs();
  for (const channel of activeChannels) {
    const settings = song.midiMix[channel.channel];
    const row = document.createElement("div");
    row.className = "midi-channel-row";row.dataset.learnScope="midi-channel-"+channel.channel;
    row.innerHTML = `<div class="midi-channel-label"><strong></strong><span class="midi-channel-meta"></span><label class="midi-program-control"><span>Timbre sintetizado</span><select class="midi-channel-program" aria-label="Timbre sintetizado do canal ${channel.channel + 1}"></select></label></div><label class="midi-mix-control"><span>Volume</span><output></output><input class="midi-channel-volume" type="range" min="0" max="1" step="0.01" /></label><label class="midi-mix-control"><span>Pan</span><output></output><input class="midi-channel-pan" type="range" min="-1" max="1" step="0.01" /></label><button class="midi-channel-solo" type="button"></button><button class="midi-channel-mute" type="button"></button>`;
    const outputControl = document.createElement("label");
    outputControl.className = "midi-output-control";
    outputControl.innerHTML = '<span>Porta de saída MIDI</span><select class="midi-channel-output"></select>';
    const outputSelect = outputControl.querySelector("select");
    outputSelect.setAttribute("aria-label", "Porta MIDI independente do canal " + (channel.channel + 1));
    outputSelect.add(new Option("Saída geral", "inherit"));
    outputSelect.add(new Option("Sintetizador interno", "internal"));
    for (const output of outputs) outputSelect.add(new Option(output.name || "Interface MIDI", output.id));
    const savedRoute = song.midiOutputIds?.[channel.channel];
    outputSelect.value = savedRoute && (savedRoute === "internal" || outputs.some((output) => output.id === savedRoute)) ? savedRoute : "inherit";
    outputSelect.addEventListener("change", async () => {
      const route = outputSelect.value;
      song.midiOutputIds = Array.from({ length: 16 }, (_, index) => song.midiOutputIds?.[index] ?? "inherit");
      song.midiOutputIds[channel.channel] = route;
      const output = route === "inherit" ? undefined : route === "internal" ? null : outputs.find((item) => item.id === route) ?? null;
      await midiPlayer.setChannelOutput(channel.channel, output);
      persistMidiMix(song);
    });
    row.querySelector(".midi-channel-label").append(outputControl);
    row.querySelector(".midi-channel-label strong").textContent = channel.channel === 9
      ? "Canal 10 · Percussão"
      : "Canal " + String(channel.channel + 1).padStart(2, "0");
    row.querySelector(".midi-channel-meta").textContent = channel.noteCount
      ? channel.noteCount + " notas · programa " + (channel.programs[0] + 1)
      : "sem notas · canal reservado";
    const programControl = row.querySelector(".midi-program-control");
    const programSelect = row.querySelector(".midi-channel-program");
    programControl.hidden = channel.channel === 9;
    if (channel.channel !== 9) {
      programSelect.add(new Option("Programa da faixa", "original"));
      midiProgramGroups.forEach(([family, programs], groupIndex) => {
        const group = document.createElement("optgroup");
        group.label = family;
        programs.forEach((programName, variantIndex) => {
          const program = groupIndex * 8 + variantIndex;
          group.append(new Option(String(program + 1).padStart(3, "0") + " · " + programName, String(program)));
        });
        programSelect.append(group);
      });
      programSelect.value = settings.program === null ? "original" : String(settings.program);
      programSelect.addEventListener("change", () => {
        settings.program = programSelect.value === "original" ? null : Number(programSelect.value);
        midiPlayer.setChannelProgram(channel.channel, settings.program);
        persistMidiMix(song);
      });
    }
    const volume = row.querySelector(".midi-channel-volume");
    const volumeOutput = volume.parentElement.querySelector("output");
    volume.value = String(settings.volume);
    volume.setAttribute("aria-label", "Volume do canal " + (channel.channel + 1));
    volumeOutput.value = Math.round(settings.volume * 100) + "%";
    volume.addEventListener("input", () => {
      settings.volume = Number(volume.value);
      volumeOutput.value = Math.round(settings.volume * 100) + "%";
      midiPlayer.setChannelVolume(channel.channel, settings.volume);
    });
    volume.addEventListener("change", () => persistMidiMix(song));
    const pan = row.querySelector(".midi-channel-pan");
    const panOutput = pan.parentElement.querySelector("output");
    pan.value = String(settings.pan);
    pan.setAttribute("aria-label", "Panorâmica do canal " + (channel.channel + 1));
    const formatPan = (value) => value < -0.01 ? "E " + Math.round(-value * 100) : value > 0.01 ? "D " + Math.round(value * 100) : "C";
    panOutput.value = formatPan(settings.pan);
    pan.addEventListener("input", () => {
      settings.pan = Number(pan.value);
      panOutput.value = formatPan(settings.pan);
      midiPlayer.setChannelPan(channel.channel, settings.pan);
    });
    pan.addEventListener("change", () => persistMidiMix(song));
    const mute = row.querySelector(".midi-channel-mute");
    const updateMute = () => {
      row.classList.toggle("muted", settings.muted);
      mute.textContent = settings.muted ? "Ativar" : "Silenciar";
      mute.setAttribute("aria-label", (settings.muted ? "Ativar" : "Silenciar") + " canal " + (channel.channel + 1));
      mute.setAttribute("aria-pressed", String(settings.muted));
    };
    updateMute();
    mute.addEventListener("click", () => {
      settings.muted = !settings.muted;
      midiPlayer.setChannelMuted(channel.channel, settings.muted);
      updateMute();
      persistMidiMix(song);
    });
    const solo = row.querySelector(".midi-channel-solo");
    const updateSolo = () => {
      solo.textContent = settings.solo ? "Desolo" : "Solo";
      solo.setAttribute("aria-label", (settings.solo ? "Desativar solo do canal " : "Ouvir apenas o canal ") + (channel.channel + 1));
      solo.setAttribute("aria-pressed", String(settings.solo));
    };
    updateSolo();
    solo.addEventListener("click", () => {
      settings.solo = !settings.solo;
      midiPlayer.setChannelSolo(channel.channel, settings.solo);
      updateSolo();
      persistMidiMix(song);
    });
    container.append(row);
  }
}

function renderMidiInputs() {
  renderMidiOutputs();
  const select = $("#pedal-device");
  const inputs = allMidiInputs();
  const previousId = state.pedalInputId;
  select.innerHTML = "";
  if (!inputs.length) {
    select.add(new Option("Nenhum dispositivo ligado", ""));
    select.disabled = true;
    attachPedalInput(null);
    $("#pedal-status").textContent = state.midiAccess ? "Sem entradas MIDI" : "Desligado";
    $("#pedal-status").classList.remove("connected");
    return;
  }
  for (const input of inputs) select.add(new Option(input.name || "Controlador MIDI", input.id));
  select.disabled = false;
  const chosen = inputs.some((input) => input.id === previousId) ? previousId : inputs[0].id;
  select.value = chosen;
  attachPedalInput(inputs.find((input) => input.id === chosen) ?? null);
}

function renderMidiOutputs() {
  syncController?.refreshPorts();
  const select = $("#midi-output-device");
  if (!select) return;
  const outputs = allMidiOutputs();
  select.innerHTML = "";
  select.add(new Option("Sintetizador interno", "internal"));
  for (const output of outputs) select.add(new Option(output.name || "Saída MIDI", output.id));
  if (state.midiOutputId && outputs.some((output) => output.id === state.midiOutputId)) {
    select.value = state.midiOutputId;
  } else {
    if (state.midiOutputId) {
      state.midiOutputId = "";
      midiPlayer.setMidiOutput(null).catch(() => {});
      $("#midi-output-status").textContent = "Saída desligada; sintetizador interno ativo";
    }
    select.value = "internal";
  }
  select.disabled = false;
}

function attachPedalInput(input) {
  if (state.pedalInput && state.pedalInput !== input) state.pedalInput.onmidimessage = null;
  state.pedalInput = input;
  state.pedalInputId = input?.id ?? "";
  if (!input) return;
  input.onmidimessage = (event) => onPedalMessage(event, input.id);
  input.open().catch(() => {
    $("#pedal-status").textContent = "Não foi possível abrir a entrada";
    $("#pedal-status").classList.remove("connected");
  });
  $("#pedal-status").textContent = input.name || "Pedal ligado";
  $("#pedal-status").classList.add("connected");
}

function onPedalMessage(event, inputId) {
  const [status, number, value] = event.data;
  const isSongSelect = status === 0xf3;
  const command = status & 0xf0;
  const channel = isSongSelect ? 0 : status & 0x0f;
  const isNoteOn = command === 0x90 && value > 0;
  const isNoteOff = command === 0x80 || (command === 0x90 && value === 0);
  const isControl = command === 0xb0;
  const isProgramChange = command === 0xc0;
  if (!isNoteOn && !isNoteOff && !isControl && !isProgramChange && !isSongSelect) return;
  const shortcutTrigger = `${inputId}:${isControl ? 'cc' : 'note'}:${channel}:${number}`;
  const shortcutPressed = isNoteOn || (isControl && value >= 64);
  const shortcutRising = !shortcutMidiDown.has(shortcutTrigger);
  if (shortcutPressed) shortcutMidiDown.add(shortcutTrigger); else if (!isProgramChange) shortcutMidiDown.delete(shortcutTrigger);
  if (buttonLearnTarget && buttonLearnKind === "midi" && (isNoteOn || (isControl && value >= 64) || isProgramChange)) {
    assignButtonShortcut("midi", { type: "midi", inputId, status, number });
    buttonLearnTarget = null; toast("Atalho MIDI guardado."); return;
  }
  if (isNoteOn || (isControl && value >= 64) || isProgramChange) {
    const match = Object.entries(buttonShortcuts).map(([id,s])=>[id,s.midi||s]).find(([, shortcut]) => shortcut.type === "midi" && shortcut.inputId === inputId && shortcut.status === status && shortcut.number === number);
    if (match) { const button = shortcutButton(match[0]); if (button && !button.disabled && button.getClientRects().length) { if (isProgramChange || shortcutRising) button.click(); return; } }
  }
  if (state.learningSongMidiId === editingCcSongId && state.learningSongMidiId) {
    const type = $("#song-cc-type").value;
    const matches = (type === "cc" && isControl) || (type === "program" && isProgramChange) || (type === "note" && isNoteOn) || (type === "song" && isSongSelect);
    if (matches) {
      state.learningSongMidiId = null;
      $("#song-cc-channel").value = String(channel);
      if (type === "cc") { $("#song-cc-number").value = String(number); $("#song-cc-value").value = String(value); }
      else $("#song-cc-value").value = String(number);
      $("#song-cc-learn").textContent = "Learn MIDI";
      $("#song-cc-learn-status").textContent = `${midiSelectLabel(type)} · ${type === "cc" ? `CC ${number} · valor ${value} · ` : ""}canal ${channel + 1}. Confirma em Guardar atribuição.`;
      updateSongCcEditorFields();
      toast("Mensagem MIDI aprendida para esta música.");
      return;
    }
  }
  if (state.learningSetlistMidi) {
    if ((state.setlistMidiType === "cc" && isControl) || (state.setlistMidiType === "program" && isProgramChange) || (state.setlistMidiType === "note" && isNoteOn) || (state.setlistMidiType === "song" && isSongSelect)) {
      state.learningSetlistMidi = false;
      if (state.setlistMidiType === "cc") state.setlistCcNumber = number;
      state.setlistCcChannel = channel;
      $("#setlist-cc-enabled").checked = true;
      $("#setlist-cc-channel").value = String(channel);
      $("#setlist-cc-number").value = String(state.setlistCcNumber);
      const names = { cc: `CC ${number}`, program: `Program Change ${number}`, note: `Nota MIDI ${number}`, song: `Song Select ${number}` };
      $("#setlist-midi-learn-status").textContent = `${names[state.setlistMidiType]} · canal ${channel + 1}`;
      saveSetlistCcConfig();
      toast("Mensagem MIDI aprendida. Atribui o número de cada música na setlist.");
      return;
    }
  }
  const lyricShortcut = selectedSong()?.lyricShortcut;
  if (state.lyricShortcutLearning && isNoteOn) { saveLyricShortcut({ type: "midi-note", channel, number, inputId }); return; }
  if (!state.lyricShortcutLearning && isNoteOn && state.mode === "studio" && lyricShortcut?.type === "midi-note" && lyricShortcut.channel === channel && lyricShortcut.number === number && (!lyricShortcut.inputId || lyricShortcut.inputId === inputId)) { triggerLyricTimestamp(); return; }
  if (state.setlistCcEnabled) {
    const match = state.setlist.map((id) => state.songs.find((song) => song.id === id)).find((song) => {
      if (!song) return false;
      const mapping = songMidiSelectMapping(song);
      if (!mapping || mapping.type !== state.setlistMidiType || (state.setlistMidiType !== "song" && mapping.channel !== channel)) return false;
      if (state.setlistMidiType === "program") return isProgramChange && mapping.value === number;
      if (state.setlistMidiType === "cc") return isControl && mapping.number === number && mapping.value === value;
      if (state.setlistMidiType === "note") return isNoteOn && mapping.value === number;
      return isSongSelect && mapping.value === number;
    });
    if (match) {
      if (match.id !== state.currentId) {
        selectSong(match.id);
        toast(`Selecionada pela entrada MIDI: ${match.title}`);
      }
      return;
    }
  }
  if (isProgramChange || isSongSelect) return;
  const type = isControl ? "control" : "note";
  const triggerId = `${inputId}:${type}:${channel}:${number}`;
  const pressed = isNoteOn || (isControl && value >= 64);
  if (!pressed) {
    state.pedalDown.delete(triggerId);
    return;
  }
  const risingEdge = !state.pedalDown.has(triggerId);
  state.pedalDown.add(triggerId);
  const trigger = { inputId, type, channel, number };
  if (state.learningPedal >= 0) {
    state.pedalMappings[state.learningPedal].trigger = trigger;
    state.learningPedal = -1;
    persistPedals();
    renderPedalMap();
    toast("Entrada do pedal aprendida.");
    return;
  }
  if (!risingEdge) return;
  const mapping = state.pedalMappings.find((item) => item.trigger?.inputId === inputId && item.trigger.type === type && item.trigger.channel === channel && item.trigger.number === number);
  if (mapping && mapping.action !== "none") performPedalAction(mapping.action, triggerId);
}

function stepLyrics(direction = 1) {
  const song = selectedSong();
  if (!song || isDocumentSong(song) || state.cdgView) return;
  if (song.lyricLines?.length || midiData?.lyrics?.length) return toast("Estas letras já avançam sincronizadas com a reprodução.");
  const lines = song.midiLyricLines?.length
    ? song.midiLyricLines
    : (song.lyricsText ?? "").split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return toast("Esta música ainda não tem letras para avançar.");
  if (state.autoScroll) {
    if (!song.midiLyricLines?.length && currentDuration() > 0) {
      state.manualLyricOffset = Math.min(lines.length - 1, Math.floor((currentPosition() / currentDuration()) * lines.length));
    } else state.manualLyricOffset = -1;
    state.autoScroll = false;
    $("#auto-scroll").classList.remove("active-tool");
    $("#auto-scroll").setAttribute("aria-pressed", "false");
  }
  state.manualLyricOffset = Math.max(0, Math.min(lines.length - 1, state.manualLyricOffset + direction));
  renderLyrics();
}

function performPedalAction(action, triggerId = "") {
  if (action === "playPause") $("#play").click();
  else if (action === "playThenScroll") {
    if (!state.pedalSequenceStarted.has(triggerId)) {
      state.pedalSequenceStarted.add(triggerId);
      if (!isPlaying()) $("#play").click();
    } else stepLyrics(1);
  }
  else if (action === "next") $("#next").click();
  else if (action === "previous") $("#previous").click();
  else if (action === "back10") $("#backward").click();
  else if (action === "forward10") $("#forward").click();
  else if (action === "pause") pausePlayback();
  else if (action === "stop") void stopAndRewind();
  else if (action === "autoScroll") $("#auto-scroll").click();
  else if (action === "scrollLyrics") stepLyrics(1);
  else if (action === "loopIn") markLoopPoint("in");
  else if (action === "loopOut") markLoopPoint("out");
  else if (action === "loopToggle") setLoopEnabled(!selectedSong()?.loopEnabled);
  else if (action === "loopExit") setLoopEnabled(false);
  else if (action === "volumeUp" || action === "volumeDown") {
    const slider = $("#volume");
    slider.value = String(Math.max(0, Math.min(1, Number(slider.value) + (action === "volumeUp" ? 0.05 : -0.05))));
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

async function requestMidiAccess({ notify = false, sysex = false } = {}) {
  if (!navigator.requestMIDIAccess) {
    state.midiPermissionStatus = "unavailable";
    $("#pedal-status").textContent = "API MIDI indisponível neste endereço";
    if ($("#device-access-status")) $("#device-access-status").textContent = hasDeviceAccessOrigin()
      ? "Este browser não disponibiliza a API MIDI. Usa Chrome ou Edge atualizado."
      : "Para aceder a MIDI, áudio e vídeo, abre o StageSet através de localhost ou HTTPS.";
    if (notify) toast("A API MIDI não está disponível neste endereço. Abre o StageSet através de localhost ou HTTPS.");
    return false;
  }
  try {
    state.midiAccess = await navigator.requestMIDIAccess({ software: true, sysex: sysex || state.midiAccess?.sysexEnabled || false });
    state.midiPermissionStatus = "granted";
    state.midiAccess.onstatechange = () => {
      renderMidiInputs();
      renderMidiOutputs();
      void refreshAudioInputDevices();
    };
    $("#connect-pedal").textContent = "Atualizar dispositivos";
    renderMidiInputs();
    renderMidiOutputs();
    return true;
  } catch (error) {
    state.midiPermissionStatus = "denied";
    $("#pedal-status").textContent = "Acesso MIDI recusado";
    $("#pedal-status").classList.remove("connected");
    if (notify) toast(error.name === "NotAllowedError" ? "O browser não autorizou acesso MIDI." : "Não foi possível aceder aos dispositivos MIDI.");
    return false;
  }
}

async function connectMidiPedal() {
  if (!requireStudio()) return;
  await requestMidiAccess({ notify: true });
}

async function initializeDeviceAccessAtStartup() {
  if (!hasDeviceAccessOrigin()) {
    const message = "Para detetar interfaces, abre o StageSet através de localhost ou HTTPS.";
    $("#device-access-status").textContent = message;
    $("#pedal-status").textContent = message;
    return;
  }
  if (navigator.mediaDevices?.addEventListener) {
    navigator.mediaDevices.addEventListener("devicechange", () => { void refreshAudioInputDevices(); });
  }
  await requestMidiAccess();
  await refreshAudioInputDevices({ requestAccess: true });
  await refreshAudioOutputDevices();
}

function selectedSong() {
  return state.songs.find((song) => song.id === state.currentId) ?? null;
}

function currentQueueIndex() {
  return state.setlist.indexOf(state.currentId);
}

function persistSetlist() {
  localStorage.setItem("stageset-setlist", JSON.stringify(state.setlist));
}

function exportSetlistFile() {
  if (!requireStudio()) return;
  if (!state.setlist.length) return toast("A setlist está vazia.");
  const entries = state.setlist.map((id) => state.songs.find((song) => song.id === id)).filter(Boolean).map((song) => ({
    id: song.id, title: song.title, artist: song.artist ?? "", fileName: song.fileName,
    cc: song.setlistCc ?? (Number.isInteger(song.setlistCcValue) ? { channel: state.setlistCcChannel, number: state.setlistCcNumber, value: song.setlistCcValue } : null),
    midi: song.setlistMidi ?? null,
  }));
  const payload = { format: "StageSet Setlist", version: 1, savedAt: new Date().toISOString(), entries, played: entries.filter((entry) => state.playedSongIds.has(entry.id)).map((entry) => entry.id), setlistCcConfig: { enabled: state.setlistCcEnabled, type: state.setlistMidiType, channel: state.setlistCcChannel, number: state.setlistCcNumber }, hideSetlistDuringPlayback: state.hideSetlistDuringPlayback, interSongDelay: state.interSongDelay };
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
  link.download = `StageSet-setlist-${new Date().toISOString().slice(0, 10)}.stagesetlist`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 30000);
  toast("Setlist guardada.");
}

async function importSetlistFile(file) {
  if (!requireStudio()) return;
  try {
    if (file.size > 5 * 1024 * 1024) throw new Error("O ficheiro de setlist excede 5 MB.");
    const data = JSON.parse(await file.text());
    if (data?.format !== "StageSet Setlist" || data.version !== 1 || !Array.isArray(data.entries)) throw new Error("Este ficheiro não é uma setlist StageSet compatível.");
    if (state.setlist.length && !window.confirm("Substituir a setlist atual pela setlist carregada?")) return;
    const used = new Set();
    const idMap = new Map();
    let missing = 0;
    const resolved = [];
    const changedSongs = [];
    for (const entry of data.entries) {
      const candidates = state.songs.filter((song) => !used.has(song.id));
      let song = candidates.find((item) => item.id === entry.id && item.fileName === entry.fileName);
      if (!song) song = candidates.find((item) => item.fileName === entry.fileName && item.title === entry.title && (item.artist ?? "") === (entry.artist ?? ""));
      if (!song) { missing++; continue; }
      used.add(song.id);
      resolved.push(song.id);
      if (typeof entry.id === "string") idMap.set(entry.id, song.id);
      const midi = entry.midi;
      const validMidiEntry = midi && (midi.cc || midi.program);
      if (validMidiEntry) {
        const cc = midi.cc, program = midi.program;
        const validCc = cc && Number.isInteger(cc.channel) && cc.channel >= 0 && cc.channel <= 15 && Number.isInteger(cc.number) && cc.number >= 0 && cc.number <= 127 && Number.isInteger(cc.value) && cc.value >= 0 && cc.value <= 127;
        const validProgram = program && Number.isInteger(program.channel) && program.channel >= 0 && program.channel <= 15 && Number.isInteger(program.value) && program.value >= 0 && program.value <= 127;
        if (validCc || validProgram) {
          song.setlistMidi = {};
          if (validCc) { song.setlistMidi.cc = { channel: cc.channel, number: cc.number, value: cc.value }; song.setlistCc = { ...song.setlistMidi.cc }; song.setlistCcValue = cc.value; }
          if (validProgram) song.setlistMidi.program = { channel: program.channel, value: program.value };
          changedSongs.push(song);
        }
      } else {
        const cc = entry.cc;
        if (cc && Number.isInteger(cc.channel) && cc.channel >= 0 && cc.channel <= 15 && Number.isInteger(cc.number) && cc.number >= 0 && cc.number <= 127 && Number.isInteger(cc.value) && cc.value >= 0 && cc.value <= 127) {
          song.setlistMidi = { ...(song.setlistMidi && !song.setlistMidi.type ? song.setlistMidi : {}), cc: { channel: cc.channel, number: cc.number, value: cc.value } };
          song.setlistCc = { channel: cc.channel, number: cc.number, value: cc.value };
          song.setlistCcValue = cc.value;
          changedSongs.push(song);
        }
      }
    }
    if (!resolved.length && data.entries.length) throw new Error("Nenhuma música da setlist existe nesta biblioteca. Carrega primeiro o show correspondente.");
    await Promise.all(changedSongs.map((song) => dbPut(song)));
    state.setlist = resolved;
    state.playedSongIds = new Set((Array.isArray(data.played) ? data.played : []).map((id) => idMap.get(id)).filter(Boolean));
    localStorage.setItem("stageset-played-song-ids", JSON.stringify([...state.playedSongIds]));
    const config = data.setlistCcConfig;
    if (config && Number.isInteger(config.channel) && config.channel >= 0 && config.channel <= 15 && Number.isInteger(config.number) && config.number >= 0 && config.number <= 127) {
      state.setlistCcEnabled = Boolean(config.enabled); state.setlistMidiType = validSelectTypes.includes(config.type) ? config.type : "cc"; state.setlistCcChannel = config.channel; state.setlistCcNumber = config.number;
      localStorage.setItem("stageset-cc-select-enabled", String(state.setlistCcEnabled));
      localStorage.setItem("stageset-midi-select-type", state.setlistMidiType);
      localStorage.setItem("stageset-cc-select-channel", String(state.setlistCcChannel));
      localStorage.setItem("stageset-cc-select-number", String(state.setlistCcNumber));
    }
    if (typeof data.hideSetlistDuringPlayback === "boolean") { state.hideSetlistDuringPlayback = data.hideSetlistDuringPlayback; localStorage.setItem("stageset-hide-setlist", String(data.hideSetlistDuringPlayback)); }
    if (Number.isFinite(data.interSongDelay)) { state.interSongDelay = Math.max(0, Math.min(3600, data.interSongDelay)); localStorage.setItem("stageset-inter-song-delay", String(state.interSongDelay)); }
    persistSetlist(); renderLibrary(); renderSetlist(); renderPedalMap();
    toast(`Setlist carregada · ${resolved.length} músicas${missing ? ` · ${missing} não encontradas` : ""}.`);
  } catch (error) {
    toast(error.message || "Não foi possível abrir esta setlist.");
  }
}

function saveSetlistPreferences() {
  if (!requireStudio()) return;
  state.hideSetlistDuringPlayback = $("#hide-setlist-during-playback").checked;
  state.interSongDelay = Math.max(0, Math.min(3600, Number($("#inter-song-delay").value) || 0));
  localStorage.setItem("stageset-hide-setlist", String(state.hideSetlistDuringPlayback));
  localStorage.setItem("stageset-inter-song-delay", String(state.interSongDelay));
  localStorage.setItem("stageset-queue-end-action", $("#queue-end-action").value);
  $("#inter-song-delay").value = String(state.interSongDelay);
  state.queueDisplayHidden = false;
  $(".setlist-panel").classList.remove("queue-hidden");
  renderSetlist();
}

function hasValidLoop(song) {
  return Number.isFinite(song?.loopIn) && Number.isFinite(song?.loopOut) && song.loopOut - song.loopIn >= 0.1;
}

function renderLoopControls(song = selectedSong()) {
  const playable = Boolean(song && !isDocumentSong(song));
  const valid = hasValidLoop(song);
  const active = Boolean(valid && song.loopEnabled);
  $("#loop-in").disabled = !playable;
  $("#loop-out").disabled = !playable;
  $("#loop-toggle").disabled = !playable || !valid;
  $("#loop-in").classList.toggle("marked", Number.isFinite(song?.loopIn));
  $("#loop-out").classList.toggle("marked", Number.isFinite(song?.loopOut));
  $("#loop-toggle").classList.toggle("active-tool", active);
  $("#loop-toggle").setAttribute("aria-pressed", String(active));
  $("#loop-toggle").setAttribute("aria-label", active ? "Desativar loop" : "Ativar loop");
  $("#loop-indicator").hidden = !active;
  if (active) $("#loop-indicator").textContent = "LOOP " + formatTime(song.loopIn) + "–" + formatTime(song.loopOut);
}

async function markLoopPoint(point) {
  if (!requireStudio()) return;
  const song = selectedSong();
  if (!song || isDocumentSong(song)) return toast("Escolhe uma faixa de áudio ou MIDI.");
  const position = currentPosition();
  if (point === "in") {
    song.loopIn = position;
    song.loopEnabled = false;
    if (Number.isFinite(song.loopOut) && song.loopOut <= position + 0.1) song.loopOut = null;
  } else {
    const loopIn = Number.isFinite(song.loopIn) ? song.loopIn : 0;
    if (position - loopIn < 0.1) return toast("O fim do loop tem de ficar depois do início.");
    song.loopIn = loopIn;
    song.loopOut = position;
    song.loopEnabled = true;
  }
  await dbPut(song);
  renderLoopControls(song);
  toast(point === "in" ? "Início do loop marcado em " + formatTime(song.loopIn) + "." : "Loop definido: " + formatTime(song.loopIn) + "–" + formatTime(song.loopOut) + ".");
}

async function setLoopEnabled(enabled) {
  const song = selectedSong();
  if (!song || isDocumentSong(song)) return toast("Escolhe uma faixa de áudio ou MIDI.");
  if (enabled && !hasValidLoop(song)) return toast("Marca os pontos A e B antes de ativar o loop.");
  song.loopEnabled = enabled;
  await dbPut(song);
  renderLoopControls(song);
  toast(enabled ? "Loop ativado." : "Loop desativado.");
}

function loopAtEnd(song, position, force = false) {
  if(sessionController?.isSlave())return false;
  if (loopJumping || !song?.loopEnabled || !hasValidLoop(song) || (!force && !isPlaying()) || (!force && position < song.loopOut)) return false;
  loopJumping = true;
  const finish = () => {
    if (!loopJumping) return;
    loopJumping = false;
    renderLoopControls(song);
    updatePlayback();
  };
  if (isMidiSong(song)) {
    midiPlayer.seek(song.loopIn)
      .then(() => force ? midiPlayer.play() : undefined)
      .catch(() => toast("Não foi possível regressar ao início do loop."))
      .finally(finish);
    return true;
  }
  let finished = false;
  let resolveAudioSeek;
  const complete = () => {
    if (finished) return;
    finished = true;
    resolveAudioSeek?.();
    clearTimeout(timeout);
    audio.removeEventListener("seeked", complete);
    finish();
  };
  const timeout = setTimeout(complete, 2500);
  audio.addEventListener("seeked", complete, { once: true });
  try {
    audio.currentTime = song.loopIn;
      seekStemPlayers(song.loopIn);
    const audioSeeked = new Promise((resolve) => {
      resolveAudioSeek = resolve;
      if (!audio.seeking && Math.abs(audio.currentTime - song.loopIn) < 0.05) queueMicrotask(resolveAudioSeek);
    });
    const resumeAudio = force ? audio.play().catch(() => toast("Não foi possível retomar o áudio em loop.")) : Promise.resolve();
    const resumeMidi = hasMidiLayer(song)
      ? midiPlayer.seek(song.loopIn).then(() => force ? midiPlayer.play() : undefined).catch(() => toast("Não foi possível sincronizar o loop MIDI."))
      : Promise.resolve();
    Promise.allSettled([audioSeeked, resumeAudio, resumeMidi]).then(complete);
  } catch {
    complete();
    toast("Este formato não permite procurar para repetir o loop.");
  }
  return true;
}

function renderLibrary() {
  const container = $("#song-library");
  const query = state.query.trim().toLocaleLowerCase();
  const visible = state.songs.filter((song) => {
    if (state.favoritesOnly && !song.favorite) return false;
    if (state.historyOnly && !song.lastPlayedAt) return false;
    return `${song.title} ${song.artist} ${song.fileName} ${(song.tags ?? []).join(" ")}`.toLocaleLowerCase().includes(query);
  });
  const comparators = {
    title: (a, b) => a.title.localeCompare(b.title, "pt", { sensitivity: "base" }),
    artist: (a, b) => (a.artist || "").localeCompare(b.artist || "", "pt", { sensitivity: "base" }) || a.title.localeCompare(b.title, "pt", { sensitivity: "base" }),
    recent: (a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0) || a.title.localeCompare(b.title, "pt", { sensitivity: "base" }),
    played: (a, b) => (b.playCount ?? 0) - (a.playCount ?? 0) || a.title.localeCompare(b.title, "pt", { sensitivity: "base" }),
    history: (a, b) => (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0),
  };
  visible.sort(comparators[state.historyOnly ? "history" : state.librarySort] ?? comparators.title);
  container.innerHTML = "";
  if (!visible.length && state.songs.length) {
    const emptyResult = document.createElement("div");
    emptyResult.className = "library-filter-empty";
    emptyResult.textContent = state.historyOnly ? "Ainda não há músicas reproduzidas." : state.favoritesOnly ? "Ainda não marcaste favoritas." : "Não foram encontradas músicas.";
    container.append(emptyResult);
  }
  for (const song of visible) {
    const row = document.createElement("div");
    row.className = `library-song${song.id === state.currentId ? " selected" : ""}${state.expandedLibrarySongId === song.id ? " expanded" : ""}${setlistHasSong(song.id) ? " in-setlist" : ""}${state.playedSongIds.has(song.id) ? " played" : ""}`;
    row.innerHTML = `<button class="library-select" type="button" aria-expanded="${state.expandedLibrarySongId === song.id}"><span class="song-note">♫</span><span class="library-song-copy"><strong></strong></span><span class="song-duration">${formatTime(song.duration)}</span></button><div class="library-song-details" ${state.expandedLibrarySongId === song.id ? "" : "hidden"}></div><button class="library-action favorite-toggle${song.favorite ? " is-favorite" : ""}" type="button" title="Alternar favorita" aria-label="Alternar favorita" data-studio-only>★</button><button class="library-action library-edit" data-studio-only type="button" title="Renomear ou editar" aria-label="Editar item">✎</button><button class="library-action library-copy" data-studio-only type="button" title="Fazer uma cópia" aria-label="Copiar item">⧉</button><button class="library-action library-delete" data-studio-only type="button" title="Eliminar da biblioteca" aria-label="Eliminar item">×</button><button class="library-action library-cc" data-studio-only type="button" title="Atribuir mensagem MIDI" aria-label="Configurar seleção MIDI">CC</button><button class="library-add" data-studio-only type="button" title="Adicionar à setlist" aria-label="Adicionar à setlist">+</button>`;
    row.insertBefore(row.querySelector(".library-cc"), row.querySelector(".favorite-toggle"));
    row.insertBefore(row.querySelector(".library-add"), row.querySelector(".favorite-toggle"));
    row.querySelectorAll("button").forEach((button, index) => { button.id = `library-${song.id}-${index}`; });
    row.querySelector("strong").textContent = song.title;
    row.querySelector(".song-note").textContent = isDocumentSong(song) ? song.fileName.split(".").at(-1).toUpperCase() : "♫";
    row.querySelector(".song-note").classList.toggle("document-note", isDocumentSong(song));
    const details = row.querySelector(".library-song-details");
    const metadata = [song.artist || "Artista não definido", song.fileName, `Duração: ${formatTime(song.duration)}`, song.bpm ? `BPM: ${song.bpm}` : "", (song.tags ?? []).length ? `Etiquetas: ${song.tags.join(", ")}` : "", song.playCount ? `${song.playCount} ${song.playCount === 1 ? "reprodução" : "reproduções"}` : "", song.lastPlayedAt ? `Última reprodução: ${new Date(song.lastPlayedAt).toLocaleString("pt-PT")}` : ""].filter(Boolean);
    for (const value of metadata) { const item = document.createElement("span"); item.textContent = value; details.append(item); }
    row.querySelector(".song-duration").textContent = isDocumentSong(song) ? "DOC" : formatTime(song.duration);
    row.querySelector(".library-select").addEventListener("click", (event) => {
      clearTimeout(libraryClickTimer);
      const opening = state.expandedLibrarySongId !== song.id;
      state.expandedLibrarySongId = opening ? song.id : null;
      for (const expanded of document.querySelectorAll(".library-song.expanded")) {
        const isCurrent = expanded === row && opening;
        expanded.classList.toggle("expanded", isCurrent);
        expanded.querySelector(".library-song-details")?.toggleAttribute("hidden", !isCurrent);
        expanded.querySelector(".library-select")?.setAttribute("aria-expanded", String(isCurrent));
      }
      row.classList.toggle("expanded", opening);
      details.hidden = !opening;
      row.querySelector(".library-select").setAttribute("aria-expanded", String(opening));
      if (event.detail > 1) { libraryClickTimer = null; return; }
      libraryClickTimer = setTimeout(() => {
        libraryClickTimer = null;
        if (state.currentId !== song.id) void selectSong(song.id);
      }, 500);
    });
    row.querySelector(".library-select").addEventListener("dblclick", (event) => { event.preventDefault(); clearTimeout(libraryClickTimer); libraryClickTimer = null; void selectSong(song.id, true); });
    row.querySelector(".favorite-toggle").setAttribute("aria-label", song.favorite ? `Retirar ${song.title} das favoritas` : `Marcar ${song.title} como favorita`);
    row.querySelector(".favorite-toggle").addEventListener("click", () => toggleFavorite(song.id));
    row.querySelector(".library-edit").setAttribute("aria-label", `Editar ${song.title}`);
    row.querySelector(".library-copy").setAttribute("aria-label", `Copiar ${song.title}`);
    row.querySelector(".library-delete").setAttribute("aria-label", `Eliminar ${song.title}`);
    const midiMap = songMidiSelectMapping(song);
    const badgeType = ({ program: "PC", note: "NOTE", song: "SS", cc: "CC" })[state.setlistMidiType];
    row.querySelector(".library-cc").textContent = midiMap?.type === state.setlistMidiType ? `${badgeType}${midiMap.value}` : badgeType;
    row.querySelector(".library-cc").title = midiMap?.type === state.setlistMidiType ? `${midiMap.type === "song" ? "Song Select" : `Canal ${midiMap.channel + 1}`} · ${badgeType} ${midiMap.type === "cc" ? `${midiMap.number} · valor ${midiMap.value}` : midiMap.value}` : `Atribuir ${midiSelectLabel(state.setlistMidiType)} a esta música`;
    row.querySelector(".library-edit").addEventListener("click", () => openSongEditor(song.id));
    row.querySelector(".library-copy").addEventListener("click", () => copyLibrarySong(song.id));
    row.querySelector(".library-delete").addEventListener("click", () => deleteLibrarySong(song.id));
    row.querySelector(".library-cc").addEventListener("click", () => openSongCcEditor(song.id));
    row.querySelector(".library-add").addEventListener("click", () => addToSetlist(song.id));
    container.append(row);
  }
  const empty = $("#empty-library");
  empty.classList.toggle("visible", state.songs.length === 0);
  container.style.display = state.songs.length === 0 ? "none" : "flex";
  $("#library-count").textContent = String(visible.length).padStart(2, "0");
  $("#set-count").textContent = `${state.songs.length} ${state.songs.length === 1 ? "item" : "itens"} na coleção`;
  $("#library-sort").value = state.librarySort;
  $("#favorites-filter").classList.toggle("active-filter", state.favoritesOnly);
  $("#favorites-filter").setAttribute("aria-pressed", String(state.favoritesOnly));
  $("#history-view").classList.toggle("active-filter", state.historyOnly);
  $("#history-view").setAttribute("aria-pressed", String(state.historyOnly));
  $(".library-meta > span:first-child").textContent = state.historyOnly ? "HISTÓRICO" : state.favoritesOnly ? "FAVORITAS" : "COLEÇÃO";
}

async function toggleFavorite(id) {
  if (!requireStudio()) return;
  const index = state.songs.findIndex((song) => song.id === id);
  if (index < 0) return;
  const updated = { ...state.songs[index], favorite: !state.songs[index].favorite };
  try { await dbPut(updated); }
  catch { return toast("Não foi possível guardar a favorita."); }
  state.songs[index] = updated;
  renderLibrary();
}

async function recordSongPlay(id) {
  state.playedSongIds.add(id);
  localStorage.setItem("stageset-played-song-ids", JSON.stringify([...state.playedSongIds]));
  const index = state.songs.findIndex((song) => song.id === id);
  if (index < 0) return;
  const song = state.songs[index];
  const updated = { ...song, playCount: (song.playCount ?? 0) + 1, lastPlayedAt: Date.now() };
  try { await dbPut(updated); }
  catch { return; }
  state.songs[index] = updated;
  renderLibrary();
  renderSetlist();
}

function openSongEditor(id) {
  if (!requireStudio()) return;
  const song = state.songs.find((item) => item.id === id);
  if (!song) return;
  editingSongId = id;
  $("#song-title-input").value = song.title;
  $("#song-artist-input").value = song.artist ?? "";
  $("#song-tags-input").value = (song.tags ?? []).join(", ");
  $("#song-favorite-input").checked = Boolean(song.favorite);
  $("#song-editor-modal").hidden = false;
  $("#song-title-input").focus();
  $("#song-title-input").select();
}

function closeSongEditor() {
  editingSongId = null;
  $("#song-editor-modal").hidden = true;
}

async function saveSongEditor(event) {
  event.preventDefault();
  if (!requireStudio()) return;
  const index = state.songs.findIndex((song) => song.id === editingSongId);
  if (index < 0) return closeSongEditor();
  const title = $("#song-title-input").value.trim();
  const artist = $("#song-artist-input").value.trim();
  const tags = [...new Set($("#song-tags-input").value.split(",").map((tag) => tag.trim()).filter(Boolean))].slice(0, 24);
  if (!title) return toast("O nome da faixa não pode ficar vazio.");
  const updated = { ...state.songs[index], title, artist, tags, favorite: $("#song-favorite-input").checked };
  try {
    await dbPut(updated);
  } catch {
    return toast("Não foi possível guardar as alterações.");
  }
  state.songs[index] = updated;
  closeSongEditor();
  renderLibrary();
  renderSetlist();
  if (state.currentId === updated.id) syncTrackDetails();
  toast("Faixa atualizada.");
}

function readableMidiLyrics(data) {
  return (data?.lyrics || []).filter(line=>!line.text.startsWith('@')).map(line=>({...line,text:line.text.replace(/^[\\/]+/,'')}));
}

function formatLyricTimestamp(seconds) {
  const centiseconds = Math.max(0,Math.round((Number(seconds)||0)*100));
  return '['+String(Math.floor(centiseconds/6000)).padStart(2,'0')+':'+String(Math.floor(centiseconds/100)%60).padStart(2,'0')+'.'+String(centiseconds%100).padStart(2,'0')+']';
}

function editorLyricsFor(song, target) {
  if (target !== "main") {
    if (Object.hasOwn(song.lyricOutputLyrics ?? {}, target)) return song.lyricOutputLyrics[target] ?? "";

  }
  return song.lyricsText || (state.currentId === song.id ? readableMidiLyrics(midiData).map((line) => formatLyricTimestamp(line.time) + " " + line.text).join("\n") : "") || "";
}

function showLyricsEditorOutput(target, storeDraft = true) {
  if (storeDraft) lyricsEditorDrafts[editingLyricsOutput] = $("#lyrics-editor-text").value;
  editingLyricsOutput = target;
  const song = state.songs.find((item) => item.id === editingLyricsSongId);
  if (!song) return;
  $("#lyrics-editor-text").value = Object.hasOwn(lyricsEditorDrafts, target) ? lyricsEditorDrafts[target] : editorLyricsFor(song, target);
  const output = target === "main" ? null : state.displayOutputs.find((item) => item.id === target);
  $("#lyrics-editor-title").textContent = output ? `Editar letras — ${output.name}` : "Editar letras";
  $("#lyrics-output-context").textContent = `A editar: ${output?.name ?? (target === "main" ? "Palco principal" : `Ecrã ${target}`)}`;
  $("#lyrics-output-context").style.borderColor = output?.color || "";
  $("#lyrics-output-context").style.color = output?.color || "";
  $("#lyrics-output-context").style.backgroundColor = output ? colorWithAlpha(output.color, 0.14) : "";
  $("#lyrics-editor-modal .lyrics-editor-modal").style.borderColor = output?.color || "";
  $("#lyrics-editor-output-label").hidden = lyricsEditorOutputOnly;
  $("#lyrics-output-target").hidden = lyricsEditorOutputOnly;
  if (output) {
    $("#lyrics-color-picker").value = output.color;
    $("#lyrics-color-preview").style.backgroundColor = output.color;
  } else {
    $("#lyrics-color-picker").value = state.lyricHighlightColor;
    $("#lyrics-color-preview").style.backgroundColor = state.lyricHighlightColor;
  }
  renderLyricsEditorPreview();
  const prefs = lyricOutputSettings(song, target);
  const fontSize = Math.max(16, Math.min(96, Number(prefs.fontSize) || (target === "main" ? 25 : 42)));
  $("#lyrics-output-font-size").value = String(fontSize);
  $("#lyrics-output-font-label").textContent = `${fontSize} px`;
  $("#lyrics-output-highlight").value = prefs.highlightColor || (target === "main" ? song.lyricHighlightColor || state.lyricHighlightColor : output?.color || "#65e2c1");
  $("#lyrics-export-kar").disabled = false;
  $("#lyrics-export-midi").disabled = false;
  $("#lyrics-bpm").disabled = target !== "main";
  $("#lyrics-save-button").textContent = target === "main" ? "Guardar letras e tempos" : `Guardar letras de ${output?.name ?? `Ecrã ${target}`}`;
}

async function saveLyricOutputSettings(target, patch) {
  const index = state.songs.findIndex((song) => song.id === (editingLyricsSongId || state.currentId));
  if (index < 0) return;
  const song = state.songs[index];
  const key = target === "main" ? "lyricDisplaySettings" : "lyricOutputSettings";
  const updated = { ...song, [key]: target === "main" ? { ...(song.lyricDisplaySettings ?? {}), ...patch } : { ...(song.lyricOutputSettings ?? {}), [target]: { ...(song.lyricOutputSettings?.[target] ?? {}), ...patch } } };
  if (target === "main" && patch.highlightColor) {
    updated.lyricHighlightColor = patch.highlightColor;
    state.lyricHighlightColor = patch.highlightColor;
    localStorage.setItem("stageset-lyric-highlight", patch.highlightColor);
  }
  state.songs[index] = updated;
  await dbPut(updated).catch(() => toast("Não foi possível guardar as preferências de letra."));
  if (target === "main" && state.currentId === updated.id) renderLyrics();
  broadcastLyricWindows(currentRenderedLyricLines(), [...document.querySelectorAll("#lyrics-content .lyric-line")].findIndex((line) => line.classList.contains("current")));
}

function previewLyricOutputSettings(target, patch) {
  const index = state.songs.findIndex((song) => song.id === editingLyricsSongId);
  if (index < 0) return;
  const song = state.songs[index];
  const key = target === "main" ? "lyricDisplaySettings" : "lyricOutputSettings";
  const updated = { ...song, [key]: target === "main" ? { ...(song.lyricDisplaySettings ?? {}), ...patch } : { ...(song.lyricOutputSettings ?? {}), [target]: { ...(song.lyricOutputSettings?.[target] ?? {}), ...patch } } };
  state.songs[index] = updated;
  if (target === "main" && patch.highlightColor) state.lyricHighlightColor = patch.highlightColor;
  if (target !== "main") broadcastLyricWindows(currentRenderedLyricLines(), [...document.querySelectorAll("#lyrics-content .lyric-line")].findIndex((line) => line.classList.contains("current")));
}

function openLyricsEditor(target = "main", outputOnly = false) {
  if (!requireStudio()) return;
  const song = selectedSong();
  if (!song || isDocumentSong(song)) return toast("Escolhe uma música antes de editar as letras.");
  editingLyricsSongId = song.id;
  editingLyricsOutput = target;
  lyricsEditorOutputOnly = outputOnly;
  lyricsEditorDrafts = {};
  $("#lyrics-output-target").value = target;
  const savedBpm = song.bpm || (state.currentId === song.id ? midiData?.tempo : null) || 120;
  $("#lyrics-bpm").value = savedBpm ? String(savedBpm) : "";
  $("#lyrics-color-picker").value = state.lyricHighlightColor;
  $("#lyrics-color-preview").style.backgroundColor = state.lyricHighlightColor;
  showLyricsEditorOutput(target, false);
  updateLyricShortcutStatus();
  $("#lyrics-editor-modal").hidden = false;
  $("#lyrics-editor-text").focus();
}

function closeLyricsEditor() {
  clearTimeout(lyricsAutoSaveTimer);
  void autoSaveLyricsDraft();
  editingLyricsSongId = null;
  editingLyricsOutput = "main";
  lyricsEditorOutputOnly = false;
  $("#lyrics-editor-title").textContent = "Editar letras";
  $("#lyrics-editor-output-label").hidden = false;
  $("#lyrics-output-target").hidden = false;
  lyricsEditorDrafts = {};
  $("#lyrics-editor-modal").hidden = true;
}

function mergedLyricsDraft(song) {
  const outputLyrics = { ...(song.lyricOutputLyrics ?? {}) };
  for (const [target,text] of Object.entries(lyricsEditorDrafts)) if(target !== 'main') outputLyrics[target] = text;
  const updated = {...song,lyricOutputLyrics:outputLyrics};
  if(Object.hasOwn(lyricsEditorDrafts,'main')) {
    updated.lyricsText = lyricsEditorDrafts.main;
    const parsed = parseLyrics(updated.lyricsText); updated.lyricLines = parsed.timeLines; updated.midiLyricLines = parsed.barBeatLines;
  }
  const bpm = Number($('#lyrics-bpm').value);
  if(Number.isFinite(bpm) && bpm >= 20 && bpm <= 300) updated.bpm = bpm;
  return updated;
}

async function saveLyricsEditor(event) {
  event.preventDefault(); if(!requireStudio()) return;
  clearTimeout(lyricsAutoSaveTimer);
  const song = state.songs.find(item=>item.id===editingLyricsSongId); if(!song)return;
  const bpm = Number($('#lyrics-bpm').value);
  if(!Number.isFinite(bpm)||bpm<20||bpm>300)return toast('O BPM deve estar entre 20 e 300.');
  lyricsEditorDrafts[editingLyricsOutput] = $('#lyrics-editor-text').value;
  const updated = mergedLyricsDraft(song);
  try { await dbPut(updated); } catch { return toast('Não foi possível guardar as letras.'); }
  state.songs[state.songs.findIndex(item=>item.id===updated.id)] = updated;
  closeLyricsEditor(); if(state.currentId===updated.id)renderLyrics();
  toast('Letras e tempos de todas as saídas editadas guardados.');
}

async function autoSaveLyricsDraft() {
  if(!editingLyricsSongId || $('#lyrics-editor-modal').hidden)return;
  const song = state.songs.find(item=>item.id===editingLyricsSongId); if(!song)return;
  lyricsEditorDrafts[editingLyricsOutput] = $('#lyrics-editor-text').value;
  const updated = mergedLyricsDraft(song);
  state.songs[state.songs.findIndex(item=>item.id===updated.id)] = updated;
  try { await dbPut(updated); if(state.currentId===updated.id)renderLyrics(); }
  catch { toast('Não foi possível guardar o rascunho.'); }
}

async function exportLyricsMidi(extension = "kar") {
  if (!requireStudio()) return;
  const song = state.songs.find((item) => item.id === editingLyricsSongId);
  if (!song) return toast("Escolhe uma música antes de exportar as letras.");
  const text = $("#lyrics-editor-text").value;
  const bpmValue = $("#lyrics-bpm").value.trim();
  const requestedBpm = bpmValue ? Number(bpmValue) : null;
  if (requestedBpm !== null && (!Number.isFinite(requestedBpm) || requestedBpm < 20 || requestedBpm > 300)) return toast("O BPM deve estar entre 20 e 300.");
  const parsed = parseLyrics(text);
  const midiBlob = isMidiSong(song) ? song.audioBlob : song.midiBlob;
  let sourceBuffer = null, sourceData = null;
  try {
    if (midiBlob) {
      sourceBuffer = await midiBlob.arrayBuffer();
      sourceData = parseMidiFile(sourceBuffer);
    }
  } catch (error) {
    return toast(error.message || "Não foi possível ler a faixa MIDI associada.");
  }
  const bpm = requestedBpm ?? song.bpm ?? sourceData?.tempo ?? midiData?.tempo ?? 120;
  const lyricEvents = [...parsed.timeLines];
  if (sourceData) {
    for (const line of parsed.barBeatLines) {
      const sourceTime = sourceData.barBeatToSeconds(line.bar, line.beat);
      lyricEvents.push({ time: sourceTime * (sourceData.tempo && bpm ? sourceData.tempo / bpm : 1), text: line.text, sourceIndex: line.sourceIndex });
    }
  }
  lyricEvents.sort((a, b) => a.time - b.time);
  if (!lyricEvents.some((line) => String(line.text ?? "").trim())) {
    return toast(sourceData ? `Adiciona timestamps [min:seg] ou [compasso:tempo] antes de exportar o ${extension.toUpperCase()}.` : `Adiciona timestamps [min:seg] antes de exportar o ${extension.toUpperCase()}.`);
  }
  const baseName = String(song.title || song.fileName || "letras")
    .replace(/[\\/:*?"<>|]+/g, "-").replace(/[. ]+$/g, "").trim() || "letras";
  let midiBytes;
  try {
    midiBytes = createKaraokeMidi({ sourceBuffer, sourceData, lyricEvents, title: song.title, artist: song.artist, bpm });
  } catch (error) {
    return toast(error.message || `Não foi possível gerar o ficheiro ${extension.toUpperCase()}.`);
  }
  const blob = new Blob([midiBytes], { type: "audio/midi" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  const outputName = editingLyricsOutput === "main" ? "Palco" : (state.displayOutputs.find((output) => output.id === editingLyricsOutput)?.name || "Saida");
  link.download = `${baseName}-${outputName.replace(/[\\/:*?"<>|]+/g, "-")}.${extension}`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  toast(sourceBuffer ? `${extension.toUpperCase()} exportado com as letras e a faixa MIDI original.` : `${extension.toUpperCase()} exportado com os tempos; este ficheiro não contém o áudio original.`);
}

function saveLyricShortcut(shortcut) {
  const index = state.songs.findIndex((song) => song.id === editingLyricsSongId);
  state.lyricShortcutLearning = false;
  if (index < 0) return;
  const updated = { ...state.songs[index], lyricShortcut: shortcut };
  state.songs[index] = updated;
  dbPut(updated).catch(() => toast("Não foi possível guardar o atalho."));
  $("#lyrics-learn-shortcut").textContent = "Aprender atalho";
  $("#lyrics-shortcut-status").textContent = shortcut.type === "key" ? shortcut.label : "MIDI nota " + (shortcut.number + 1) + " · canal " + (shortcut.channel + 1);
  toast("Atalho de sincronização aprendido.");
}

function updateLyricShortcutStatus() {
  const shortcut = state.songs.find((song) => song.id === editingLyricsSongId)?.lyricShortcut;
  $("#lyrics-shortcut-status").textContent = !shortcut ? "Sem atalho" : shortcut.type === "key" ? shortcut.label : "MIDI nota " + (shortcut.number + 1) + " · canal " + (shortcut.channel + 1);
}

function applyLyricColorToSelection() {
  const textarea = $("#lyrics-editor-text"), start = textarea.selectionStart, end = textarea.selectionEnd;
  if (start === end) return toast("Seleciona primeiro a palavra ou frase a colorir.");
  const color = $("#lyrics-color-picker").value;
  const source = textarea.value, timestamp = /^\s*(?:\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\]|\[\d{1,4}:\d{1,2}\])\s*/;
  const segments = [];
  let lineStart = 0;
  for (const line of source.split("\n")) {
    const lineEnd = lineStart + line.length;
    const selectedStart = Math.max(start, lineStart, lineStart + (timestamp.exec(line)?.[0].length ?? 0));
    const selectedEnd = Math.min(end, lineEnd);
    if (selectedStart < selectedEnd) segments.push([selectedStart, selectedEnd]);
    lineStart = lineEnd + 1;
  }
  if (!segments.length) return toast("A seleção não contém texto de letra para colorir.");
  let replacement = "", cursor = start;
  for (const [segmentStart, segmentEnd] of segments) {
    replacement += source.slice(cursor, segmentStart) + `[color=${color}]` + source.slice(segmentStart, segmentEnd) + "[/color]";
    cursor = segmentEnd;
  }
  replacement += source.slice(cursor, end);
  textarea.setRangeText(replacement, start, end, "select");
  renderLyricsEditorPreview();
  if (editingLyricsOutput === "main") {
    const index = state.songs.findIndex((song) => song.id === editingLyricsSongId);
    if (index >= 0) {
      const updated = { ...state.songs[index], lyricsText: textarea.value };
      updated.lyricLines = parseLyrics(updated.lyricsText).timeLines;
      state.songs[index] = updated;
      renderLyrics();
      broadcastLyricWindows(currentRenderedLyricLines(), [...document.querySelectorAll("#lyrics-content .lyric-line")].findIndex((line) => line.classList.contains("current")));
    }
  }
}

function openLyricDisplayWindows() {
  state.displayOutputs.forEach((output,index) => {
    if(state.displayWindows[index] && !state.displayWindows[index].closed)return;
    const url = new URL('./lyric-window.html',location.href);url.searchParams.set('output',output.id);
    state.displayWindows[index] = window.open(url.href,outputWindowName(output),'popup,width=1100,height=700,resizable=yes');
    if(!state.displayWindows[index])toast('Permite pop-ups para abrir ecrãs de letras adicionais.');
  });
  $('#settings-modal').hidden=true;
}

function renderDisplayOutputSettings() {
  const container = $("#display-output-list");
  if (!container) return;
  container.replaceChildren();
  state.displayOutputs.forEach((output, index) => {
    const row = document.createElement("div"); row.className = "display-output-row";row.dataset.learnScope="output-"+output.id;
    const name = document.createElement("input"); name.value = output.name; name.maxLength = 40; name.setAttribute("aria-label", `Nome da janela ${index + 1}`);
    name.addEventListener("change", () => { output.name = name.value.trim() || `Ecrã ${index + 1}`; saveDisplayOutputs(); renderDisplayOutputSettings(); showLyricsEditorOutput(editingLyricsOutput, false); broadcastLyricWindows(currentRenderedLyricLines(), [...document.querySelectorAll("#lyrics-content .lyric-line")].findIndex((line) => line.classList.contains("current"))); });
    const color = document.createElement("input"); color.type = "color"; color.value = output.color; color.setAttribute("aria-label", `Cor da janela ${index + 1}`);
    const display = document.createElement("select"); display.setAttribute("aria-label", `Saída de vídeo de ${output.name}`); display.add(new Option("Ecrã atual", ""));
    for (const item of availableDisplays) display.add(new Option(item.name + (item.primary ? " (principal)" : ""), item.id));
    display.value = output.displayId || ""; display.disabled = !window.stageSetDesktop?.assignDisplay;
    display.addEventListener("change", () => { output.displayId = display.value; saveDisplayOutputs(); void window.stageSetDesktop.assignDisplay(outputWindowName(output), display.value); });
    color.addEventListener("input", () => { output.color = color.value; saveDisplayOutputs(); if (editingLyricsOutput === output.id) showLyricsEditorOutput(output.id, false); broadcastLyricWindows(currentRenderedLyricLines(), [...document.querySelectorAll("#lyrics-content .lyric-line")].findIndex((line) => line.classList.contains("current"))); });
    const edit = document.createElement("button"); edit.type = "button"; edit.className = "backup-button"; edit.textContent = "Editar letras"; edit.addEventListener("click", () => { $("#settings-modal").hidden = true; openLyricsEditor(output.id, true); });
    const size = document.createElement("input"); size.type = "number"; size.min = "16"; size.max = "96"; size.step = "1"; size.value = String(Number(lyricOutputSettings(selectedSong() || {}, output.id).fontSize) || 42); size.title = "Tamanho da letra para a música atual"; size.setAttribute("aria-label", `Tamanho de letra de ${output.name}`);
    size.addEventListener("input", () => { const value = Number(size.value); if (!selectedSong() || !Number.isFinite(value) || value < 16 || value > 96) return; void saveLyricOutputSettings(output.id, { fontSize: value }); });
    const remove = document.createElement("button"); remove.type = "button"; remove.className = "backup-button"; remove.textContent = "Remover"; remove.disabled = state.displayOutputs.length <= 1;
    remove.addEventListener("click", () => { state.displayOutputs.splice(index, 1); state.displayWindows.splice(index, 1).forEach((ref) => { try { ref?.close(); } catch {} }); saveDisplayOutputs(); renderDisplayOutputSettings(); refreshMosaic(); void refreshDisplays(); });
    const background=document.createElement('button');background.type='button';background.className='backup-button';background.textContent='Fundo';background.onclick=()=>backgroundEditor.select(output.id);
    row.append(name, color, display, size, edit, background, remove); container.append(row);
  });
  $("#create-display-output").disabled = state.displayOutputs.length >= 8;
  backgroundEditor?.refresh();
}

let availableDisplays = [];
async function refreshDisplays() {
  if (!window.stageSetDesktop?.listDisplays) { $("#display-selection-status").textContent = "A seleção automática de ecrãs está disponível na aplicação de desktop."; return; }
  availableDisplays = await window.stageSetDesktop.listDisplays();
  $("#display-selection-status").textContent = `${availableDisplays.length} ecrã(s) detetado(s).`;
  for (const [selector, target, key] of [["#main-display-select", "main", "stageset-main-display"], ["#mosaic-display-select", "stageset-lyrics-mosaic", "stageset-mosaic-display"]]) {
    const select = $(selector); select.replaceChildren(new Option("Ecrã atual", ""));
    for (const item of availableDisplays) select.add(new Option(item.name + (item.primary ? " (principal)" : ""), item.id));
    select.value = localStorage.getItem(key) || "";
    if (select.value) await window.stageSetDesktop.assignDisplay(target, select.value);
    select.onchange = () => { localStorage.setItem(key, select.value); void window.stageSetDesktop.assignDisplay(target, select.value); };
  }
  for (const [index, output] of state.displayOutputs.entries()) await window.stageSetDesktop.assignDisplay(outputWindowName(output), output.displayId || "");
  renderDisplayOutputSettings();
}

function saveDisplayOutputs() {
  localStorage.setItem("stageset-display-outputs", JSON.stringify(state.displayOutputs));
  const select = $("#lyrics-output-target"), selected = select.value;
  select.replaceChildren(new Option("Palco principal", "main"));
  state.displayOutputs.forEach((output) => select.add(new Option(output.name, output.id)));
  if ([...select.options].some((option) => option.value === selected)) select.value = selected;
}

function addDisplayOutput() {
  if (state.displayOutputs.length >= 8) return toast("Podes criar até oito janelas de letras.");
  const name = $("#new-display-output-name").value.trim();
  if (!name) return toast("Escreve um nome para a nova janela.");
  state.displayOutputs.push({ id: crypto.randomUUID(), name: name.slice(0, 40), color: $("#new-display-output-color").value });
  $("#new-display-output-name").value = "";
  saveDisplayOutputs();
  renderDisplayOutputSettings();
  toast(`Janela “${name}” criada.`);
}

function openLyricsMosaic() {
  if(state.mosaicWindow&&!state.mosaicWindow.closed){state.mosaicWindow.focus();return;}
  state.mosaicWindow=window.open(new URL('./mosaic.html',location.href).href,'stageset-lyrics-mosaic','popup,width=1200,height=800,resizable=yes');
  if(!state.mosaicWindow)toast('Permite pop-ups para abrir o mosaico de letras.');
}
function refreshMosaic(){broadcastLyricWindows(currentRenderedLyricLines(),[...document.querySelectorAll('#lyrics-content .lyric-line')].findIndex(line=>line.classList.contains('current')));}
window.addEventListener('message',event=>{
  if(event.origin!==location.origin)return;
  const mosaic=event.source===state.mosaicWindow;
  const windowIndex=state.displayWindows.findIndex(ref=>ref===event.source);
  if(!mosaic && windowIndex<0)return;
  const d=event.data;
  if(d?.type==='stageset-mosaic-ready'||d?.type==='stageset-output-ready'){sentBackgrounds.delete(event.source);void refreshDisplays().then(refreshMosaic);return;}
  if(d?.type==='stageset-mosaic-timestamps' && mosaic){localStorage.setItem('stageset-mosaic-timestamps',String(!!d.value));refreshMosaic();return;}
  if(!['stageset-mosaic-setting','stageset-output-setting'].includes(d?.type))return;
  const output=state.displayOutputs.find(o=>o.id===d.output);if(!output || (!mosaic && state.displayOutputs[windowIndex]!==output))return;
  if(typeof d.visible==='boolean'){output.mosaicVisible=d.visible;saveDisplayOutputs();refreshMosaic();}
  if(Number.isInteger(d.fontSize)&&d.fontSize>=16&&d.fontSize<=96)void saveLyricOutputSettings(output.id,{fontSize:d.fontSize});
  if(typeof d.displayId==='string'&&window.stageSetDesktop?.assignDisplay&&(d.displayId===''||availableDisplays.some(display=>display.id===d.displayId))){output.displayId=d.displayId;saveDisplayOutputs();void window.stageSetDesktop.assignDisplay(outputWindowName(output),d.displayId);refreshMosaic();}
});


function setLyricHighlightColor(color) {
  if (!/^#[\da-f]{6}$/i.test(color)) return;
  state.lyricHighlightColor = color;
  localStorage.setItem("stageset-lyric-highlight", color);
  if (!$("#lyrics-editor-modal").hidden) $("#lyrics-color-picker").value = color;
  renderLyrics();
}

function adjustStageLyricSize(delta) {
  const song = selectedSong();
  if (!song || isDocumentSong(song)) return;
  const size = Math.max(16, Math.min(96, (Number(song.lyricDisplaySettings?.fontSize) || 25) + delta));
  const updated = { ...song, lyricDisplaySettings: { ...(song.lyricDisplaySettings ?? {}), fontSize: size } };
  const index = state.songs.findIndex((item) => item.id === song.id);
  if (index >= 0) state.songs[index] = updated;
  $("#lyrics-content").style.setProperty("--lyric-font-size", size + "px");
  $("#lyric-size-label").textContent = Math.round(size / 25 * 100) + "%";
  broadcastLyricWindows(currentRenderedLyricLines(), [...document.querySelectorAll("#lyrics-content .lyric-line")].findIndex((line) => line.classList.contains("current")));
  void dbPut(updated).catch(() => toast("Não foi possível guardar o tamanho de letra desta música."));
}

function openTimelineEditor() {
  if (!requireStudio()) return;
  const song = selectedSong();
  if (!song || isDocumentSong(song)) return toast("Escolhe uma faixa de áudio ou MIDI primeiro.");
  $("#timeline-midi-channel").innerHTML = Array.from({ length: 16 }, (_, channel) => "<option value=\"" + channel + "\">Canal " + (channel + 1) + "</option>").join("");
  $("#timeline-bpm").value = String(Math.max(20, Math.min(300, Number(song.bpm || midiData?.tempo || 120))));
  state.timelineUndo = [];
  $("#timeline-zoom-label").textContent = `${Math.round(state.timelineZoom * 100)}%`;
  $("#timeline-editor-modal").hidden = false;
  drawTimelineEditor();
  loadTimelineWaveform(song).then(drawTimelineEditor);
  void refreshStemDeckConnection();
}

async function stemDeckApi(path, options = {}) {
  const response = await fetch(`/api/stemdeck${path}`, options);
  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok) {
    let message = `StemDeck respondeu com erro (${response.status}).`;
    if (contentType.includes("json")) {
      const body = await response.json().catch(() => ({}));
      message = body.detail || body.message || message;
    }
    throw new Error(message);
  }
  return response;
}

function setStemDeckConnection(online, message) {
  const indicator = $("#stem-split-connection");
  const run = $("#stem-split-run");
  if (!indicator || !run) return;
  indicator.textContent = message;
  indicator.classList.toggle("offline", !online);
  const song = selectedSong();
  const supported = Boolean(song?.audioBlob && /\.(mp3|wav|flac|ogg|opus|m4a|mp4)$/i.test(song.fileName ?? ""));
  const zipProvider = localStorage.getItem("stageset-stem-provider") === "zip";
  run.disabled = zipProvider || !supported || Boolean(stemDeckJobId);
  run.textContent = online ? "Separar e importar" : "Abrir StemDeck e separar";
  if (zipProvider) { indicator.textContent = "Importação de stems externos ativa"; $("#stem-split-status").textContent = "Usa Pistas para importar WAVs ou um ZIP exportado por outro separador."; return; }
  if (online && !supported) $("#stem-split-status").textContent = "Esta faixa não tem um formato de áudio suportado pelo StemDeck.";
  else if (online) $("#stem-split-status").textContent = "Escolhe as partes a extrair e inicia a separação.";
}

async function refreshStemDeckConnection() {
  if (localStorage.getItem("stageset-stem-provider") === "zip") { setStemDeckConnection(false, "Importação externa de stems"); return; }
  if (location.protocol === "file:") {
    setStemDeckConnection(false, "Abre o StageSet pelo servidor local ou pela app desktop");
    $("#stem-split-status").textContent = "A integração requer StageSet aberto em http://127.0.0.1:4177 ou na aplicação desktop.";
    return;
  }
  setStemDeckConnection(false, "A verificar StemDeck…");
  try {
    const response = await stemDeckApi("/health");
    const health = await response.json();
    setStemDeckConnection(true, `StemDeck ligado${health.version ? ` · ${health.version}` : ""}`);
  } catch {
    setStemDeckConnection(false, "StemDeck não ligado · porta 8765");
    $("#stem-split-status").textContent = "Inicia o StemDeck neste computador e volta a verificar a ligação.";
  }
}

async function launchStemDeck(chooseFirst = false) {
  const desktopBridge = window.stageSetDesktop;
  if (!desktopBridge) return toast("Para abrir StemDeck a partir do StageSet, usa a aplicação desktop e escolhe StemDeck instalado.");
  try {
    if (chooseFirst) {
      const selected = await desktopBridge.selectStemDeck();
      if (selected?.canceled) return;
    }
    let result = await desktopBridge.launchStemDeck();
    if (!result?.configured && !chooseFirst) {
      const selected = await desktopBridge.selectStemDeck();
      if (selected?.canceled) return;
      result = await desktopBridge.launchStemDeck();
    }
    if (!result?.configured && !result?.launched) return toast("Escolhe primeiro o ficheiro StemDeck.exe.");
    $("#stem-split-status").textContent = "A abrir StemDeck localmente e a aguardar o serviço de separação…";
    for (let attempt = 0; attempt < 12; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await refreshStemDeckConnection();
      if ($("#stem-split-connection").textContent.includes("StemDeck ligado")) return;
    }
    toast("StemDeck abriu; a separação fica disponível quando o serviço local estiver pronto.");
  } catch (error) { toast(error.message || "Não foi possível iniciar o StemDeck selecionado."); }
}

async function splitCurrentSongStems() {
  if (!requireStudio()) return;
  const song = selectedSong();
  if (!song?.audioBlob) return toast("Escolhe uma música com áudio primeiro.");
  if (!/\.(mp3|wav|flac|ogg|opus|m4a|mp4)$/i.test(song.fileName ?? "")) return toast("O StemDeck não aceita este formato de áudio.");
  const stems = [...document.querySelectorAll('input[name="stem-split-name"]:checked')].map((input) => input.value);
  if (!stems.length) return toast("Seleciona pelo menos uma parte para separar.");
  if ((song.audioStems?.length ?? 0) + stems.length > 31) return toast("Esta música já não tem espaço para tantas pistas. Remove algumas no mixer primeiro.");

  const run = $("#stem-split-run"), cancel = $("#stem-split-cancel"), status = $("#stem-split-status");
  run.disabled = true;
  $("#stem-split-check").disabled = true;
  cancel.hidden = false;
  stemDeckJobId = null;
  stemDeckCancelRequested = false;
  status.textContent = "A enviar o áudio ao StemDeck local…";
  try {
    try { await stemDeckApi("/health"); }
    catch {
      const bridge = window.stageSetDesktop;
      if (!bridge) throw new Error("Inicia o StemDeck neste computador, ou usa a aplicação StageSet desktop para o abrir automaticamente.");
      let launched = await bridge.launchStemDeck();
      if (!launched?.configured && !launched?.launched) {
        const selected = await bridge.selectStemDeck();
        if (selected?.canceled) throw new Error("A seleção do StemDeck foi cancelada.");
        launched = await bridge.launchStemDeck();
      }
      if (!launched?.configured && !launched?.launched) throw new Error("Escolhe o ficheiro StemDeck.exe no botão ‘Escolher StemDeck’.");
      let ready = false;
      for (let attempt = 0; attempt < 30; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        try { await stemDeckApi("/health"); ready = true; break; } catch {}
      }
      if (!ready) throw new Error("O StemDeck abriu, mas o serviço local ainda não está disponível. Confirma a instalação e os modelos do StemDeck.");
    }
    const form = new FormData();
    const audioFile = new File([song.audioBlob], song.fileName || "audio.wav", { type: song.audioBlob.type || "application/octet-stream" });
    form.append("file", audioFile);
    form.append("stems", JSON.stringify(stems));
    const createdResponse = await stemDeckApi("/jobs", { method: "POST", body: form });
    const created = await createdResponse.json();
    stemDeckJobId = created.job_id ?? created.id;
    if (!stemDeckJobId) throw new Error("O StemDeck não devolveu o identificador da tarefa.");
    if (stemDeckCancelRequested) {
      await stemDeckApi(`/jobs/${encodeURIComponent(stemDeckJobId)}/cancel`, { method: "POST" });
      status.textContent = "Separação cancelada.";
      return;
    }

    let job;
    while (!stemDeckCancelRequested) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const jobResponse = await stemDeckApi(`/jobs/${encodeURIComponent(stemDeckJobId)}`);
      job = await jobResponse.json();
      const stateLabel = String(job.status ?? job.state ?? "a processar").toLowerCase();
      const progress = Number(job.progress ?? job.percent);
      status.textContent = `${job.phase ?? job.message ?? "Separação em curso"}${Number.isFinite(progress) ? ` · ${Math.round(progress)}%` : ""}`;
      if (["completed", "complete", "done", "finished", "success"].includes(stateLabel)) break;
      if (["failed", "error", "cancelled", "canceled", "stopped", "unavailable"].includes(stateLabel)) throw new Error(job.error || job.message || `Separação ${stateLabel}.`);
    }
    if (stemDeckCancelRequested) {
      status.textContent = "Separação cancelada.";
      return;
    }
    if (!state.songs.some((item) => item.id === song.id)) throw new Error("A música foi removida antes de terminar a separação.");

    status.textContent = "A transferir os stems para o mixer…";
    const stemFiles = [];
    const stemLabels = { vocals: "Voz", drums: "Bateria", bass: "Baixo", guitar: "Guitarra", piano: "Piano", other: "Outros" };
    for (const name of stems) {
      const stemResponse = await stemDeckApi(`/jobs/${encodeURIComponent(stemDeckJobId)}/stems/${name}.wav`);
      stemFiles.push(new File([await stemResponse.blob()], `${stemLabels[name] ?? name}.wav`, { type: "audio/wav" }));
    }
    await addAudioStems(stemFiles, song);
    status.textContent = `${stemFiles.length} pistas importadas no mixer.`;
  } catch (error) {
    status.textContent = error.message || "Não foi possível separar esta música.";
    toast(error.message || "Não foi possível separar esta música.");
  } finally {
    stemDeckJobId = null;
    stemDeckCancelRequested = false;
    cancel.hidden = true;
    $("#stem-split-check").disabled = false;
    void refreshStemDeckConnection();
  }
}

async function cancelStemDeckSplit() {
  stemDeckCancelRequested = true;
  if (!stemDeckJobId) return;
  try { await stemDeckApi(`/jobs/${encodeURIComponent(stemDeckJobId)}/cancel`, { method: "POST" }); }
  catch (error) { $("#stem-split-status").textContent = error.message || "Não foi possível cancelar a separação."; }
}

async function loadTimelineWaveform(song) {
  if (timelineWaveformSongId === song.id) return;
  timelineWaveform = null; timelineWaveformSongId = song.id;
  if (!song.audioBlob || isMidiSong(song)) return;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const decoded = await context.decodeAudioData(await getPlayableAudioBlob(song).arrayBuffer());
    const channel = decoded.getChannelData(0), buckets = 900, step = Math.max(1, Math.floor(channel.length / buckets)), peaks = new Float32Array(buckets);
    for (let bucket = 0; bucket < buckets; bucket++) { let peak = 0; for (let i = bucket * step; i < Math.min(channel.length, (bucket + 1) * step); i++) peak = Math.max(peak, Math.abs(channel[i])); peaks[bucket] = peak; }
    timelineWaveform = peaks; await context.close();
  } catch { timelineWaveform = null; }
}

function drawTimelineEditor() {
  const canvas = $("#timeline-canvas"), ctx = canvas?.getContext("2d"), song = selectedSong();
  if (!ctx || !song) return;
  const h = canvas.height, left = 92;
  const baseWidth = 1200, w = Math.round(baseWidth * state.timelineZoom);
  if (canvas.width !== w) canvas.width = w;
  const right = w - 16;
  const duration = Math.max(1, currentDuration(), midiData?.duration ?? 0);
  const xAt = (time) => left + Math.max(0, Math.min(duration, time)) / duration * (right - left);
  const ruler = 38, audioY = 142, midiY = 332, ccY = 435, lyricY = 530;
  ctx.clearRect(0, 0, w, h); ctx.fillStyle = "#121922"; ctx.fillRect(0, 0, w, h);
  const rows = [["TEMPO", 0, ruler], ["ÁUDIO", ruler, audioY], ["PIANO ROLL", audioY, midiY], ["CONTROLADORES", midiY, ccY], ["LETRAS", ccY, h]];
  rows.forEach(([label, top, bottom], index) => { ctx.fillStyle = index % 2 ? "#18212b" : "#151e27"; ctx.fillRect(0, top, w, bottom - top); ctx.fillStyle = "#8c9ba8"; ctx.font = "10px monospace"; ctx.fillText(label, 12, top + 20); ctx.strokeStyle = "#2c3743"; ctx.beginPath(); ctx.moveTo(0, bottom); ctx.lineTo(w, bottom); ctx.stroke(); });
  const bpm = Math.max(20, Math.min(300, Number($("#timeline-bpm")?.value || song.bpm || midiData?.tempo || 120)));
  const beatSeconds = 60 / bpm, beatCount = Math.ceil(duration / beatSeconds);
  for (let beat = 0; beat <= beatCount; beat++) {
    const time = beat * beatSeconds, x = xAt(time), bar = beat % 8 === 0;
    ctx.strokeStyle = bar ? "#536577" : "#283440"; ctx.lineWidth = bar ? 1.4 : 0.7; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    if (bar) { ctx.fillStyle = "#b3c1ce"; ctx.font = "10px monospace"; ctx.fillText(`C${Math.floor(beat / 8) + 1} · ${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2, "0")}`, x + 4, 15); }
  }
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#65e2c1"; ctx.beginPath(); ctx.moveTo(left, 92); ctx.lineTo(right, 92); ctx.stroke(); ctx.fillStyle = "#65e2c1"; ctx.font = "11px sans-serif"; ctx.fillText(song.fileName || song.title, left, 68);
  if (timelineWaveformSongId === song.id && timelineWaveform) { ctx.strokeStyle = "#65e2c1"; ctx.globalAlpha = 0.75; ctx.beginPath(); for (let i = 0; i < timelineWaveform.length; i++) { const x = left + i / timelineWaveform.length * (right - left), peak = timelineWaveform[i] * 35; ctx.moveTo(x, 96 - peak); ctx.lineTo(x, 96 + peak); } ctx.stroke(); ctx.globalAlpha = 1; }
  const channel = Number($("#timeline-midi-channel").value || 0), notes = midiData?.notes ?? [];
  notes.forEach((note) => { if (note.channel !== channel) return; const x = xAt(note.time), x2 = xAt(note.endTime), y = audioY + (127 - note.note) * (midiY - audioY) / 128; ctx.fillStyle = note.channel === 9 ? "#f0b36c" : "#65e2c1"; ctx.fillRect(x, y, Math.max(2, x2 - x), 4); });
  const ccNumber = Number($("#timeline-cc-number").value || 1), controllerEvents = [...(midiData?.controllers ?? []).filter((event) => event.controller === ccNumber && event.channel === channel), ...(song.timelineControllers ?? []).filter((event) => event.channel === channel)];
  controllerEvents.forEach((event) => { const x = xAt(event.time), y = ccY + 8 + (127 - (event.value ?? 64)) / 127 * (lyricY - ccY - 20); ctx.fillStyle = event.custom ? "#f0b36c" : "#8c9cff"; ctx.beginPath(); ctx.arc(x, y, event.custom ? 5 : 4, 0, Math.PI * 2); ctx.fill(); if (event.custom) { ctx.fillStyle = "#f1d4a6"; ctx.fillText(({ cc: `CC${event.controller}`, program: "PC", note: `N${event.number}`, song: "SS", pitch: "PB" })[event.type] || "CC", x + 5, y - 6); } });
  const lines = song.lyricLines?.length ? song.lyricLines : parseLyrics(song.lyricsText || "").timeLines;
  ctx.font = "11px sans-serif";
  lines.forEach((line) => { const x = xAt(line.time || 0); ctx.strokeStyle = "#f0b36c"; ctx.beginPath(); ctx.moveTo(x, lyricY + 3); ctx.lineTo(x, h - 12); ctx.stroke(); ctx.fillStyle = "#e4c28e"; ctx.fillText(String(line.text || "").slice(0, 48), x + 3, lyricY + 18); });
  const playX = xAt(currentPosition()); ctx.strokeStyle = "#ff7b7b"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(playX, 0); ctx.lineTo(playX, h); ctx.stroke();
  $("#timeline-position").textContent = formatTime(currentPosition());
  $("#timeline-zoom-label").textContent = `${Math.round(state.timelineZoom * 100)}%`;
}

function pushTimelineUndo(song) {
  state.timelineUndo.push({ id: song.id, timelineControllers: structuredClone(song.timelineControllers ?? []), lyricLines: structuredClone(song.lyricLines ?? []), lyricsText: song.lyricsText ?? "", bpm: song.bpm ?? null });
  if (state.timelineUndo.length > 80) state.timelineUndo.shift();
}

async function undoTimelineEdit() {
  const snapshot = state.timelineUndo.pop(), index = state.songs.findIndex((song) => song.id === snapshot?.id);
  if (!snapshot || index < 0) return toast("Não há alterações do editor para anular.");
  const updated = { ...state.songs[index], timelineControllers: snapshot.timelineControllers, lyricLines: snapshot.lyricLines, lyricsText: snapshot.lyricsText };
  if (snapshot.bpm === null) delete updated.bpm; else updated.bpm = snapshot.bpm;
  try { await dbPut(updated); } catch { state.timelineUndo.push(snapshot); return toast("Não foi possível anular a alteração."); }
  state.songs[index] = updated; drawTimelineEditor(); renderLyrics(); toast("Última alteração do editor anulada.");
}

function timelineCoordinate(event) {
  const canvas = $("#timeline-canvas"), rect = canvas.getBoundingClientRect();
  return { x: (event.clientX - rect.left) / rect.width * canvas.width, y: (event.clientY - rect.top) / rect.height * canvas.height };
}

function timelineTimeAt(x) {
  const song = selectedSong(), duration = Math.max(1, currentDuration(), midiData?.duration ?? 0);
  const raw = Math.max(0, Math.min(duration, (x - 92) / ($("#timeline-canvas").width - 108) * duration));
  const bpm = Math.max(20, Math.min(300, Number(song?.bpm || $("#timeline-bpm")?.value || midiData?.tempo || 120)));
  const grid = 60 / bpm / 4;
  return Math.max(0, Math.round(raw / grid) * grid);
}

function beginTimelinePointerEdit(event) {
  const song = selectedSong(); if (!song || event.button !== 0) return;
  const { x, y } = timelineCoordinate(event), duration = Math.max(1, currentDuration(), midiData?.duration ?? 0), xAt = (time) => 92 + Math.max(0, Math.min(duration, time)) / duration * ($("#timeline-canvas").width - 108);
  if (y >= 332 && y < 435) {
    const custom = (song.timelineControllers ?? []).map((item, index) => ({ item, index })).filter(({ item }) => item.custom && item.channel === Number($("#timeline-midi-channel").value)).sort((a, b) => Math.abs(xAt(a.item.time) - x) - Math.abs(xAt(b.item.time) - x))[0];
    if (custom && Math.abs(xAt(custom.item.time) - x) <= 18) timelineDrag = { id: song.id, kind: "midi", index: custom.index, startX: x, startY: y, moved: false };
  } else if (y >= 435) {
    const lines = song.lyricLines?.length ? song.lyricLines : parseLyrics(song.lyricsText || "").timeLines;
    const selected = lines.map((line, index) => ({ line, index })).sort((a, b) => Math.abs(xAt(a.line.time || 0) - x) - Math.abs(xAt(b.line.time || 0) - x))[0];
    if (selected && Math.abs(xAt(selected.line.time || 0) - x) <= 18) timelineDrag = { id: song.id, kind: "lyric", index: selected.index, startX: x, startY: y, moved: false };
  }
  if (timelineDrag) { event.currentTarget.setPointerCapture(event.pointerId); timelinePointerDragged = false; }
}

async function moveTimelinePointerEdit(event) {
  if (!timelineDrag) return;
  const songIndex = state.songs.findIndex((song) => song.id === timelineDrag.id), song = state.songs[songIndex];
  if (!song) return;
  const { x, y } = timelineCoordinate(event);
  if (Math.abs(x - timelineDrag.startX) + Math.abs(y - timelineDrag.startY) > 3 && !timelineDrag.moved) { pushTimelineUndo(song); timelineDrag.moved = true; timelinePointerDragged = true; }
  if (!timelineDrag.moved) return;
  const time = timelineTimeAt(x);
  if (timelineDrag.kind === "midi") {
    const events = [...(song.timelineControllers ?? [])], item = { ...events[timelineDrag.index], time };
    item.value = Math.max(0, Math.min(127, Math.round(127 - (y - 343) / 72 * 127)));
    events[timelineDrag.index] = item;
    state.songs[songIndex] = { ...song, timelineControllers: events.sort((a, b) => a.time - b.time) };
    timelineDrag.index = events.indexOf(item);
  } else {
    const lines = structuredClone(song.lyricLines?.length ? song.lyricLines : parseLyrics(song.lyricsText || "").timeLines);
    const selected = lines[timelineDrag.index];
    if (selected) {
      const moved = { ...selected, time }, rawLines = (song.lyricsText || "").split(/\r?\n/);
      if (Number.isInteger(selected.sourceIndex) && rawLines[selected.sourceIndex] !== undefined) {
        const raw = rawLines[selected.sourceIndex], prefixPattern = /^((?:\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\]\s*)+)/, prefix = raw.match(prefixPattern)?.[1] ?? "";
        const minutes = Math.floor(time / 60), seconds = time - minutes * 60, fraction = Math.floor((seconds % 1) * 100).toString().padStart(2, "0");
        rawLines[selected.sourceIndex] = `[${String(minutes).padStart(2, "0")}:${String(Math.floor(seconds)).padStart(2, "0")}.${fraction}] ${raw.replace(prefixPattern, "").trim()}`;
      }
      const updatedLines = lines.map((line, index) => index === timelineDrag.index ? moved : line).sort((a, b) => a.time - b.time);
      timelineDrag.index = updatedLines.findIndex((line) => line.sourceIndex === moved.sourceIndex && line.text === moved.text);
      state.songs[songIndex] = { ...song, lyricsText: rawLines.join("\n"), lyricLines: updatedLines };
    }
  }
  drawTimelineEditor();
}

async function finishTimelinePointerEdit() {
  const drag = timelineDrag; timelineDrag = null;
  if (!drag?.moved) return;
  const song = state.songs.find((item) => item.id === drag.id);
  try { await dbPut(song); if (state.currentId === song.id) renderLyrics(); } catch { toast("Não foi possível guardar o evento deslocado."); }
  drawTimelineEditor();
}

async function addTimelineControllerPoint() {
  if (!requireStudio()) return;
  const song = selectedSong(); if (!song) return;
  const type = $("#timeline-event-type").value;
  const eventNumber = type === "note" ? Number($("#timeline-event-number").value) : Number($("#timeline-cc-number").value);
  const event = { time: currentPosition(), type, controller: Number($("#timeline-cc-number").value), number: eventNumber, channel: Number($("#timeline-midi-channel").value), value: Number($("#timeline-cc-value").value), custom: true };
  pushTimelineUndo(song);
  pushTimelineUndo(song);
  const updated = { ...song, bpm: Math.max(20, Math.min(300, Number($("#timeline-bpm").value) || 120)), timelineControllers: [...(song.timelineControllers ?? []), event].sort((a, b) => a.time - b.time) };
  await dbPut(updated); state.songs[state.songs.findIndex((item) => item.id === song.id)] = updated; drawTimelineEditor(); toast(`Ponto ${type === "cc" ? `CC ${event.controller}` : midiSelectLabel(type)} adicionado.`);
}

function setTimelineZoom(zoom, anchorRatio = 0.5) {
  const scroll = $(".timeline-scroll"), oldWidth = $("#timeline-canvas").width;
  const oldLeft = scroll.scrollLeft;
  state.timelineZoom = Math.max(0.5, Math.min(4, Math.round(zoom * 10) / 10));
  drawTimelineEditor();
  const newWidth = $("#timeline-canvas").width;
  scroll.scrollLeft = Math.max(0, oldLeft + (newWidth - oldWidth) * anchorRatio);
}

function exportTimelineMidi() {
  const song = selectedSong();
  if (!song) return toast("Escolhe uma música primeiro.");
  const notes = midiData?.notes ?? [];
  const bpm = Number(song.bpm || midiData?.tempo || 120);
  if (!notes.length) return toast("A faixa não contém notas MIDI para exportar do Piano Roll.");
  let bytes;
  try { bytes = createMidiFromNotes(notes, bpm); }
  catch (error) { return toast(error.message || "Não foi possível converter o Piano Roll."); }
  const url = URL.createObjectURL(new Blob([bytes], { type: "audio/midi" }));
  const link = document.createElement("a"); link.href = url; link.download = `${String(song.title || "StageSet").replace(/[\\/:*?"<>|]+/g, "-")}-piano-roll.mid`; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  toast(`Piano Roll exportado como MIDI a ${bpm} BPM.`);
}

function sendTimelineMidiEvents(song, previous, current) {
  if (!song || current <= previous) return;
  for (const event of song.timelineControllers ?? []) {
    if (!event.custom || event.time <= previous || event.time > current) continue;
    const output = lyricMidiOutput(song, event.channel);
    if (!output) continue;
    const channel = Math.max(0, Math.min(15, Number(event.channel) || 0)), value = Math.max(0, Math.min(127, Number(event.value) || 0));
    if (event.type === "program") output.send([0xc0 | channel, value]);
    else if (event.type === "note") { const note = Math.max(0, Math.min(127, Number(event.number) || 60)); output.send([0x90 | channel, note, Math.max(1, value)]); output.send([0x80 | channel, note, 0], window.performance.now() + 160); }
    else if (event.type === "song") output.send([0xf3, value]);
    else if (event.type === "pitch") output.send([0xe0 | channel, (value * 129) & 0x7f, (value * 129 >> 7) & 0x7f]);
    else output.send([0xb0 | channel, Math.max(0, Math.min(127, Number(event.controller ?? event.number) || 0)), value]);
  }
}

function captureLyricTimestamp() {
  if (!requireStudio()) return;
  const textarea = $("#lyrics-editor-text");
  const value = textarea.value;
  const cursor = textarea.selectionStart;
  const lineStart = value.lastIndexOf("\n", Math.max(0, cursor - 1)) + 1;
  const nextBreak = value.indexOf("\n", cursor);
  const lineEnd = nextBreak < 0 ? value.length : nextBreak;
  const minutes = Math.floor(currentPosition() / 60);
  const seconds = currentPosition() - minutes * 60;
  const centiseconds = Math.floor((seconds % 1) * 100).toString().padStart(2, "0");
  const stamp = `[${String(minutes).padStart(2, "0")}:${Math.floor(seconds % 60).toString().padStart(2, "0")}.${centiseconds}]`;
  const mode = $("#lyrics-timestamp-mode").value;
  let updatedText = "";
  let nextCursor = 0;
  if (mode === "word") {
    const selectionStart = textarea.selectionStart;
    const selectionEnd = textarea.selectionEnd;
    let wordStart = selectionEnd > selectionStart ? selectionStart : Math.max(lineStart, Math.min(cursor, lineEnd));
    let wordEnd = selectionEnd > selectionStart ? selectionEnd : wordStart;
    if (selectionEnd <= selectionStart) {
      while (wordStart < lineEnd && /\s/.test(value[wordStart])) wordStart++;
      if (wordStart >= lineEnd) return toast("Coloca o cursor numa palavra para a sincronizar.");
      while (wordStart > lineStart && !/\s/.test(value[wordStart - 1])) wordStart--;
      wordEnd = wordStart;
      while (wordEnd < lineEnd && !/\s/.test(value[wordEnd])) wordEnd++;
    }
    updatedText = value.slice(0, wordStart) + stamp + " " + value.slice(wordStart);
    nextCursor = wordEnd + stamp.length + 1;
    while (nextCursor < updatedText.length && updatedText[nextCursor] !== "\n" && /\s/.test(updatedText[nextCursor])) nextCursor++;
    if (nextCursor >= updatedText.length || updatedText[nextCursor] === "\n") {
      const followingLine = updatedText.indexOf("\n", lineEnd + stamp.length + 1);
      nextCursor = followingLine >= 0 ? followingLine + 1 : updatedText.length;
      while (nextCursor < updatedText.length && /\s/.test(updatedText[nextCursor])) nextCursor++;
      if (nextCursor === updatedText.length && !updatedText.endsWith("\n")) { updatedText += "\n"; nextCursor = updatedText.length; }
    }
  } else {
    const prefix = value.slice(lineStart, lineEnd).match(/^(?:\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\]\s*)*/)?.[0] ?? "";
    updatedText = value.slice(0, lineStart) + stamp + " " + value.slice(lineStart + prefix.length);
    let followingLine = updatedText.indexOf("\n", lineStart + stamp.length + 1);
    if (followingLine < 0) { updatedText += "\n"; followingLine = updatedText.length - 1; }
    nextCursor = followingLine + 1;
    while (nextCursor < updatedText.length && /\s/.test(updatedText[nextCursor])) nextCursor++;
  }
  textarea.value = updatedText;
  renderLyricsEditorPreview();
  state.autoScroll = true;
  $("#auto-scroll").classList.add("active-tool");
  $("#auto-scroll").setAttribute("aria-pressed", "true");
  textarea.focus();
  textarea.setSelectionRange(nextCursor, nextCursor);
  textarea.scrollTop = Math.max(0, Math.min(textarea.scrollHeight, (nextCursor / Math.max(1, updatedText.length)) * textarea.scrollHeight - textarea.clientHeight * 0.65));
  renderLyricsEditorPreview();
  const songIndex = state.songs.findIndex((song) => song.id === editingLyricsSongId);
  if (songIndex >= 0) {
    const song = { ...state.songs[songIndex], lyricsText: updatedText };
    const parsed = parseLyrics(updatedText); song.lyricLines = parsed.timeLines; song.midiLyricLines = parsed.barBeatLines;
    state.songs[songIndex] = song;
    renderLyrics();
    dbPut(song).then(() => { renderLyrics(); }).catch(() => toast("Timestamp inserido; não foi possível guardar automaticamente."));
  }
  toast(`Tempo ${stamp} inserido; cursor avançou para a próxima ${mode === "word" ? "palavra" : "linha"}.`);
}

function triggerLyricTimestamp() {
  if (editingLyricsSongId === state.currentId && !$("#lyrics-editor-modal").hidden) return captureLyricTimestamp();
  const song = selectedSong();
  if (!song || !requireStudio()) return;
  const lines = (song.lyricsText || "").split(/\r?\n/), usable = lines.map((line, index) => line.trim() ? index : -1).filter((index) => index >= 0);
  if (!usable.length) return toast("Adiciona as letras antes de sincronizar.");
  const target = usable[Math.min(usable.length - 1, Math.floor(currentPosition() / Math.max(1, currentDuration()) * usable.length))];
  const time = currentPosition(), stamp = "[" + String(Math.floor(time / 60)).padStart(2, "0") + ":" + String(Math.floor(time % 60)).padStart(2, "0") + "." + String(Math.floor((time % 1) * 100)).padStart(2, "0") + "] ";
  lines[target] = lines[target].replace(/^(?:\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\]\s*)*/, "") ;
  lines[target] = stamp + lines[target];
  const updated = { ...song, lyricsText: lines.join("\n") }, parsed = parseLyrics(updated.lyricsText);
  updated.lyricLines = parsed.timeLines; updated.midiLyricLines = parsed.barBeatLines;
  state.autoScroll = true;
  $("#auto-scroll").classList.add("active-tool");
  $("#auto-scroll").setAttribute("aria-pressed", "true");
  const index = state.songs.findIndex((item) => item.id === song.id); state.songs[index] = updated;
  dbPut(updated).then(() => { renderLyrics(); drawTimelineEditor(); }).catch(() => toast("Não foi possível guardar a marca de tempo."));
  toast("Tempo da frase guardado.");
}

function lyricSourceText(song, sourceIndex, kind) {
  const rawLines = (song.lyricsText ?? "").split(/\r?\n/);
  if (!Number.isInteger(sourceIndex) || sourceIndex < 0 || sourceIndex >= rawLines.length) return null;
  if (kind === "plain") return rawLines[sourceIndex].trim();
  if (kind === "timed") return parseLyrics(song.lyricsText).timeLines.find((line) => line.sourceIndex === sourceIndex)?.text ?? null;
  if (kind === "barbeat") return parseLyrics(song.lyricsText).barBeatLines.find((line) => line.sourceIndex === sourceIndex)?.text ?? null;
  return null;
}

async function saveQuickLyricLine(song, sourceIndex, kind, text) {
  const rawLines = (song.lyricsText ?? "").split(/\r?\n/);
  if (!Number.isInteger(sourceIndex) || sourceIndex < 0 || sourceIndex >= rawLines.length) return toast("Esta letra está embutida no MIDI. Edita um ficheiro de letras associado à música.");
  if (kind === "plain") rawLines[sourceIndex] = text;
  else {
    const prefixPattern = kind === "timed"
      ? /^((?:\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\]\s*)+)/
      : /^((?:\[\d{1,4}:\d{1,2}\]\s*)+)/;
    const prefix = rawLines[sourceIndex].match(prefixPattern)?.[1] ?? "";
    rawLines[sourceIndex] = prefix + text;
  }
  const updated = { ...song, lyricsText: rawLines.join("\n") };
  const parsed = parseLyrics(updated.lyricsText);
  updated.lyricLines = parsed.timeLines;
  updated.midiLyricLines = parsed.barBeatLines;
  try { await dbPut(updated); }
  catch { return toast("Não foi possível guardar esta alteração às letras."); }
  const index = state.songs.findIndex((item) => item.id === song.id);
  if (index >= 0) state.songs[index] = updated;
  renderLyrics();
  toast("Letra atualizada.");
}

async function quickEditLyric(wordOnly = false) {
  if (!requireStudio()) return;
  const song = selectedSong();
  if (!song || isDocumentSong(song)) return toast("Escolhe uma música antes de editar as letras.");
  const selection = window.getSelection();
  const selectedText = selection?.toString().trim() ?? "";
  const selectedLine = selection?.anchorNode?.parentElement?.closest(".lyric-line");
  const line = selectedLine ?? $("#lyrics-content .lyric-line.current") ?? $("#lyrics-content .lyric-line");
  if (!line) return openLyricsEditor();
  const sourceIndex = Number(line.dataset.sourceIndex);
  const kind = line.dataset.sourceKind;
  const original = lyricSourceText(song, sourceIndex, kind);
  if (original === null) return toast("Esta linha não tem texto editável associado. Usa o editor completo de letras.");
  let replacement;
  if (wordOnly) {
    const target = selectedText || window.prompt("Escreve a palavra ou expressão que queres substituir:", "");
    if (target === null || !target) return;
    if (!original.includes(target)) return toast("A palavra selecionada não foi encontrada na frase original.");
    const value = window.prompt("Substituir por:", target);
    if (value === null) return;
    replacement = original.replace(target, value);
  } else {
    replacement = window.prompt("Editar esta frase:", original);
    if (replacement === null) return;
  }
  await saveQuickLyricLine(song, sourceIndex, kind, replacement);
}

async function copyLibrarySong(id) {
  if (!requireStudio()) return;
  const song = state.songs.find((item) => item.id === id);
  if (!song) return;
  const copy = structuredClone(song);
  copy.id = crypto.randomUUID();
  copy.title = `${song.title} (cópia)`;
  try {
    await dbPut(copy);
  } catch {
    return toast("Não foi possível guardar a cópia.");
  }
  state.songs.push(copy);
  renderLibrary();
  toast("Cópia adicionada à biblioteca.");
}

async function clearCurrentSong() {
  state.currentId = null;
  state.queueDisplayHidden = false;
  $(".setlist-panel").classList.remove("queue-hidden");
  state.cdgView = false;
  cdgDecoder = null;
  midiData = null;
  loopJumping = false;
  if (cdgAnimation) cancelAnimationFrame(cdgAnimation);
  cdgAnimation = 0;
  audio.pause();
  disposeStemPlayers();
  midiPlayer.pause();
  audio.removeAttribute("src");
  audio.load();
  if (state.activeObjectUrl) URL.revokeObjectURL(state.activeObjectUrl);
  state.activeObjectUrl = null;
  $("#document-frame").removeAttribute("src");
  $("#document-frame").hidden = true;
  $("#cdg-canvas").hidden = true;
  $("#lyrics-content").hidden = false;
  $("#lyrics-stage").classList.remove("document-pdf");
  $("#progress").value = "0";
  $("#elapsed").textContent = "0:00";
  $("#remaining").textContent = "-0:00";
  localStorage.removeItem("stageset-current-song");
  syncTrackDetails();
  renderLyrics();
  renderLibrary();
  renderSetlist();
}

async function deleteLibrarySong(id) {
  if (!requireStudio()) return;
  const song = state.songs.find((item) => item.id === id);
  if (!song || !window.confirm(`Eliminar "${song.title}" da biblioteca? Esta ação não pode ser desfeita.`)) return;
  const queueIndex = state.setlist.indexOf(id);
  try {
    await dbDelete(id);
  } catch {
    return toast("Não foi possível eliminar esta faixa do armazenamento local.");
  }
  state.songs = state.songs.filter((item) => item.id !== id);
  state.setlist = state.setlist.filter((item) => item !== id);
  state.quickies = state.quickies.map((quickieId) => quickieId === id ? null : quickieId);
  persistSetlist();
  persistQuickies();
  if (state.currentId === id) {
    state.currentId = null;
    localStorage.removeItem("stageset-current-song");
    const nextId = (queueIndex >= 0 ? state.setlist[Math.min(queueIndex, state.setlist.length - 1)] : null) ?? state.songs[0]?.id;
    if (nextId) await selectSong(nextId);
    else await clearCurrentSong();
  } else {
    renderLibrary();
    renderSetlist();
  }
  toast("Faixa eliminada da biblioteca.");
}

function renderSetlist() {
  const container = $("#setlist-items");
  container.innerHTML = "";
  state.setlist.forEach((id, index) => {
    const song = state.songs.find((item) => item.id === id);
    if (!song) return;
    if (state.hideSetlistDuringPlayback && state.playedSongIds.has(id) && id !== state.currentId) return;
    const row = document.createElement("div");
    row.className = `setlist-entry${id === state.currentId ? " active" : ""}${state.playedSongIds.has(id) ? " played" : ""}`;
    row.innerHTML = `<span class="setlist-index">${String(index + 1).padStart(2, "0")}</span><span class="setlist-name" title=""></span><label class="setlist-cc-value-label" data-studio-only title="Valor MIDI para selecionar esta música"><span class="setlist-midi-value-label">CC</span><input class="setlist-cc-value" type="number" min="0" max="127" step="1" placeholder="—" aria-label="Valor MIDI de ${song.title}" /></label><button class="queue-action setlist-cc-edit" data-studio-only type="button" title="Atribuir canal e mensagem MIDI" aria-label="Configurar seleção MIDI de ${song.title}">⚙</button><button class="queue-action queue-play-next" data-studio-only type="button" title="Tocar a seguir" aria-label="Colocar ${song.title} a tocar a seguir">↪</button><button class="queue-action" data-studio-only data-move="up" title="Mover para cima" aria-label="Mover para cima">↑</button><button class="queue-action" data-studio-only data-move="down" title="Mover para baixo" aria-label="Mover para baixo">↓</button><button class="queue-action remove-entry" data-studio-only title="Remover da setlist" aria-label="Remover">×</button>`;
    row.querySelectorAll("button").forEach((button, buttonIndex) => { button.id = `queue-${song.id}-${buttonIndex}`; });
    row.querySelector(".setlist-name").textContent = song.title;
    row.querySelector(".setlist-name").title = song.title;
    row.querySelector(".setlist-name").addEventListener("click", () => selectSong(id));
    const ccValue = row.querySelector(".setlist-cc-value");
    const midiMap = songMidiSelectMapping(song);
    ccValue.value = midiMap?.type === state.setlistMidiType && Number.isInteger(midiMap.value) ? String(midiMap.value) : "";
    row.querySelector(".setlist-midi-value-label").textContent = ({ program: "PC", note: "Nota", song: "SS", cc: "CC" })[state.setlistMidiType];
    ccValue.title = `${midiSelectLabel(state.setlistMidiType)} para ${song.title}`;
    ccValue.addEventListener("change", () => saveSongSetlistCcValue(song, ccValue));
    row.querySelector(".setlist-cc-edit").addEventListener("click", () => openSongCcEditor(id));
    row.querySelector(".queue-play-next").addEventListener("click", () => playSetlistSongNext(id));
    row.querySelectorAll("[data-move]").forEach((button) => button.addEventListener("click", () => moveQueueItem(index, button.dataset.move)));
    row.querySelector(".remove-entry").addEventListener("click", () => removeFromSetlist(id));
    container.append(row);
  });
  $("#setlist-empty").style.display = state.setlist.length ? "none" : "block";
  $("#setlist-count").textContent = String(state.setlist.length);
  $("#hide-setlist-during-playback").checked = state.hideSetlistDuringPlayback;
  $("#inter-song-delay").value = String(state.interSongDelay);
}

async function saveSongSetlistCcValue(song, input) {
  const type = state.setlistMidiType;
  const existing = songMidiSelectMapping(song);
  if (!requireStudio()) { input.value = existing?.type === type && Number.isInteger(existing.value) ? String(existing.value) : ""; return; }
  const raw = input.value.trim();
  const nextValue = raw === "" ? null : Number(raw);
  const existingValue = existing?.type === type ? existing.value : undefined;
  if (nextValue !== null && (!Number.isInteger(nextValue) || nextValue < 0 || nextValue > 127)) {
    input.value = Number.isInteger(existingValue) ? String(existingValue) : "";
    return toast(type === "program" ? "O número Program Change tem de estar entre 0 e 127." : "O valor CC tem de estar entre 0 e 127.");
  }
  const mapping = existing?.type === type ? existing : { type, channel: state.setlistCcChannel, number: state.setlistCcNumber };
  const duplicate = nextValue !== null && state.setlist.some((id) => {
    if (id === song.id) return false;
    const other = state.songs.find((item) => item.id === id);
    const otherMap = songMidiSelectMapping(other);
    return otherMap?.type === type && (type === "song" || otherMap.channel === mapping.channel) && (type !== "cc" || otherMap.number === mapping.number) && otherMap.value === nextValue;
  });
  if (duplicate) {
    input.value = Number.isInteger(existingValue) ? String(existingValue) : "";
    return toast(`Cada música da setlist precisa de um valor ${midiSelectLabel(type)} diferente.`);
  }
  const previous = song.setlistMidi;
  const midiMappings = song.setlistMidi && !song.setlistMidi.type ? { ...song.setlistMidi } : {};
  if (nextValue === null) delete midiMappings[type];
  else midiMappings[type] = { channel: mapping.channel, ...(type === "cc" ? { number: mapping.number } : {}), value: nextValue };
  if (Object.keys(midiMappings).length) song.setlistMidi = midiMappings;
  else delete song.setlistMidi;
  if (type === "cc") {
    if (nextValue === null) { delete song.setlistCcValue; delete song.setlistCc; }
    else { song.setlistCc = { channel: mapping.channel, number: mapping.number, value: nextValue }; song.setlistCcValue = nextValue; }
  }
  if (nextValue !== null) {
    state.setlistCcEnabled = true;
    localStorage.setItem("stageset-cc-select-enabled", "true");
  }
  try {
    await dbPut(song);
    toast(nextValue === null ? `Atribuição ${midiSelectLabel(type)} removida.` : `${midiSelectLabel(type)} ${nextValue} atribuído a “${song.title}”.`);
  } catch {
    if (previous === undefined) delete song.setlistMidi;
    else song.setlistMidi = previous;
    input.value = Number.isInteger(existingValue) ? String(existingValue) : "";
    toast("Não foi possível guardar a atribuição MIDI.");
  }
}

function openSongCcEditor(id) {
  if (!requireStudio()) return;
  const song = state.songs.find((item) => item.id === id);
  if (!song) return;
  const type = state.setlistMidiType;
  const mapping = songMidiSelectMapping(song, type);
  editingCcSongId = id;
  state.learningSongMidiId = null;
  $("#song-cc-title").textContent = `${midiSelectLabel(type)} · ${song.title}`;
  $("#song-cc-type").value = type;
  $("#song-cc-channel").value = String(mapping?.type === type ? mapping.channel : state.setlistCcChannel);
  $("#song-cc-number").value = String(mapping?.type === "cc" ? mapping.number : state.setlistCcNumber);
  $("#song-cc-value").value = String(mapping?.type === type ? mapping.value : 0);
  $("#song-cc-learn-status").textContent = "Introduz os valores ou aprende uma mensagem MIDI.";
  updateSongCcEditorFields();
  $("#song-cc-modal").hidden = false;
  $("#song-cc-value").focus();
}

function updateSongCcEditorFields() {
  const type = validSelectTypes.includes($("#song-cc-type").value) ? $("#song-cc-type").value : "cc";
  const numberLabel = $("#song-cc-number-label"), numberInput = $("#song-cc-number"), valueLabel = $("#song-cc-value-label");
  numberLabel.hidden = type !== "cc";
  numberInput.disabled = type !== "cc";
  numberInput.required = type === "cc";
  $("#song-cc-channel").closest("label").hidden = type === "song";
  valueLabel.firstChild.textContent = type === "cc" ? "Valor CC para esta música" : type === "note" ? "Nota MIDI (0–127)" : type === "program" ? "Número Program Change (0–127)" : "Número Song Select (0–127)";
  const song = state.songs.find((item) => item.id === editingCcSongId);
  if (song) $("#song-cc-title").textContent = `${midiSelectLabel(type)} · ${song.title}`;
}

async function beginSongMidiLearn() {
  if (!requireStudio() || !editingCcSongId) return;
  if (!navigator.requestMIDIAccess) return toast("Este browser não disponibiliza entrada MIDI.");
  try {
    if (!state.midiAccess) {
      state.midiAccess = await navigator.requestMIDIAccess({ software: true, sysex: state.midiAccess?.sysexEnabled || false });
      state.midiAccess.onstatechange = () => { renderMidiInputs(); renderMidiOutputs(); };
      renderMidiInputs();
      renderMidiOutputs();
    }
    if (!state.pedalInput) renderMidiInputs();
    if (!state.pedalInput) return toast("Liga um controlador MIDI antes de aprender.");
    state.learningSongMidiId = editingCcSongId;
    $("#song-cc-learn").textContent = "À espera de MIDI…";
    $("#song-cc-learn-status").textContent = `Toca uma mensagem ${midiSelectLabel($("#song-cc-type").value)}.`;
  } catch (error) {
    toast(error.name === "NotAllowedError" ? "O browser não autorizou acesso MIDI." : "Não foi possível aceder às entradas MIDI.");
  }
}

function closeSongCcEditor() {
  editingCcSongId = null;
  state.learningSongMidiId = null;
  $("#song-cc-modal").hidden = true;
}

async function saveSongCcEditor(event) {
  event.preventDefault();
  if (!requireStudio()) return;
  const song = state.songs.find((item) => item.id === editingCcSongId);
  if (!song) return closeSongCcEditor();
  const type = validSelectTypes.includes($("#song-cc-type").value) ? $("#song-cc-type").value : "cc";
  const channel = Number($("#song-cc-channel").value);
  const number = Number($("#song-cc-number").value);
  const value = Number($("#song-cc-value").value);
  if ((type !== "song" && (!Number.isInteger(channel) || channel < 0 || channel > 15)) || !Number.isInteger(value) || value < 0 || value > 127 || (type === "cc" && (!Number.isInteger(number) || number < 0 || number > 127))) {
    return toast(type === "program" ? "Canal tem de estar entre 1–16 e Program Change entre 0–127." : "Canal tem de estar entre 1–16 e CC/valor entre 0–127.");
  }
  const duplicate = state.setlist.some((id) => id !== song.id && (() => {
    const other = state.songs.find((item) => item.id === id);
    const mapping = songMidiSelectMapping(other, type);
    return mapping?.type === type && (type === "song" || mapping.channel === channel) && (type !== "cc" || mapping.number === number) && mapping.value === value;
  })());
  if (duplicate) return toast(type === "program" ? "Outra música da setlist já usa esse Program Change neste canal." : "Outra música da setlist já usa este canal, CC e valor.");
  song.setlistMidi = song.setlistMidi && !song.setlistMidi.type ? { ...song.setlistMidi } : {};
  song.setlistMidi[type] = { channel, ...(type === "cc" ? { number } : {}), value };
  if (type === "cc") { song.setlistCc = { channel, number, value }; song.setlistCcValue = value; }
  state.setlistCcEnabled = true;
  state.setlistMidiType = type;
  state.setlistCcChannel = channel;
  if (type === "cc") state.setlistCcNumber = number;
  localStorage.setItem("stageset-cc-select-enabled", "true");
  localStorage.setItem("stageset-midi-select-type", type);
  try { await dbPut(song); }
  catch { return toast("Não foi possível guardar a atribuição MIDI."); }
  closeSongCcEditor();
  renderLibrary();
  renderSetlist();
  toast(`${midiSelectLabel(type)} ${type === "cc" ? `CC ${number} · ` : ""}${value} atribuído a “${song.title}”.`);
}

function renderLyrics() {
  const song = selectedSong();
  const container = $("#lyrics-content");
  container.innerHTML = "";
  const displayPrefs = lyricOutputSettings(song, "main");
  const fontSize = Math.max(16, Math.min(96, Number(displayPrefs.fontSize) || 25));
  const highlightColor = displayPrefs.highlightColor || song?.lyricHighlightColor || state.lyricHighlightColor;
  container.style.setProperty("--lyric-font-size", fontSize + "px");
  $("#lyric-size-label").textContent = Math.round(fontSize / 25 * 100) + "%";
  if (isDocumentSong(song)) {
    const extension = song.fileName.split(".").at(-1).toUpperCase();
    $("#lyric-mode").textContent = `DOCUMENTO · ${extension}`;
    $("#lyric-line-counter").textContent = extension === "PDF" ? "PDF" : `${(song.documentText ?? "").split(/\r?\n/).filter((line) => line.trim()).length} linhas`;
    if (extension !== "PDF") {
      const text = document.createElement("pre");
      text.className = "document-text";
      text.textContent = song.documentText || "Este documento não contém texto legível.";
      container.append(text);
    }
    return;
  }
  const taggedMidiLines = midiData?.barBeatToSeconds && song?.midiLyricLines?.length
    ? song.midiLyricLines.map((line) => ({ time: midiData.barBeatToSeconds(line.bar, line.beat), text: line.text, sourceIndex: line.sourceIndex }))
    : [];
  const embeddedMidiLyrics = readableMidiLyrics(midiData);
  const baseTimedLines = song?.lyricLines?.length ? song.lyricLines : taggedMidiLines.length ? taggedMidiLines : embeddedMidiLyrics;
  const timedLines = song?.lyricsText && baseTimedLines.length ? (() => {
    const sourceLines = song.lyricsText.split(/\r?\n/), bySource = new Map();
    baseTimedLines.forEach((line) => { const list = bySource.get(line.sourceIndex) ?? []; list.push(line); bySource.set(line.sourceIndex, list); });
    let previousTime = 0;
    return sourceLines.flatMap((source, sourceIndex) => {
      const matching = bySource.get(sourceIndex);
      if (matching?.length) { previousTime = matching[0].time; return matching; }
      if (!source.trim()) {
        const next = baseTimedLines.find((line) => line.sourceIndex > sourceIndex);
        if (next) return [{ time: next.time, text: "", sourceIndex, spacer: true }];
        return [{ time: previousTime, text: "", sourceIndex, spacer: true }];
      }
      return [];
    }).sort((a, b) => a.time - b.time || a.sourceIndex - b.sourceIndex);
  })() : baseTimedLines;
  const synced = timedLines.length > 0;
  const barBeat = song?.midiLyricLines?.length > 0;
  $("#lyric-mode").textContent = state.cdgView ? "KARAOKE · CD+G" : song?.lyricLines?.length ? "LETRAS SINCRONIZADAS · TEMPO" : taggedMidiLines.length ? "LETRAS SINCRONIZADAS · MIDI COMPASSO/TEMPO" : embeddedMidiLyrics.length ? "LETRAS EMBUTIDAS · MIDI/KAR" : barBeat ? "REFERÊNCIAS MIDI · COMPASSO / TEMPO" : state.autoScroll ? "LETRAS · AVANÇO AUTOMÁTICO" : "LETRAS · AVANÇO MANUAL";
  if (!song?.lyricsText && !synced && !barBeat) {
    const hint = document.createElement("span");
    hint.className = "lyric-hint";
    hint.textContent = song ? "ADICIONA AS LETRAS DESTA MÚSICA" : "AS LETRAS APARECEM AQUI";
    const placeholder = document.createElement("p");
    placeholder.className = "lyric-placeholder";
    placeholder.innerHTML = song ? "Prepara este tema<br />para o palco." : "Carrega numa música<br />e prepara o teu palco.";
    container.append(hint, placeholder);
    $("#lyric-line-counter").textContent = "—";
    broadcastLyricWindows([], -1);
    return;
  }
  if (synced) {
    const position = currentPosition();
    const active = timedLines.reduce((found, line, index) => line.time <= position ? index : found, -1);
    const start = Math.max(0, Math.min(timedLines.length - 3, active < 0 ? 0 : active - 1));
    timedLines.slice(start, start + 5).forEach((line, offset) => {
      const paragraph = document.createElement("p");
      paragraph.className = `${line.spacer || !line.text.trim() ? "lyric-spacer" : "lyric-line"}${start + offset === active ? " current" : ""}${Math.abs(start + offset - active) === 1 ? " near" : ""}`;
      if (Number.isInteger(line.sourceIndex)) { paragraph.dataset.sourceIndex = String(line.sourceIndex); paragraph.dataset.sourceKind = "timed"; }
      appendColoredLyricText(paragraph, line.text.trim() ? transposeLyricLine(line.text, song.transpose ?? 0) : "\u00a0");
      if (start + offset === active) paragraph.style.backgroundColor = colorWithAlpha(highlightColor);
      container.append(paragraph);
      if (start + offset === active) paragraph.scrollIntoView({ block: "nearest" });
    });
    broadcastLyricWindows(timedLines.slice(start, start + 5).map((line) => line.text || "♪"), active - start);
    $("#lyric-line-counter").textContent = active < 0 ? "00 / " + String(timedLines.length).padStart(2, "0") : `${String(active + 1).padStart(2, "0")} / ${String(timedLines.length).padStart(2, "0")}`;
    return;
  }
  const hint = document.createElement("span");
  hint.className = "lyric-hint";
  hint.textContent = barBeat ? "TAGS MIDI · [COMPASSO:TEMPO]" : state.autoScroll ? "LETRAS · AVANÇO AUTOMÁTICO PELA DURAÇÃO" : "LETRAS · ROLA MANUALMENTE";
  container.append(hint);
  const displaySources = (song.lyricsText ?? "").split(/\r?\n/).map((line, index) => ({ line, index })).filter(({ line }) => !isEmbeddedMidiTag(line));
  const sourceLines = barBeat ? song.midiLyricLines.map((line) => `${line.bar}:${line.beat}  ${line.text}`) : displaySources.map(({ line }) => line);
  const rawLineIndexes = displaySources.map(({ index }) => index);
  const duration = currentDuration();
  const active = state.autoScroll && !barBeat && duration
    ? Math.min(sourceLines.length - 1, Math.floor((currentPosition() / duration) * sourceLines.length))
    : -1;
  const manualLine = Math.max(0, Math.min(Math.max(0, sourceLines.length - 1), state.manualLyricOffset));
  const start = active < 0
    ? Math.max(0, Math.min(Math.max(0, sourceLines.length - 5), state.autoScroll ? 0 : manualLine - 1))
    : Math.max(0, Math.min(sourceLines.length - 3, active - 1));
  const visibleLines = sourceLines.slice(start, start + 5);
  const activeLine = active < 0 && !state.autoScroll ? Math.max(start, Math.min(start + 4, manualLine)) : active;
  visibleLines.forEach((line, offset) => {
    const paragraph = document.createElement("p");
    const currentIndex = activeLine < 0 ? -1 : start + offset;
    paragraph.className = `${line.trim() ? "lyric-line" : "lyric-spacer"}${currentIndex === activeLine ? " current" : ""}${activeLine >= 0 && Math.abs(currentIndex - activeLine) === 1 ? " near" : ""}`;
    if (barBeat && song.midiLyricLines[start + offset]) { paragraph.dataset.sourceIndex = String(song.midiLyricLines[start + offset].sourceIndex); paragraph.dataset.sourceKind = "barbeat"; }
    else if (!barBeat && Number.isInteger(rawLineIndexes[start + offset])) { paragraph.dataset.sourceIndex = String(rawLineIndexes[start + offset]); paragraph.dataset.sourceKind = "plain"; }
    appendColoredLyricText(paragraph, line.trim() ? transposeLyricLine(line.trim(), song.transpose ?? 0) : "\u00a0");
    if (currentIndex === activeLine) paragraph.style.backgroundColor = colorWithAlpha(highlightColor);
    container.append(paragraph);
  });
  broadcastLyricWindows(visibleLines.map((line) => line.trim()), activeLine - start);
  if (activeLine >= start && activeLine < start + visibleLines.length) container.querySelector(".lyric-line.current")?.scrollIntoView({ block: "nearest" });
  const displayedLine = activeLine;
  $("#lyric-line-counter").textContent = barBeat
    ? displayedLine >= 0
      ? `${String(song.midiLyricLines[displayedLine]?.bar ?? 0).padStart(2, "0")}:${String(song.midiLyricLines[displayedLine]?.beat ?? 0)} · ${displayedLine + 1}/${song.midiLyricLines.length}`
      : `${String(song.midiLyricLines[0]?.bar ?? 0).padStart(2, "0")}:${String(song.midiLyricLines[0]?.beat ?? 0)} · ${song.midiLyricLines.length} tags`
    : displayedLine < 0 ? `${sourceLines.length} linhas` : `${String(displayedLine + 1).padStart(2, "0")} / ${String(sourceLines.length).padStart(2, "0")}`;
}

function syncTrackDetails() {
  const song = selectedSong();
  if (!song) {
    $("#transport").hidden = false;
    $("#transpose-control").hidden = false;
    $("#lyrics-edit-button").hidden = false;
    $("#auto-scroll").hidden = false;
    $("#midi-mixer-button").hidden = true;
    $("#audio-mixer-button").hidden = true;
    $("#audio-stems-button").hidden = true;
    $("#midi-layer-button").hidden = false;
    $("#midi-layer-button").classList.remove("active-tool");
    $("#midi-layer-button").querySelector("span:last-child").textContent = "MIDI mix";
    $("#cdg-layer-button").hidden = false;
    $("#cdg-layer-button").classList.remove("active-tool");
    $("#cdg-layer-button").querySelector("span:last-child").textContent = "CD+G";
    $("#cdg-view-button").hidden = true;
    $("#loop-indicator").hidden = true;
    renderLoopControls(null);
    $("#track-title").textContent = "Escolhe uma música";
    $("#track-subtitle").textContent = "Importa áudio ou MIDI para começar a preparar a setlist";
    $("#format-pill").textContent = "SEM FAIXA";
    $("#track-duration").textContent = "--:--";
    $("#bar-indicator").hidden = true;
    $("#transpose-value").textContent = "0";
    $("#tempo-value").textContent = "100%";
    $("#midi-tempo").hidden = true;
    $("#album-tile").classList.remove("has-track");
    $("#transpose-control").title = "Seleciona uma música para transpor os acordes das letras";
    $("#play-glyph").textContent = "▶";
    return;
  }
  const documentSong = isDocumentSong(song);
  $("#midi-mixer-button").hidden = documentSong || !midiData;
  $("#audio-mixer-button").hidden = documentSong || isMidiSong(song);
  $("#audio-stems-button").hidden = documentSong || isMidiSong(song);
  renderLoopControls(song);
  $("#track-title").textContent = song.title;
  $("#track-subtitle").textContent = song.artist || song.fileName;
  $("#format-pill").textContent = song.fileName.split(".").at(-1).toUpperCase();
  $("#track-duration").textContent = documentSong ? "—" : formatTime(song.duration);
  $("#transport").hidden = documentSong;
  $("#transpose-control").hidden = documentSong;
  $("#lyrics-edit-button").hidden = documentSong;
  $("#auto-scroll").hidden = documentSong;
  const transpose = song.transpose ?? 0;
  $("#transpose-value").textContent = `${transpose > 0 ? "+" : ""}${transpose}`;
  $("#transpose-control").title = isMidiSong(song)
    ? "Transpor a faixa MIDI e os acordes nas letras"
    : hasMidiLayer(song)
      ? "Transpor o áudio, a faixa MIDI anexada e os acordes nas letras"
      : "Transpor o áudio e os acordes nas letras";
  $("#midi-tempo").hidden = documentSong;
  $("#midi-layer-button").hidden = documentSong || isMidiSong(song);
  $("#midi-layer-button").classList.toggle("active-tool", hasMidiLayer(song));
  $("#midi-layer-button").querySelector("span:last-child").textContent = hasMidiLayer(song) ? "MIDI ✓" : "MIDI mix";
  $("#midi-layer-button").title = hasMidiLayer(song) ? "Substituir a faixa MIDI associada" : "Anexar uma faixa MIDI à música selecionada";
  $("#cdg-layer-button").hidden = documentSong || isMidiSong(song);
  $("#cdg-layer-button").classList.toggle("active-tool", hasCdgLayer(song));
  $("#cdg-layer-button").querySelector("span:last-child").textContent = hasCdgLayer(song) ? "CD+G ✓" : "CD+G";
  $("#cdg-layer-button").title = hasCdgLayer(song) ? "Substituir a faixa CD+G associada" : "Anexar um ficheiro CD+G a esta faixa de áudio";
  $("#cdg-view-button").hidden = documentSong || !hasCdgLayer(song);
  $("#cdg-view-button").classList.toggle("active-tool", state.cdgView);
  $("#tempo-value").textContent = `${Math.round((song.tempo ?? 1) * 100)}%`;
  $("#bar-indicator").hidden = !midiData;
  if (midiData) {
    const position = midiData.positionToBarBeat(currentPosition());
    $("#bar-indicator").textContent = `${String(position.bar).padStart(2, "0")} · ${position.beat}`;
  }
  $("#album-tile").classList.add("has-track");
  $("#play-glyph").textContent = isPlaying() ? "Ⅱ" : "▶";
  renderLyrics();
}

async function selectSong(id, autoplay = false, { quickie = false } = {}) {
  const song = state.songs.find((item) => item.id === id);
  if (!song) return;
  if (queueDelayTimer) clearTimeout(queueDelayTimer);
  queueDelayTimer = null;
  state.queueDisplayHidden = false;
  $(".setlist-panel").classList.remove("queue-hidden");
  disposeStemPlayers();
  state.quickiePlaying = quickie;
  $("#midi-mixer-modal").hidden = true;
  $("#audio-mixer-modal").hidden = true;
  $("#timeline-editor-modal").hidden = true;
  state.currentId = id;
  embeddedMidiLastPosition = -1;
  state.timelineLastPosition = -0.001;
  state.manualLyricOffset = 0;
  loopJumping = false;
  state.cdgView = hasCdgLayer(song);
  cdgDecoder = null;
  cdgLastFrame = -1;
  if (cdgAnimation) cancelAnimationFrame(cdgAnimation);
  cdgAnimation = 0;
  $("#document-frame").hidden = true;
  $("#document-frame").removeAttribute("src");
  $("#lyrics-stage").classList.remove("document-pdf");
  audio.pause();
  midiPlayer.pause();
  midiData = null;
  if (state.activeObjectUrl) URL.revokeObjectURL(state.activeObjectUrl);
  state.activeObjectUrl = null;
  if (isDocumentSong(song)) {
    audio.removeAttribute("src");
    audio.load();
    if (/\.pdf$/i.test(song.fileName)) {
      state.activeObjectUrl = URL.createObjectURL(song.audioBlob);
      $("#document-frame").src = state.activeObjectUrl;
      $("#document-frame").hidden = false;
      $("#lyrics-stage").classList.add("document-pdf");
    }
  } else if (isMidiSong(song)) {
    audio.removeAttribute("src");
    audio.load();
  } else {
    state.activeObjectUrl = URL.createObjectURL(getPlayableAudioBlob(song));
    audio.src = state.activeObjectUrl;
    audio.load();
    if ("preservesPitch" in audio) audio.preservesPitch = true;
    if ("webkitPreservesPitch" in audio) audio.webkitPreservesPitch = true;
    audio.playbackRate = song.tempo ?? 1;
    if (pitchSource || song.audioChannels > 2 || song.audioMix || song.audioStems?.length) {
      try { await ensureAudioMixerGraph(song, true); }
      catch (error) { toast(error.message || "Não foi possível preparar os canais de áudio."); }
    }
    if (song.audioStems?.length) {
      try { await connectAudioStems(song); }
      catch (error) { toast(error.message || "Não foi possível carregar as pistas de áudio."); }
    }
    if ((song.transpose ?? 0) !== 0) {
      try { await setAudioTranspose(song.transpose); }
      catch (error) { toast(error.message || "Não foi possível transpor este áudio."); }
    } else if (pitchNode) await setAudioTranspose(0);
  }
  const midiBlob = isMidiSong(song) ? song.audioBlob : song.midiBlob;
  if (midiBlob) {
    try {
      midiData = await midiPlayer.load(await midiBlob.arrayBuffer());
      if (song.timelineControllers?.length) {
        midiData.controllers = [...midiData.controllers, ...song.timelineControllers].sort((a, b) => a.time - b.time);
        midiPlayer.controllerCursor = 0;
      }
      midiPlayer.setChannelMix(normalizeMidiMix(song.midiMix));
      for (let channel = 0; channel < 16; channel++) {
        const route = song.midiOutputIds?.[channel] ?? "inherit";
        const output = route === "inherit" ? undefined : route === "internal" ? null :
          allMidiOutputs().find((item) => item.id === route) ?? undefined;
        await midiPlayer.setChannelOutput(channel, output);
      }
      song.duration = Math.max(song.duration || 0, midiData.duration);
      if (!song.bpm) song.bpm = midiData.tempo;
      await midiPlayer.setRate(song.tempo ?? 1);
      await midiPlayer.setTranspose(song.transpose ?? 0);
      await dbPut(song);
    } catch (error) {
      toast(error.message || "Não foi possível abrir este MIDI/KAR.");
    }
  }
  if (hasCdgLayer(song)) {
    try {
      cdgDecoder = new CdgDecoder(await song.cdgBlob.arrayBuffer());
    } catch (error) {
      state.cdgView = false;
      toast(error.message || "Não foi possível abrir este ficheiro CD+G.");
    }
  }
  if (isDocumentSong(song) && !/\.pdf$/i.test(song.fileName) && !song.documentText) {
    try {
      song.documentText = await readDocumentText(song.audioBlob);
      await dbPut(song);
    } catch (error) {
      toast(error.message || "Não foi possível ler este documento.");
    }
  }
  setCdgView(state.cdgView);
  syncTrackDetails();
  fireEmbeddedMidiActions("load", song);
  renderLibrary();
  renderSetlist();
  $("#progress").value = "0";
  $("#elapsed").textContent = "0:00";
  $("#remaining").textContent = `-${formatTime(song.duration)}`;
  if (autoplay) {
    if (isDocumentSong(song)) return;
    if (isMidiSong(song) && midiData) await midiPlayer.play().catch((error) => toast(error.message || "Não foi possível reproduzir o MIDI."));
    else if (hasMidiLayer(song) && midiData) {
      const results = await Promise.allSettled([audio.play(), midiPlayer.play()]);
      if (results.some((result) => result.status === "rejected")) toast("Uma das faixas do mix não pôde começar.");
    } else if (!isMidiSong(song)) await audio.play().catch(() => toast("O navegador bloqueou a reprodução automática."));
    if (isPlaying()) recordSongPlay(song.id);
    updatePlayback();
  }
}

function addToSetlist(id) {
  if (!requireStudio()) return;
  if (state.setlist.includes(id)) return toast("Esta música já está na setlist.");
  state.setlist.push(id);
  persistSetlist();
  renderLibrary();
  renderSetlist();
  toast("Adicionada à setlist.");
}

function removeFromSetlist(id) {
  if (!requireStudio()) return;
  state.setlist = state.setlist.filter((item) => item !== id);
  persistSetlist();
  renderLibrary();
  renderSetlist();
}

function moveQueueItem(index, direction) {
  if (!requireStudio()) return;
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= state.setlist.length) return;
  [state.setlist[index], state.setlist[target]] = [state.setlist[target], state.setlist[index]];
  persistSetlist();
  renderLibrary();
  renderSetlist();
}

function playSetlistSongNext(id) {
  if (!requireStudio()) return;
  const targetIndex = state.setlist.indexOf(id);
  if (targetIndex < 0) return;
  if (id === state.currentId) return toast("Esta música já está selecionada.");
  const [songId] = state.setlist.splice(targetIndex, 1);
  const currentIndex = state.setlist.indexOf(state.currentId);
  const insertAt = currentIndex >= 0 ? currentIndex + 1 : 0;
  state.setlist.splice(insertAt, 0, songId);
  state.quickiePlaying = false;
  persistSetlist();
  renderLibrary();
  renderSetlist();
  toast(`“${state.songs.find((song) => song.id === id)?.title ?? "Música"}” vai tocar a seguir.`);
}

function playQueueStep(direction) {
  state.quickiePlaying = false;
  state.queueDisplayHidden = false;
  if (queueDelayTimer) clearTimeout(queueDelayTimer);
  queueDelayTimer = null;
  const queueIndex = currentQueueIndex();
  if (queueIndex < 0) {
    const id = state.setlist[direction > 0 ? 0 : state.setlist.length - 1] ?? state.songs[0]?.id;
    if (id) selectSong(id, true);
    return;
  }
  const nextId = state.setlist[queueIndex + direction];
  if (nextId) selectSong(nextId, true);
}

async function moveMidiBar(direction) {
  const song = selectedSong();
  if (!song || !midiData) return;
  const position = midiData.positionToBarBeat(currentPosition());
  const targetBar = Math.max(1, position.bar + direction);
  const target = Math.min(currentDuration(), midiData.barBeatToSeconds(targetBar, 1));
  try {
    if (isMidiSong(song)) await midiPlayer.seek(target);
    else {
      audio.currentTime = target;
      if (hasMidiLayer(song)) await midiPlayer.seek(target);
    }
  } catch {
    toast("Não foi possível mudar de compasso.");
  }
}

function localCdgPairKey(file) {
  const path = (file.webkitRelativePath || file.name).replaceAll("\\", "/");
  const slash = path.lastIndexOf("/");
  const directory = slash < 0 ? "" : path.slice(0, slash + 1).toLocaleLowerCase();
  const name = slash < 0 ? path : path.slice(slash + 1);
  return directory + name.slice(0, name.lastIndexOf(".")).toLocaleLowerCase();
}

async function importAudio(files) {
  if (!requireStudio()) return;
  const inputFiles = [...files];
  const accepted = [];
  let failedCount = 0;
  const cdgFiles = new Map();
  for (const file of inputFiles) {
    if (!/\.cdg$/i.test(file.name)) continue;
    const key = localCdgPairKey(file);
    const matches = cdgFiles.get(key) ?? [];
    matches.push(file);
    cdgFiles.set(key, matches);
  }
  let unmatchedCdgCount = [...cdgFiles.values()].reduce((sum, matches) => sum + matches.length, 0);
  for (const file of inputFiles) {
    if (/\.zip$/i.test(file.name)) {
      try {
        const pairs = await extractMp3CdgPairs(file);
        for (const pair of pairs) accepted.push({ file: pair.audioFile, cdgBlob: pair.cdgFile, cdgFileName: pair.cdgFile.name });
      } catch {
        failedCount++;
      }
    } else if (/\.cdg$/i.test(file.name)) {
      continue;
    } else if (file.type.startsWith("audio/") || /\.(mp3|wav|m4a|ogg|flac|mogg|mid|midi|kar|pdf|rtf|txt)$/i.test(file.name)) {
      const cdgMatch = /\.(mp3|wav)$/i.test(file.name) ? cdgFiles.get(localCdgPairKey(file))?.shift() : null;
      if (cdgMatch) unmatchedCdgCount--;
      accepted.push({ file, cdgBlob: cdgMatch ?? null, cdgFileName: cdgMatch?.name ?? "" });
    }
  }
  failedCount += unmatchedCdgCount;
  let importedCount = 0;
  for (const item of accepted) {
    const { file, cdgBlob, cdgFileName } = item;
    const title = file.name.replace(/\.[^.]+$/, "").replace(/[._]+/g, " ");
    let audioMetadata = null;
    try { audioMetadata = await readAudioChannelMetadata(file); }
    catch (error) {
      failedCount++;
      toast(error.message || `Não foi possível ler ${file.name}.`);
      continue;
    }
    const song = {
      id: crypto.randomUUID(), title, artist: "", fileName: file.name, duration: 0, addedAt: Date.now(), favorite: false, playCount: 0, tags: [],
      audioChannels: audioMetadata?.channels ?? 2,
      audioFormat: audioMetadata?.format ?? (/\.mogg$/i.test(file.name) ? "mogg" : "audio"),
      ...(audioMetadata?.moggOffset !== undefined ? { moggOffset: audioMetadata.moggOffset } : {}),
      ...(audioMetadata?.format === "mogg" ? { audioMix: Array.from({ length: audioMetadata.channels }, () => ({ volume: 1, muted: false, solo: false, pan: 0 })) } : {}),
      audioBlob: file, lyricsText: "", lyricLines: [],
    };
    if (cdgBlob) {
      try {
        new CdgDecoder(await cdgBlob.arrayBuffer());
        song.cdgBlob = cdgBlob;
        song.cdgFileName = cdgFileName;
      } catch {
        failedCount++;
        continue;
      }
    }
    if (isDocumentSong(song) && !/\.pdf$/i.test(song.fileName)) {
      try { song.documentText = await readDocumentText(file); }
      catch { toast(`Não foi possível ler ${file.name}.`); continue; }
    }
    try {
      await dbPut(song);
    } catch {
      failedCount++;
      continue;
    }
    state.songs.push(song);
    importedCount++;
    if (isMidiSong(song) || isDocumentSong(song)) continue;
    const probe = new Audio();
    const probeUrl = URL.createObjectURL(getPlayableAudioBlob(song));
    probe.onloadedmetadata = async () => {
      URL.revokeObjectURL(probeUrl);
      if (!state.songs.some((item) => item.id === song.id)) return;
      song.duration = Number.isFinite(probe.duration) ? probe.duration : 0;
      try {
        await dbPut(song);
      } catch {
        toast("A duração de " + file.name + " não foi guardada.");
        return;
      }
      if (!state.songs.some((item) => item.id === song.id)) {
        await dbDelete(song.id).catch(() => {});
        return;
      }
      if (state.currentId === song.id) syncTrackDetails();
      renderLibrary();
    };
    probe.src = probeUrl;
    probe.onerror = () => URL.revokeObjectURL(probeUrl);
  }
  renderLibrary();
  if (!state.currentId && state.songs.length) selectSong(state.songs.at(-1).id);
  if (importedCount) toast(`${importedCount} ${importedCount === 1 ? "ficheiro importado" : "ficheiros importados"}.`);
  else if (files.length && !accepted.length) toast("Formato de ficheiro não suportado.");
  if (failedCount) toast(failedCount + (failedCount === 1 ? " ficheiro não pôde ser importado." : " ficheiros não puderam ser importados."));
}

async function addAudioStems(files, targetSong = selectedSong()) {
  if (!requireStudio()) return;
  const song = targetSong;
  if (!song || isMidiSong(song) || isDocumentSong(song)) return toast("Seleciona primeiro uma música com áudio.");
  const selectedFiles = [];
  for (const file of [...files]) {
    if (/\.zip$/i.test(file.name)) {
      try { selectedFiles.push(...await extractAudioStems(file)); }
      catch (error) { toast(error.message || `Não foi possível ler ${file.name}.`); }
    } else if (file.type.startsWith("audio/") || /\.(mp3|wav|m4a|ogg|flac|mogg)$/i.test(file.name)) {
      selectedFiles.push(file);
    }
  }
  if (!selectedFiles.length) return toast("Seleciona ficheiros de áudio para adicionar como pistas.");
  const currentCount = (song.audioStems ?? []).length;
  if (currentCount + selectedFiles.length > 31) return toast("Cada música pode ter até 32 pistas de áudio, incluindo a faixa principal.");
  const added = [];
  const isCurrentSong = selectedSong()?.id === song.id;
  const wasPlaying = isCurrentSong && !audio.paused;
  for (const file of selectedFiles) {
    try {
      const metadata = await readAudioChannelMetadata(file);
      const stem = { id: crypto.randomUUID(), name: file.name.replace(/\.[^.]+$/, "").replace(/[._]+/g, " ").slice(0, 80), fileName: file.name, blob: file, audioFormat: metadata?.format ?? "audio", ...(metadata?.moggOffset !== undefined ? { moggOffset: metadata.moggOffset } : {}), volume: 1, pan: 0, muted: false, solo: false };
      song.audioStems ??= [];
      song.audioStems.push(stem);
      added.push(stem);
    } catch (error) {
      toast(error.message || `Não foi possível ler ${file.name}.`);
    }
  }
  if (!added.length) return;
  try {
    await dbPut(song);
    if (isCurrentSong) {
      await connectAudioStems(song);
      if (wasPlaying) startStemPlayers();
      syncTrackDetails();
      if (!$("#audio-mixer-modal").hidden) renderAudioMixer();
    } else renderLibrary();
    toast(`${added.length} ${added.length === 1 ? "pista adicionada" : "pistas adicionadas"} à música.`);
  } catch (error) {
    song.audioStems = (song.audioStems ?? []).filter((stem) => !added.some((item) => item.id === stem.id));
    await dbPut(song).catch(() => {});
    toast(error.message || "Não foi possível carregar estas pistas.");
  }
}

function emptyAudioFile() {
  const buffer = new ArrayBuffer(44 + 16000), view = new DataView(buffer);
  const write = (offset, text) => [...text].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));
  write(0, "RIFF"); view.setUint32(4, 36 + 16000, true); write(8, "WAVE"); write(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, 8000, true); view.setUint32(28, 16000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); write(36, "data"); view.setUint32(40, 16000, true);
  return new File([buffer], "silencio.wav", { type: "audio/wav" });
}

async function createGroupedSong(files, title) {
  if (!requireStudio()) return;
  if (!title?.trim()) return toast("Escreve o nome da música.");
  const midiFiles = files.filter((file) => /\.(mid|midi|kar)$/i.test(file.name));
  if (midiFiles.length > 1) return toast("Escolhe apenas um ficheiro MIDI/KAR por música.");
  const audioFiles = files.filter((file) => !/\.(mid|midi|kar)$/i.test(file.name) && (file.type.startsWith("audio/") || /\.(mp3|wav|m4a|ogg|flac|mogg)$/i.test(file.name)));
  const zipFiles = files.filter((file) => /\.zip$/i.test(file.name));
  try { for (const file of zipFiles) audioFiles.push(...await extractAudioStems(file)); }
  catch(error) { return toast(error.message || 'Não foi possível ler o ZIP.'); }
  if(audioFiles.length > 32)return toast('Cada música pode ter até 32 pistas de áudio.');
  const midiOnly = !audioFiles.length && midiFiles.length === 1;
  const base = audioFiles.shift() || (midiOnly ? midiFiles[0] : emptyAudioFile());
  let midi = null;
  try { if (midiFiles[0]) { midi = parseMidiFile(await midiFiles[0].arrayBuffer()); } } catch (error) { return toast(error.message || "MIDI inválido."); }
  let metadata;
  try { metadata = midiOnly ? null : await readAudioChannelMetadata(base); } catch (error) { return toast(error.message || "Áudio inválido."); }
  const song = { id: crypto.randomUUID ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), (n) => n.toString(16).padStart(2, "0")).join(""), title: title.trim(), artist: "", fileName: base.name, duration: 0, addedAt: Date.now(), favorite: false, playCount: 0, tags: [], audioChannels: metadata?.channels ?? 1, audioFormat: metadata?.format ?? "audio", audioBlob: base, lyricsText: "", lyricLines: [], ...(midi ? { ...(midiOnly ? {} : { midiBlob: midiFiles[0], midiFileName: midiFiles[0].name }), bpm: midi.tempo, duration: midi.duration } : {}), ...(metadata?.moggOffset !== undefined ? { moggOffset: metadata.moggOffset } : {}) };
  try { await dbPut(song); state.songs.push(song); renderLibrary(); await selectSong(song.id); if (audioFiles.length) await addAudioStems(audioFiles, song); toast("Música criada."); } catch (error) { toast(error.message || "Não foi possível criar a música."); }
}

async function importLyrics(file) {
  if (!requireStudio()) return;
  const song = selectedSong();
  if (!song) return toast("Escolhe uma música antes de importar as letras.");
  const text = await file.text();
  song.lyricsText = text;
  const parsed = parseLyrics(text);
  song.lyricLines = parsed.timeLines;
  song.midiLyricLines = parsed.barBeatLines;
  await dbPut(song);
  renderLyrics();
  toast(song.lyricLines.length ? "Letras sincronizadas por tempo importadas." : song.midiLyricLines.length ? "Letras com referências de compasso/tempo importadas." : "Letras importadas.");
}

function exportBackup() {
  if (!requireStudio()) return;
  try {
    const blob = createBackup(state.songs, {
      setlist: state.setlist,
      playedSongIds: [...state.playedSongIds],
      currentId: state.currentId,
      autoScroll: state.autoScroll,
      volume: audio.volume,
      pedalMappings: state.pedalMappings,
      setlistCcConfig: { enabled: state.setlistCcEnabled, type: state.setlistMidiType, channel: state.setlistCcChannel, number: state.setlistCcNumber },
      quickies: state.quickies,
      hideSetlistDuringPlayback: state.hideSetlistDuringPlayback,
      interSongDelay: state.interSongDelay,
      interfaceSettings: Object.fromEntries(transferSettingKeys.map(key=>[key,localStorage.getItem(key)])),
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "StageSet-show-" + new Date().toISOString().slice(0, 10) + ".stagebackup";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    toast("Cópia de segurança preparada para descarregar.");
  } catch (error) {
    toast(error.message || "Não foi possível criar a cópia de segurança.");
  }
}

async function restoreBackupFile(file) {
  if (!requireStudio()) return;
  try {
    const backup = await readBackup(file);
    const count = backup.songs.length;
    const description = count === 1 ? "1 faixa" : count + " faixas";
    if (!window.confirm("Abrir este show com " + description + " e substituir a biblioteca e setlist atuais? Esta ação não pode ser desfeita.")) return;
    await dbReplaceAll(backup.songs);
    audio.pause();
    midiPlayer.pause();
    for(const key of transferSettingKeys){const value=backup.interfaceSettings?.[key];if(typeof value==='string')localStorage.setItem(key,value);}
    state.displayOutputs=loadDisplayOutputs();saveDisplayOutputs();backgroundEditor.refresh();applyBackground($('#lyrics-stage'),mainBackground());
    try{buttonShortcuts=JSON.parse(localStorage.getItem("stageset-button-shortcuts")||"{}");}catch{buttonShortcuts={};}
    state.songs = backup.songs;
    state.setlist = backup.setlist;
    state.playedSongIds = new Set(backup.playedSongIds ?? []);
    state.quickies = backup.quickies ?? Array(9).fill(null);
    state.autoScroll = backup.autoScroll;
    state.hideSetlistDuringPlayback = backup.hideSetlistDuringPlayback;
    state.interSongDelay = backup.interSongDelay;
    state.setlistCcEnabled = backup.setlistCcConfig.enabled;
    state.setlistMidiType = validSelectTypes.includes(backup.setlistCcConfig.type) ? backup.setlistCcConfig.type : "cc";
    state.setlistCcChannel = backup.setlistCcConfig.channel;
    state.setlistCcNumber = backup.setlistCcConfig.number;
    localStorage.setItem("stageset-hide-setlist", String(state.hideSetlistDuringPlayback));
    localStorage.setItem("stageset-inter-song-delay", String(state.interSongDelay));
    localStorage.setItem("stageset-cc-select-enabled", String(state.setlistCcEnabled));
    localStorage.setItem("stageset-midi-select-type", state.setlistMidiType);
    localStorage.setItem("stageset-cc-select-channel", String(state.setlistCcChannel));
    localStorage.setItem("stageset-cc-select-number", String(state.setlistCcNumber));
    state.currentId = backup.currentId ?? state.setlist[0] ?? state.songs[0]?.id ?? null;
    const validActions = new Set(pedalActions.map(([action]) => action));
    state.pedalMappings = backup.pedalMappings
      ? backup.pedalMappings.map((mapping) => {
        const trigger = mapping?.trigger;
        const validTrigger = trigger && (trigger.type === "note" || trigger.type === "control" || trigger.type === "cc") &&
          Number.isInteger(trigger.number) && trigger.number >= 0 && trigger.number <= 127 &&
          Number.isInteger(trigger.channel) && trigger.channel >= 0 && trigger.channel <= 15;
        return {
          trigger: validTrigger ? { type: trigger.type === "cc" ? "control" : trigger.type, inputId: String(trigger.inputId || ""), number: trigger.number, channel: trigger.channel } : null,
          action: validActions.has(mapping?.action) ? mapping.action : "none",
        };
      })
      : loadPedalMappings();
    persistSetlist();
    localStorage.setItem("stageset-played-song-ids", JSON.stringify([...state.playedSongIds]));
    persistQuickies();
    persistPedals();
    if (state.currentId) localStorage.setItem("stageset-current-song", state.currentId);
    else localStorage.removeItem("stageset-current-song");
    $("#auto-scroll").classList.toggle("active-tool", state.autoScroll);
    $("#auto-scroll").setAttribute("aria-pressed", String(state.autoScroll));
    $("#hide-setlist-during-playback").checked = state.hideSetlistDuringPlayback;
    $("#inter-song-delay").value = String(state.interSongDelay);
    audio.volume = backup.volume;
    $("#volume").value = String(backup.volume);
    midiPlayer.setVolume(backup.volume);
    state.learningPedal = -1;
    renderPedalMap();
    renderLibrary();
    renderSetlist();
    if (state.currentId) await selectSong(state.currentId);
    else await clearCurrentSong();
    renderSetlist();
    toast("Show aberto: " + description + ".");
  } catch (error) {
    toast(error.message || "Não foi possível restaurar esta cópia.");
  }
}

function updatePlayback() {
  const duration = currentDuration();
  const current = currentPosition();
  updateLyricsEditorFocus();
  $("#progress").value = duration ? String(Math.round((current / duration) * 1000)) : "0";
  $("#elapsed").textContent = formatTime(current);
  $("#remaining").textContent = `-${formatTime(Math.max(0, duration - current))}`;
  $("#lyrics-progress").value = duration ? String(Math.round((current / duration) * 1000)) : "0";
  $("#lyrics-elapsed").textContent = formatTime(current);
  $("#lyrics-remaining").textContent = `-${formatTime(Math.max(0, duration - current))}`;
  const song = selectedSong();
  if (isPlaying()) sendTimelineMidiEvents(song, state.timelineLastPosition, current);
  state.timelineLastPosition = current;
  if (isPlaying() && current >= embeddedMidiLastPosition) fireEmbeddedMidiActions("time", song, current);
  embeddedMidiLastPosition = current;
  state.queueDisplayHidden = false;
  $(".setlist-panel").classList.remove("queue-hidden");
  if (!$("#timeline-editor-modal").hidden) drawTimelineEditor();
  if (!audio.ended) syncStemPosition();
  if (loopJumping || loopAtEnd(song, current)) return;
  if (song?.lyricsText || song?.lyricOutputLyrics || midiData?.lyrics?.length) renderLyrics();
  if (state.cdgView && !isPlaying()) drawCdgFrame();
  if (midiData) {
    const position = midiData.positionToBarBeat(current);
    $("#bar-indicator").textContent = `${String(position.bar).padStart(2, "0")} · ${position.beat}`;
  }
  $("#play-glyph").textContent = isPlaying() ? "Ⅱ" : "▶";
  $("#lyrics-play-glyph").textContent = isPlaying() ? "Ⅱ" : "▶";
  $("#lyrics-play-label").textContent = isPlaying() ? "Pausar" : "Reproduzir";
  $("#lyrics-play-button").setAttribute("aria-pressed", String(isPlaying()));
}

async function stopAndRewind() {
  fireEmbeddedMidiActions("stop");
  audio.pause();
  pauseStemPlayers();
  midiPlayer.pause();
  if (isMidiSong(selectedSong()) && midiData) await midiPlayer.seek(0).catch(() => {});
  else {
    try { audio.currentTime = 0; } catch {}
    seekStemPlayers(0);
    if (hasMidiLayer(selectedSong()) && midiData) await midiPlayer.seek(0).catch(() => {});
  }
  updatePlayback();
}

function pausePlayback() {
  if (!isPlaying()) return;
  audio.pause();
  pauseStemPlayers();
  midiPlayer.pause();
  updatePlayback();
}

$("#add-audio").addEventListener("click", () => $("#audio-files").click());
$("#add-folder").addEventListener("click", () => $("#folder-files").click());
$("#empty-add").addEventListener("click", () => $("#audio-files").click());
$("#backup-export").addEventListener("click", exportBackup);
$("#report-button").addEventListener("click", () => { $("#report-modal").hidden = false; });
$("#report-setlist").addEventListener("click", () => exportReport("setlist"));
$("#report-library").addEventListener("click", () => exportReport("library"));
$("#close-report").addEventListener("click", () => { $("#report-modal").hidden = true; });
$("#report-modal").addEventListener("click", (event) => { if (event.target === event.currentTarget) event.currentTarget.hidden = true; });
$("#backup-restore").addEventListener("click", () => $("#backup-file").click());
$("#backup-file").addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (file) restoreBackupFile(file);
});
$("#audio-files").addEventListener("change", (event) => {
  const files = [...event.target.files];
  event.target.value = "";
  importAudio(files);
});
$("#folder-files").addEventListener("change", (event) => {
  const files = [...event.target.files];
  event.target.value = "";
  if (files.length) importAudio(files);
});
$("#search").addEventListener("input", (event) => { state.query = event.target.value; renderLibrary(); });
$("#search").addEventListener("keydown", (event) => { if (event.key === "Escape") event.target.value = state.query = ""; renderLibrary(); });
$("#library-sort").addEventListener("change", (event) => { state.librarySort = event.target.value; localStorage.setItem("stageset-library-sort", state.librarySort); renderLibrary(); });
$("#favorites-filter").addEventListener("click", () => { state.favoritesOnly = !state.favoritesOnly; if (state.favoritesOnly) state.historyOnly = false; renderLibrary(); });
$("#history-view").addEventListener("click", () => { state.historyOnly = !state.historyOnly; if (state.historyOnly) state.favoritesOnly = false; renderLibrary(); });
$("#play").addEventListener("click", async () => {
  if (queueDelayTimer) clearTimeout(queueDelayTimer);
  queueDelayTimer = null;
  if (!selectedSong()) return playQueueStep(1);
  if (isDocumentSong(selectedSong())) return toast("Este item é um documento, não uma faixa de áudio.");
  const wasPlaying = isPlaying();
  if (isMidiSong(selectedSong())) {
    if (midiPlayer.playing) midiPlayer.pause();
    else await midiPlayer.play().catch((error) => toast(error.message || "Não foi possível reproduzir este MIDI."));
  } else if (hasMidiLayer(selectedSong())) {
    if (isPlaying()) {
      audio.pause();
      pauseStemPlayers();
      midiPlayer.pause();
    } else {
      const results = await Promise.allSettled([audio.play(), midiPlayer.play()]);
      if (results.some((result) => result.status === "rejected")) toast("Uma das faixas do mix não pôde começar.");
    }
  } else if (isPlaying()) {
    audio.pause();
    pauseStemPlayers();
  } else await audio.play().catch(() => toast("Este ficheiro não pode ser reproduzido neste navegador."));
  if (!wasPlaying && isPlaying()) {
    fireEmbeddedMidiActions("play");
    embeddedMidiLastPosition = Math.max(-0.001, currentPosition() - 0.001);
  }
  if (!wasPlaying && isPlaying()) recordSongPlay(selectedSong().id);
  updatePlayback();
});
$("#previous").addEventListener("click", () => playQueueStep(-1));
$("#next").addEventListener("click", () => playQueueStep(1));
$("#loop-in").addEventListener("click", () => markLoopPoint("in"));
$("#loop-out").addEventListener("click", () => markLoopPoint("out"));
$("#loop-toggle").addEventListener("click", () => setLoopEnabled(!selectedSong()?.loopEnabled));
$("#backward").addEventListener("click", () => {
  const target = Math.max(0, currentPosition() - 10);
  if (isMidiSong(selectedSong())) midiPlayer.seek(target);
  else {
    audio.currentTime = target;
    if (hasMidiLayer(selectedSong())) midiPlayer.seek(target);
  }
});
$("#forward").addEventListener("click", () => {
  const target = Math.min(currentDuration(), currentPosition() + 10);
  if (isMidiSong(selectedSong())) midiPlayer.seek(target);
  else {
    audio.currentTime = target;
    if (hasMidiLayer(selectedSong())) midiPlayer.seek(target);
  }
});
$("#progress").addEventListener("input", (event) => {
  const duration = currentDuration();
  if (!duration) return;
  const target = (Number(event.target.value) / 1000) * duration;
  if (isMidiSong(selectedSong())) midiPlayer.seek(target);
  else {
    audio.currentTime = target;
    if (hasMidiLayer(selectedSong())) midiPlayer.seek(target);
  }
});
$("#volume").addEventListener("input", (event) => {
  const volume = Number(event.target.value);
  audio.volume = volume;
  stemPlayers.forEach((player) => { player.audio.volume = volume; });
  midiPlayer.setVolume(volume);
});
$("#studio-mode-toggle").addEventListener("click", () => {
  if (state.mode === "studio") { state.mode = "live"; updateModeUi(); toast("Modo Live protegido ativo."); }
  else openStudioPassword();
});
$("#settings-button").addEventListener("click", () => {
  $("#settings-lyric-highlight").value = state.lyricHighlightColor;
  $("#stem-provider").value = localStorage.getItem("stageset-stem-provider") || "stemdeck";
  renderDisplayOutputSettings(); saveDisplayOutputs();
  void refreshDisplays().catch(() => { $("#display-selection-status").textContent = "Não foi possível detetar os ecrãs."; });
  $("#settings-modal").hidden = false;
});
$("#close-settings").addEventListener("click", () => { $("#settings-modal").hidden = true; });
$("#settings-modal").addEventListener("click", (event) => { if (event.target === event.currentTarget) event.currentTarget.hidden = true; });
$("#settings-lyric-highlight").addEventListener("input", (event) => setLyricHighlightColor(event.target.value));
$("#stem-provider").addEventListener("change", (event) => {
  localStorage.setItem("stageset-stem-provider", event.target.value);
  $("#settings-modal").hidden = true;
  if (event.target.value === "zip") toast("Importa os stems externos pelo botão Pistas no editor.");
  else if (!$("#timeline-editor-modal").hidden) void refreshStemDeckConnection();
});
$("#create-display-output").addEventListener("click", addDisplayOutput);
$("#open-display-windows").addEventListener("click", openLyricDisplayWindows);
$("#open-lyrics-mosaic-settings").addEventListener("click", openLyricsMosaic);
$("#lyrics-mosaic-button").addEventListener("click", openLyricsMosaic);
$("#save-studio-password").addEventListener("click", () => { void saveStudioPasswordFromSettings(); });
document.addEventListener("click", (event) => {
  const openedMenus = [...document.querySelectorAll("details[open]")];
  for (const menu of openedMenus) {
    if (menu.contains(event.target)) {
      if (event.target.closest(".stage-tools button, .topbar-menu-items button")) menu.open = false;
    } else menu.open = false;
  }
});
$("#settings-audio").addEventListener("click", () => { const song = selectedSong(); if (!song || isMidiSong(song) || isDocumentSong(song)) return toast("Escolhe primeiro uma faixa de áudio."); $("#settings-modal").hidden = true; $("#audio-mixer-modal").hidden = false; renderAudioMixer(); });

function installWorkspaceResizing() {
  const workspace = $(".workspace"), width = Number(localStorage.getItem("stageset-sidebar-width")) || 320, extra = Number(localStorage.getItem("stageset-workspace-extra-height")) || 0;
  workspace.style.setProperty("--sidebar-width", `${Math.max(260, Math.min(620, width))}px`);
  workspace.style.setProperty("--workspace-extra-height", `${Math.max(0, Math.min(1000, extra))}px`);
  const start = (handle, diagonal) => {
    handle.addEventListener("pointerdown", (event) => {
      event.preventDefault(); handle.setPointerCapture(event.pointerId);
      const startX = event.clientX, startY = event.clientY, startWidth = parseFloat(getComputedStyle(workspace).getPropertyValue("--sidebar-width")) || 320, startExtra = parseFloat(getComputedStyle(workspace).getPropertyValue("--workspace-extra-height")) || 0;
      const move = (moveEvent) => {
        const nextWidth = Math.max(260, Math.min(620, startWidth + moveEvent.clientX - startX));
        const nextExtra = diagonal ? Math.max(0, Math.min(1000, startExtra + moveEvent.clientY - startY)) : startExtra;
        workspace.style.setProperty("--sidebar-width", `${nextWidth}px`); workspace.style.setProperty("--workspace-extra-height", `${nextExtra}px`);
        localStorage.setItem("stageset-sidebar-width", String(nextWidth)); localStorage.setItem("stageset-workspace-extra-height", String(nextExtra));
      };
      const end = () => { handle.removeEventListener("pointermove", move); handle.removeEventListener("pointerup", end); handle.removeEventListener("pointercancel", end); };
      handle.addEventListener("pointermove", move); handle.addEventListener("pointerup", end); handle.addEventListener("pointercancel", end);
    });
  };
  start($(".workspace-resizer"), false); start($(".workspace-resize-corner"), true);
}
$("#settings-midi").addEventListener("click", () => { $("#settings-modal").hidden = true; renderPedalMap(); $("#pedal-modal").hidden = false; });
$("#refresh-audio-inputs").addEventListener("click", () => { void refreshAudioInputDevices({ requestAccess: true, notify: true }); });
$("#audio-input-device").addEventListener("change", (event) => localStorage.setItem("stageset-audio-input-device", event.target.value));
$("#video-input-device").addEventListener("change", (event) => localStorage.setItem("stageset-video-input-device", event.target.value));
$("#studio-password-form").addEventListener("submit", submitStudioPassword);
$("#close-studio-password").addEventListener("click", () => { $("#studio-password-modal").hidden = true; });
$("#cancel-studio-password").addEventListener("click", () => { $("#studio-password-modal").hidden = true; });
$("#studio-password-modal").addEventListener("click", (event) => { if (event.target === event.currentTarget) event.currentTarget.hidden = true; });
$("#clear-played").addEventListener("click", () => {
  if (!requireStudio()) return;
  state.playedSongIds.clear(); localStorage.removeItem("stageset-played-song-ids"); renderLibrary(); renderSetlist(); toast("Marcas de músicas tocadas limpas.");
});
$("#clear-setlist").addEventListener("click", () => { if (!requireStudio()) return; if (queueDelayTimer) clearTimeout(queueDelayTimer); queueDelayTimer = null; state.setlist = []; persistSetlist(); renderLibrary(); renderSetlist(); toast("Setlist limpa."); });
$("#setlist-save").addEventListener("click", exportSetlistFile);
$("#setlist-load").addEventListener("click", () => requireStudio() && $("#setlist-file").click());
$("#queue-save").addEventListener("click", exportSetlistFile);
$("#queue-load").addEventListener("click", () => requireStudio() && $("#setlist-file").click());
$("#setlist-file").addEventListener("change", (event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) importSetlistFile(file); });
$("#hide-setlist-during-playback").addEventListener("change", saveSetlistPreferences);
$("#inter-song-delay").addEventListener("change", saveSetlistPreferences);
$("#queue-end-action").value = localStorage.getItem("stageset-queue-end-action") === "stop" ? "stop" : "next";
$("#queue-end-action").addEventListener("change", saveSetlistPreferences);
$("#lyrics-edit-button").addEventListener("click", () => openLyricsEditor());
$("#lyrics-play-button").addEventListener("click", () => $("#play").click());
$("#lyric-size-down").addEventListener("click", () => adjustStageLyricSize(-2));
$("#lyric-size-up").addEventListener("click", () => adjustStageLyricSize(2));
$("#lyrics-import-button").addEventListener("click", () => $("#lyrics-file").click());
$("#lyrics-file").addEventListener("change", async (event) => {
  const file=event.target.files?.[0];event.target.value='';if(!file||!editingLyricsSongId)return;
  try {
    const midi=/\.(mid|midi|kar)$/i.test(file.name) ? parseMidiFile(await file.arrayBuffer()) : null;
    if(midi)$('#lyrics-bpm').value=String(midi.tempo);
    const text=midi ? readableMidiLyrics(midi).map(line=>formatLyricTimestamp(line.time)+' '+line.text).join('\n') : await file.text();
    if(midi&&!text.trim())return toast('BPM importado; o MIDI não contém letras.');
    $('#lyrics-editor-text').value=text;renderLyricsEditorPreview();await autoSaveLyricsDraft();
    toast(midi?'Letras, tempos e BPM importados.':'Letras importadas.');
  } catch(error) { toast(error.message||'Não foi possível importar as letras.'); }
});
$("#lyrics-export-kar").addEventListener("click", () => { void exportLyricsMidi("kar"); });
$("#lyrics-export-midi").addEventListener("click", () => { void exportLyricsMidi("mid"); });
$("#lyrics-export-text").addEventListener("click", () => { const song = selectedSong(); if (!song) return; const label = editingLyricsOutput === "main" ? "Palco" : (state.displayOutputs.find((output) => output.id === editingLyricsOutput)?.name || "Saida"); const url = URL.createObjectURL(new Blob([$("#lyrics-editor-text").value], {type:"text/plain;charset=utf-8"})); const link = document.createElement("a"); link.href = url; link.download = `${song.title}-${label}`.replace(/[\\/:*?"<>|]+/g, "-") + ".txt"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 30000); });
$("#lyrics-import-tempo").addEventListener("click", () => $("#lyrics-tempo-file").click());
$("#lyrics-tempo-file").addEventListener("change", async (event) => { const file = event.target.files?.[0]; event.target.value = ""; if (!file) return; try { const midi = parseMidiFile(await file.arrayBuffer()); $("#lyrics-bpm").value = String(Math.round(midi.tempo * 10) / 10); toast(`BPM inicial: ${$("#lyrics-bpm").value}`); } catch (error) { toast(error.message || "Não foi possível ler o MIDI."); } });
$("#add-pedal").addEventListener("click", () => { if (!requireStudio()) return; state.pedalMappings.push({trigger:null, action:"none"}); persistPedals(); renderPedalMap(); });
$("#lyrics-learn-shortcut").addEventListener("click", async () => {
  if (!requireStudio() || !editingLyricsSongId) return;
  state.lyricShortcutLearning = true;
  $("#lyrics-learn-shortcut").textContent = "Pressiona uma tecla ou toca uma nota MIDI…";
  $("#lyrics-shortcut-status").textContent = "À espera de tecla ou nota";
  if (navigator.requestMIDIAccess && !state.midiAccess) {
    try { state.midiAccess = await navigator.requestMIDIAccess({ software: true, sysex: state.midiAccess?.sysexEnabled || false }); state.midiAccess.inputs.forEach(attachPedalInput); }
    catch { toast("MIDI indisponível; podes aprender uma tecla do teclado."); }
  }
});
$("#timeline-editor-button").addEventListener("click", openTimelineEditor);
$("#stem-split-check").addEventListener("click", () => { void refreshStemDeckConnection(); });
$("#stemdeck-select-app").addEventListener("click", () => { void launchStemDeck(true); });
$("#stemdeck-launch-app").addEventListener("click", () => { void launchStemDeck(false); });
$("#stem-split-run").addEventListener("click", () => { void splitCurrentSongStems(); });
$("#stem-split-cancel").addEventListener("click", () => { void cancelStemDeckSplit(); });
$("#stem-import-external").addEventListener("click", () => $("#stem-external-files").click());
$("#stem-external-files").addEventListener("change", async (event) => { if (event.target.files?.length) await addAudioStems(event.target.files); event.target.value = ""; });
$("#close-timeline-editor").addEventListener("click", () => { $("#timeline-editor-modal").hidden = true; });
$("#timeline-editor-modal").addEventListener("click", (event) => { if (event.target === event.currentTarget) event.currentTarget.hidden = true; });
$("#timeline-midi-channel").addEventListener("change", drawTimelineEditor);
$("#timeline-cc-number").addEventListener("change", drawTimelineEditor);
$("#timeline-bpm").addEventListener("change", async (event) => {
  const song = selectedSong(), bpm = Number(event.target.value);
  if (!song || !Number.isFinite(bpm) || bpm < 20 || bpm > 300) { event.target.value = String(song?.bpm || midiData?.tempo || 120); return toast("O BPM deve estar entre 20 e 300."); }
  pushTimelineUndo(song);
  const updated = { ...song, bpm };
  try { await dbPut(updated); state.songs[state.songs.findIndex((item) => item.id === song.id)] = updated; drawTimelineEditor(); } catch { toast("Não foi possível guardar o BPM."); }
});
$("#timeline-event-type").addEventListener("change", (event) => {
  const type = event.target.value;
  $("#timeline-event-number-label").hidden = type !== "note";
  $("#timeline-cc-number").closest("label").hidden = type !== "cc";
  $("#timeline-midi-channel").closest("label").hidden = type === "song";
  $("#timeline-cc-value").closest("label").firstChild.textContent = type === "cc" ? "Valor CC " : type === "note" ? "Velocidade " : type === "pitch" ? "Pitch Bend " : "Valor MIDI ";
  $("#timeline-add-cc").textContent = `Adicionar ${type === "cc" ? "ponto CC" : midiSelectLabel(type)}`;
  drawTimelineEditor();
});
$("#timeline-cc-value").addEventListener("input", (event) => { $("#timeline-cc-value-label").value = event.target.value; });
$("#timeline-add-cc").addEventListener("click", addTimelineControllerPoint);
$("#timeline-zoom-in").addEventListener("click", () => setTimelineZoom(state.timelineZoom + 0.1));
$("#timeline-zoom-out").addEventListener("click", () => setTimelineZoom(state.timelineZoom - 0.1));
$("#timeline-scroll").addEventListener("wheel", (event) => {
  if (event.shiftKey) { event.preventDefault(); event.currentTarget.scrollLeft += event.deltaY || event.deltaX; return; }
  event.preventDefault(); setTimelineZoom(state.timelineZoom + (event.deltaY < 0 ? 0.1 : -0.1), (event.clientX - event.currentTarget.getBoundingClientRect().left) / Math.max(1, event.currentTarget.clientWidth));
}, { passive: false });
$("#timeline-play").addEventListener("click", () => $("#play").click());
$("#timeline-pause").addEventListener("click", () => { if (isPlaying()) $("#play").click(); });
$("#timeline-stop").addEventListener("click", () => { void stopAndRewind(); });
$("#timeline-back").addEventListener("click", () => { const target = Math.max(0, currentPosition() - 5); if (isMidiSong(selectedSong())) midiPlayer.seek(target); else { audio.currentTime = target; if (hasMidiLayer(selectedSong())) midiPlayer.seek(target); } drawTimelineEditor(); });
$("#timeline-forward").addEventListener("click", () => { const target = Math.min(currentDuration(), currentPosition() + 5); if (isMidiSong(selectedSong())) midiPlayer.seek(target); else { audio.currentTime = target; if (hasMidiLayer(selectedSong())) midiPlayer.seek(target); } drawTimelineEditor(); });
$("#timeline-convert-midi").addEventListener("click", exportTimelineMidi);
$("#timeline-save-lyrics").addEventListener("click", () => { $("#timeline-editor-modal").hidden = true; openLyricsEditor(); });
$("#timeline-canvas").addEventListener("pointerdown", beginTimelinePointerEdit);
$("#timeline-canvas").addEventListener("pointermove", (event) => { void moveTimelinePointerEdit(event); });
$("#timeline-canvas").addEventListener("pointerup", () => { void finishTimelinePointerEdit(); });
$("#timeline-canvas").addEventListener("pointercancel", () => { void finishTimelinePointerEdit(); });
$("#timeline-canvas").addEventListener("click", async (event) => {
  if (timelinePointerDragged) { timelinePointerDragged = false; return; }
  const song = selectedSong(), canvas = event.currentTarget, rect = canvas.getBoundingClientRect();
  if (!song) return;
  const x = (event.clientX - rect.left) / rect.width * canvas.width, y = (event.clientY - rect.top) / rect.height * canvas.height;
  const duration = Math.max(1, currentDuration(), midiData?.duration ?? 0), time = Math.max(0, Math.min(duration, (x - 92) / (canvas.width - 108) * duration));
  if (y >= 435) { if (!isMidiSong(song)) audio.currentTime = Math.min(time, audio.duration || time); if (midiData) midiPlayer.seek(time); drawTimelineEditor(); return; }
  if (!isMidiSong(song)) audio.currentTime = Math.min(time, audio.duration || time); if (midiData) midiPlayer.seek(time);
  if (y >= 332 && y < 435) {
    const channel = Number($("#timeline-midi-channel").value), controller = Number($("#timeline-cc-number").value), value = Number($("#timeline-cc-value").value), type = $("#timeline-event-type").value;
    const existing = (song.timelineControllers ?? []).filter((item) => item.channel === channel && (item.type ?? "cc") === type && (type !== "cc" || item.controller === controller)).sort((a, b) => Math.abs(a.time - time) - Math.abs(b.time - time))[0];
    const edits = [...(song.timelineControllers ?? [])];
    if (existing && Math.abs(existing.time - time) < duration * 0.035) { const index = edits.indexOf(existing); edits[index] = { ...existing, value }; }
    else edits.push({ time, channel, type, controller, number: type === "note" ? Number($("#timeline-event-number").value) : controller, value, custom: true });
    pushTimelineUndo(song);
    const updated = { ...song, timelineControllers: edits.sort((a, b) => a.time - b.time) };
    await dbPut(updated); state.songs[state.songs.findIndex((item) => item.id === song.id)] = updated;
  }
  drawTimelineEditor();
});
$("#timeline-canvas").addEventListener("dblclick", (event) => {
  const { y } = timelineCoordinate(event);
  if (y < 435) return;
  $("#timeline-editor-modal").hidden = true; openLyricsEditor(); captureLyricTimestamp();
});
$("#midi-layer-button").addEventListener("click", () => selectedSong() && !isMidiSong(selectedSong()) ? $("#midi-layer-file").click() : toast("Escolhe uma faixa MP3 ou WAV primeiro."));
$("#midi-mixer-button").addEventListener("click", () => {
  renderMidiMixer();
  if (midiData) $("#midi-mixer-modal").hidden = false;
});
$("#midi-refresh-outputs").addEventListener("click", async () => {
  if (!requireStudio()) return;
  if (!navigator.requestMIDIAccess) return toast("Este browser não disponibiliza portas MIDI.");
  try {
    state.midiAccess = await navigator.requestMIDIAccess({ software: true, sysex: state.midiAccess?.sysexEnabled || false });
    state.midiAccess.onstatechange = () => { renderMidiInputs(); renderMidiOutputs(); if (!$("#midi-mixer-modal").hidden) renderMidiMixer(); };
    renderMidiInputs(); renderMidiOutputs(); renderMidiMixer();
    toast("Portas MIDI atualizadas.");
  } catch (error) {
    toast(error.name === "NotAllowedError" ? "O browser não autorizou o acesso MIDI." : "Não foi possível consultar as portas MIDI.");
  }
});
$("#audio-mixer-button").addEventListener("click", () => {
  const song = selectedSong();
  if (!song) return;
  $("#audio-mixer-modal").hidden = false;
  renderAudioMixer();
});
$("#choose-audio-output").addEventListener("click", chooseAudioOutputDevice);
$("#audio-output-device").addEventListener("change", async (event) => {
  const option = event.target.selectedOptions[0];
  try {
    await applyAudioOutputDevice(event.target.value, option?.textContent ?? "");
    await refreshAudioOutputDevices();
  } catch (error) {
    toast(error.message || "Não foi possível mudar a interface de áudio.");
    await refreshAudioOutputDevices();
  }
});
if (navigator.mediaDevices?.addEventListener) navigator.mediaDevices.addEventListener("devicechange", () => refreshAudioOutputDevices());
$("#audio-stems-button").addEventListener("click", () => selectedSong() ? $("#audio-stems-files").click() : toast("Escolhe uma música primeiro."));
$("#create-song").addEventListener("click", () => { if (!requireStudio()) return; $("#new-song-name").value = ""; $("#new-song-modal").hidden = false; $("#new-song-name").focus(); });
$("#cancel-new-song").addEventListener("click", () => { $("#new-song-modal").hidden = true; });
$("#new-song-empty").addEventListener("click", () => { const name = $("#new-song-name").value.trim(); if (!name) return toast("Escreve o nome da música."); $("#new-song-modal").hidden = true; void createGroupedSong([], name); });
$("#new-song-import").addEventListener("click", () => { if (!$("#new-song-name").value.trim()) return toast("Escreve o nome da música."); $("#new-song-files").click(); });
$("#new-song-files").addEventListener("change", (event) => { const files = [...event.target.files], name = $("#new-song-name").value.trim(); event.target.value = ""; if (files.length) { $("#new-song-modal").hidden = true; void createGroupedSong(files, name); } });
$("#audio-stems-files").addEventListener("change", (event) => {
  const files = [...event.target.files];
  event.target.value = "";
  if (files.length) addAudioStems(files);
});
$("#midi-layer-file").addEventListener("change", async (event) => {
  if (!requireStudio()) { event.target.value = ""; return; }
  const file = event.target.files?.[0];
  const song = selectedSong();
  event.target.value = "";
  if (!file || !song) return;
  try {
    const imported=parseMidiFile(await file.arrayBuffer());
    song.midiBlob=file;song.midiFileName=file.name;song.bpm=imported.tempo;song.tempo=1;
    await dbPut(song);await selectSong(song.id);toast('Faixa MIDI e BPM associados à música.');
  } catch(error) { toast(error.message || 'Não foi possível ler o MIDI/KAR.'); }
});
$("#cdg-layer-button").addEventListener("click", () => selectedSong() && !isMidiSong(selectedSong()) ? $("#cdg-layer-file").click() : toast("Escolhe uma faixa MP3 ou WAV primeiro."));
$("#cdg-layer-file").addEventListener("change", async (event) => {
  if (!requireStudio()) { event.target.value = ""; return; }
  const file = event.target.files?.[0];
  const song = selectedSong();
  event.target.value = "";
  if (!file || !song) return;
  if (isMidiSong(song)) return toast("O CD+G tem de ser associado a uma faixa de áudio.");
  try {
    new CdgDecoder(await file.arrayBuffer());
    song.cdgBlob = file;
    song.cdgFileName = file.name;
    await dbPut(song);
    await selectSong(song.id);
    toast("Karaoke CD+G associado à faixa.");
  } catch (error) {
    toast(error.message || "Não foi possível abrir este ficheiro CD+G.");
  }
});
$("#cdg-view-button").addEventListener("click", () => setCdgView(!state.cdgView));
$("#auto-scroll").addEventListener("click", () => {
  state.autoScroll = !state.autoScroll;
  $("#auto-scroll").classList.toggle("active-tool", state.autoScroll);
  $("#auto-scroll").setAttribute("aria-pressed", String(state.autoScroll));
  renderLyrics();
});
for (const [selector, delta] of [["#transpose-down", -1], ["#transpose-up", 1]]) {
  $(selector).addEventListener("click", async () => {
    if (!requireStudio()) return;
    const song = selectedSong();
    if (!song) return toast("Escolhe uma música primeiro.");
    const priorTranspose = song.transpose ?? 0;
    song.transpose = Math.max(-12, Math.min(12, (song.transpose ?? 0) + delta));
    try {
      if (midiData) await midiPlayer.setTranspose(song.transpose);
      if (!isMidiSong(song)) await setAudioTranspose(song.transpose);
      await dbPut(song);
    } catch (error) {
      song.transpose = priorTranspose;
      if (midiData) await midiPlayer.setTranspose(priorTranspose).catch(() => {});
      if (!isMidiSong(song)) await setAudioTranspose(priorTranspose).catch(() => {});
      return toast(error.message || "Não foi possível transpor esta faixa.");
    }
    syncTrackDetails();
  });
}
async function adjustTempo(delta) {
  if (!requireStudio()) return;
  const song = selectedSong();
  if (!song || isDocumentSong(song)) return;
  song.tempo = Math.round(Math.max(0.5, Math.min(1.5, (song.tempo ?? 1) + delta)) * 100) / 100;
  await dbPut(song);
  if (!isMidiSong(song)) audio.playbackRate = song.tempo;
  stemPlayers.forEach((player) => { player.audio.playbackRate = song.tempo; });
  if (midiData) await midiPlayer.setRate(song.tempo);
  $("#tempo-value").textContent = `${Math.round(song.tempo * 100)}%`;
  updatePlayback();
}
$("#tempo-down").addEventListener("click", () => adjustTempo(-0.05));
$("#tempo-up").addEventListener("click", () => adjustTempo(0.05));
$("#fullscreen-button").addEventListener("click", async () => {
  document.body.classList.toggle("fullscreen");
  if (document.body.classList.contains("fullscreen")) await document.documentElement.requestFullscreen?.().catch(() => {});
  else if (document.fullscreenElement) await document.exitFullscreen?.().catch(() => {});
});
$("#help-button").addEventListener("click", () => { $("#help-modal").hidden = false; });
$("#close-help").addEventListener("click", () => { $("#help-modal").hidden = true; });
$("#help-modal").addEventListener("click", (event) => { if (event.target === event.currentTarget) event.currentTarget.hidden = true; });
$("#song-editor-form").addEventListener("submit", saveSongEditor);
$("#close-song-editor").addEventListener("click", closeSongEditor);
$("#cancel-song-editor").addEventListener("click", closeSongEditor);
$("#song-editor-modal").addEventListener("click", (event) => { if (event.target === event.currentTarget) closeSongEditor(); });
$("#lyrics-editor-form").addEventListener("submit", saveLyricsEditor);
$("#lyrics-stamp-current").addEventListener("click", captureLyricTimestamp);
$("#lyrics-apply-color").addEventListener("click", applyLyricColorToSelection);
$("#lyrics-color-picker").addEventListener("input", (event) => { $("#lyrics-color-preview").style.backgroundColor = event.target.value; });
$("#lyrics-color-picker").addEventListener("change", () => { const textarea = $("#lyrics-editor-text"); if (textarea.selectionStart !== textarea.selectionEnd) applyLyricColorToSelection(); });
$("#lyrics-editor-text").addEventListener("input", () => {
  renderLyricsEditorPreview();
  clearTimeout(lyricsAutoSaveTimer);
  lyricsAutoSaveTimer = setTimeout(() => { void autoSaveLyricsDraft(); }, 700);
});
$("#lyrics-editor-text").addEventListener("scroll", renderLyricsEditorPreview, { passive: true });
$("#lyrics-create-window-shortcut").addEventListener("click", () => { $("#settings-modal").hidden = false; renderDisplayOutputSettings(); $("#new-display-output-name").focus(); });
$("#lyrics-output-target").addEventListener("change", (event) => showLyricsEditorOutput(event.target.value));
$("#lyrics-output-font-size").addEventListener("input", (event) => {
  const size = Number(event.target.value);
  $("#lyrics-output-font-label").textContent = `${size} px`;
  previewLyricOutputSettings(editingLyricsOutput, { fontSize: size });
  if (editingLyricsOutput === "main") $("#lyrics-content").style.setProperty("--lyric-font-size", `${size}px`);
});
$("#lyrics-output-font-size").addEventListener("change", (event) => { void saveLyricOutputSettings(editingLyricsOutput, { fontSize: Number(event.target.value) }); });
$("#lyrics-output-highlight").addEventListener("input", (event) => { previewLyricOutputSettings(editingLyricsOutput, { highlightColor: event.target.value }); if (editingLyricsOutput === "main") { const line = $("#lyrics-content .lyric-line.current"); if (line) line.style.backgroundColor = colorWithAlpha(event.target.value); } });
$("#lyrics-output-highlight").addEventListener("change", (event) => { void saveLyricOutputSettings(editingLyricsOutput, { highlightColor: event.target.value }); });
$("#lyrics-progress").addEventListener("input", (event) => { const duration = currentDuration(); if (duration) seekPlaybackTo(Number(event.target.value) / 1000 * duration); });
$("#lyrics-rewind-1").addEventListener("click", () => seekPlaybackTo(currentPosition() - 1));
$("#lyrics-forward-1").addEventListener("click", () => seekPlaybackTo(currentPosition() + 1));
$("#lyrics-stop-button").addEventListener("click", () => { void stopAndRewind(); });
$("#close-lyrics-editor").addEventListener("click", closeLyricsEditor);
$("#cancel-lyrics-editor").addEventListener("click", closeLyricsEditor);
$("#lyrics-editor-modal").addEventListener("click", (event) => { if (event.target === event.currentTarget) closeLyricsEditor(); });
$("#close-midi-mixer").addEventListener("click", () => { $("#midi-mixer-modal").hidden = true; });
$("#midi-mixer-modal").addEventListener("click", (event) => { if (event.target === event.currentTarget) event.currentTarget.hidden = true; });
$("#close-audio-mixer").addEventListener("click", () => { $("#audio-mixer-modal").hidden = true; });
$("#audio-mixer-modal").addEventListener("click", (event) => { if (event.target === event.currentTarget) event.currentTarget.hidden = true; });
$("#pedal-button").addEventListener("click", () => { renderPedalMap(); $("#pedal-modal").hidden = false; });
$("#midi-assign-song").addEventListener("change", (event) => { const song = state.songs.find((item) => item.id === event.target.value); const mapping = songMidiSelectMapping(song); $("#midi-assign-value").value = mapping ? String(mapping.value) : ""; });
$("#midi-assign-save").addEventListener("click", () => { const song = state.songs.find((item) => item.id === $("#midi-assign-song").value); if (!song) return toast("Escolhe uma música da setlist."); void saveSongSetlistCcValue(song, $("#midi-assign-value")); });
$("#song-cc-form").addEventListener("submit", saveSongCcEditor);
$("#song-cc-type").addEventListener("change", (event) => {
  const type = validSelectTypes.includes(event.target.value) ? event.target.value : "cc";
  const song = state.songs.find((item) => item.id === editingCcSongId), mapping = songMidiSelectMapping(song, type);
  $("#song-cc-channel").value = String(mapping?.type === type ? mapping.channel : state.setlistCcChannel);
  $("#song-cc-number").value = String(mapping?.type === "cc" ? mapping.number : state.setlistCcNumber);
  $("#song-cc-value").value = String(mapping?.type === type ? mapping.value : 0);
  $("#song-cc-learn-status").textContent = `Introduz os valores ou aprende uma mensagem ${midiSelectLabel(type)}.`;
  updateSongCcEditorFields();
});
$("#song-cc-learn").addEventListener("click", () => { void beginSongMidiLearn(); });
$("#close-song-cc").addEventListener("click", closeSongCcEditor);
$("#cancel-song-cc").addEventListener("click", closeSongCcEditor);
$("#song-cc-modal").addEventListener("click", (event) => { if (event.target === event.currentTarget) closeSongCcEditor(); });
$("#setlist-cc-enabled").addEventListener("change", saveSetlistCcConfig);
$("#setlist-midi-type").addEventListener("change", saveSetlistCcConfig);
$("#setlist-midi-learn").addEventListener("click", () => {
  if (!state.pedalInput) return toast("Liga e seleciona uma entrada MIDI antes de aprender.");
  state.learningSetlistMidi = true;
  $("#setlist-midi-learn-status").textContent = `À espera de ${midiSelectLabel(state.setlistMidiType)}… toca no controlador.`;
  $("#setlist-midi-learn").textContent = "A ouvir MIDI…";
  $("#setlist-midi-learn").disabled = true;
});
$("#setlist-cc-channel").addEventListener("change", saveSetlistCcConfig);
$("#setlist-cc-number").addEventListener("change", (event) => {
  if (state.setlistMidiType === "program") return saveSetlistCcConfig();
  const value = Number(event.target.value);
  if (!Number.isInteger(value) || value < 0 || value > 127) {
    event.target.value = String(state.setlistCcNumber);
    return toast("O número CC tem de estar entre 0 e 127.");
  }
  saveSetlistCcConfig();
});
$("#close-pedals").addEventListener("click", () => { $("#pedal-modal").hidden = true; state.learningPedal = -1; state.learningSetlistMidi = false; renderPedalMap(); });
$("#pedal-modal").addEventListener("click", (event) => { if (event.target === event.currentTarget) { event.currentTarget.hidden = true; state.learningPedal = -1; state.learningSetlistMidi = false; renderPedalMap(); } });
$("#connect-pedal").addEventListener("click", connectMidiPedal);
$("#pedal-device").addEventListener("change", (event) => {
  const input = allMidiInputs().find((candidate) => candidate.id === event.target.value) ?? null;
  attachPedalInput(input);
});
$("#midi-output-device").addEventListener("change", async (event) => {
  const id = event.target.value;
  const output = id === "internal" ? null : allMidiOutputs().find((candidate) => candidate.id === id) ?? null;
  state.midiOutputId = output?.id ?? "";
  try {
    await midiPlayer.setMidiOutput(output);
    $("#midi-output-status").textContent = output ? `Saída ativa: ${output.name || "MIDI"}` : "A tocar pelo sintetizador interno";
  } catch {
    state.midiOutputId = "";
    event.target.value = "internal";
    await midiPlayer.setMidiOutput(null).catch(() => {});
    $("#midi-output-status").textContent = "Não foi possível ativar a saída MIDI";
  }
});
audio.addEventListener("timeupdate", updatePlayback);
audio.addEventListener("loadedmetadata", () => {
  const song = selectedSong();
  if (song && Number.isFinite(audio.duration)) {
    song.duration = Math.max(audio.duration, hasMidiLayer(song) ? midiData?.duration || 0 : 0, ...(song.audioStems ?? []).map((stem) => Number.isFinite(stem.duration) ? stem.duration : 0));
    dbPut(song);
    $("#track-duration").textContent = formatTime(song.duration);
    $("#remaining").textContent = `-${formatTime(song.duration)}`;
    renderLibrary();
  }
});
audio.addEventListener("play", () => { startStemPlayers(); updatePlayback(); });
audio.addEventListener("play", refreshCdgFrame);
audio.addEventListener("play", () => pitchContext?.resume().catch(() => {}));
audio.addEventListener("pause", () => { if (!audio.ended) pauseStemPlayers(); updatePlayback(); });
audio.addEventListener("pause", () => { if (stemPlayers.every((player) => player.audio.paused || player.audio.ended)) pitchContext?.suspend().catch(() => {}); });
audio.addEventListener("seeking", () => pitchNode?.port.postMessage({ type: "reset" }));
audio.addEventListener("seeking", () => seekStemPlayers(audio.currentTime));
audio.addEventListener("seeked", () => { syncStemPosition(true); updatePlayback(); refreshCdgFrame(); });
audio.addEventListener("ended", () => {
  if (loopAtEnd(selectedSong(), currentPosition(), true)) return;
  if (stemPlayers.some((player) => !player.audio.ended && !player.audio.paused)) return updatePlayback();
  if (!hasMidiLayer(selectedSong()) || !midiData) advanceAfterTrack();
  else if (!midiPlayer.playing) advanceAfterTrack();
  else updatePlayback();
});
midiPlayer.onTime = updatePlayback;
midiPlayer.onEnded = () => {
  if (loopAtEnd(selectedSong(), currentPosition(), true)) return;
  if (!hasMidiLayer(selectedSong()) || (audio.ended && stemPlayers.every((player) => player.audio.ended || player.audio.paused))) advanceAfterTrack();
  else updatePlayback();
};

function advanceAfterTrack() {
  if (sessionController?.isSlave()) { pausePlayback(); return; }
  fireEmbeddedMidiActions("stop");
  if (state.quickiePlaying) {
    state.quickiePlaying = false;
    state.queueDisplayHidden = false;
    $(".setlist-panel").classList.remove("queue-hidden");
    updatePlayback();
    return;
  }
  state.queueDisplayHidden = false;
  $(".setlist-panel").classList.remove("queue-hidden");
  if (localStorage.getItem("stageset-queue-end-action") === "stop") { updatePlayback(); return; }
  const queueIndex = currentQueueIndex();
  const nextId = queueIndex >= 0 ? state.setlist[queueIndex + 1] : null;
  if (nextId && state.interSongDelay > 0) {
    toast(`Próxima música em ${state.interSongDelay} s.`);
    queueDelayTimer = setTimeout(() => {
      queueDelayTimer = null;
      playQueueStep(1);
    }, state.interSongDelay * 1000);
  } else playQueueStep(1);
}
audio.volume = 0.8;
midiPlayer.setVolume(0.8);

document.addEventListener("keydown", (event) => {
  const target = event.target;
  const isTyping = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target?.isContentEditable;
  if (buttonLearnTarget && event.key === "Escape") { buttonLearnTarget = null; $("#learn-modal").hidden = true; toast("Aprendizagem cancelada."); event.preventDefault(); return; }
  if (buttonLearnTarget && buttonLearnKind === "key" && !event.repeat && !["Shift", "Control", "Alt", "Meta"].includes(event.key)) {
    assignButtonShortcut("key", { type: "key", code: event.code, ctrl: event.ctrlKey, alt: event.altKey, shift: event.shiftKey, meta: event.metaKey });
    localStorage.setItem("stageset-button-shortcuts", JSON.stringify(buttonShortcuts)); buttonLearnTarget = null; event.preventDefault(); toast("Atalho de teclado guardado."); return;
  }
  if (!isTyping && !event.repeat) {
    const match = Object.entries(buttonShortcuts).map(([id,s])=>[id,s.key||s]).find(([, shortcut]) => shortcut.type === "key" && shortcut.code === event.code && !!shortcut.ctrl === event.ctrlKey && !!shortcut.alt === event.altKey && !!shortcut.shift === event.shiftKey && !!shortcut.meta === event.metaKey);
    if (match) { const button = shortcutButton(match[0]); if (button && !button.disabled && button.getClientRects().length) { event.preventDefault(); button.click(); return; } }
  }
  if (state.lyricShortcutLearning && !event.ctrlKey && !event.altKey && !event.metaKey && event.key !== "Escape") {
    event.preventDefault();
    saveLyricShortcut({ type: "key", code: event.code, label: event.key.length === 1 ? event.key.toUpperCase() : event.key });
    return;
  }
  const learnedLyricKey = selectedSong()?.lyricShortcut;
  if (state.mode === "studio" && event.code && learnedLyricKey?.type === "key" && event.code === learnedLyricKey.code) { event.preventDefault(); triggerLyricTimestamp(); return; }
  if (event.key === "Escape") {
    const openModals = [...document.querySelectorAll(".modal-backdrop:not([hidden])")];
    if (openModals.length) {
      event.preventDefault();
      openModals.forEach((modal) => { modal.hidden = true; });
      closeSongEditor(); closeLyricsEditor(); closeSongCcEditor();
      state.learningPedal = -1; state.learningSetlistMidi = false; state.lyricShortcutLearning = false;
      renderPedalMap();
      return;
    }
    const openMenus = [...document.querySelectorAll("details[open]")];
    if (openMenus.length) { event.preventDefault(); openMenus.forEach((menu) => { menu.open = false; }); return; }
    if (document.fullscreenElement) { event.preventDefault(); void document.exitFullscreen?.().catch(() => {}); document.body.classList.remove("fullscreen"); return; }
    if (isPlaying()) { event.preventDefault(); void stopAndRewind(); }
  }
  if (state.mode === "studio" && !$("#timeline-editor-modal").hidden && event.ctrlKey && !event.shiftKey && event.key.toLowerCase() === "z" && !isTyping) {
    event.preventDefault(); void undoTimelineEdit(); return;
  }
  if (event.key === "F1") { event.preventDefault(); $("#help-modal").hidden = false; }
  if (isTyping) return;
  if (event.ctrlKey && !event.altKey && !event.metaKey && event.key.toLowerCase() === "e") {
    event.preventDefault();
    quickEditLyric(event.shiftKey);
    return;
  }
  if (event.ctrlKey && !event.altKey && !event.metaKey && /^[1-9]$/.test(event.key)) {
    event.preventDefault();
    assignQuickie(Number(event.key) - 1);
    return;
  }
  if (/^[1-9]$/.test(event.key)) {
    const index = Number(event.key) - 1;
    if (state.quickies[index]) {
      event.preventDefault();
      playQuickie(index).catch((error) => toast(error.message || "Não foi possível reproduzir este Quickie."));
      return;
    }
  }
  if (midiData && (event.key === "F7" || event.key === "F8")) {
    event.preventDefault();
    moveMidiBar(event.key === "F7" ? -1 : 1);
    return;
  }
  if (event.key === "Shift" && selectedSong()?.loopEnabled) { event.preventDefault(); setLoopEnabled(false); return; }
  if (event.key === "F9" || event.key === "F10") {
    if (selectedSong() && !isDocumentSong(selectedSong())) { event.preventDefault(); $(event.key === "F9" ? "#transpose-down" : "#transpose-up").click(); }
    return;
  }
  if (event.key === "F11" || event.key === "F12") {
    if (selectedSong() && !isDocumentSong(selectedSong())) { event.preventDefault(); $(event.key === "F11" ? "#tempo-down" : "#tempo-up").click(); }
    return;
  }
  if (event.key === "[") { event.preventDefault(); markLoopPoint("in"); return; }
  if (event.key === "]") { event.preventDefault(); markLoopPoint("out"); return; }
  if (event.key === "ArrowUp" || event.key === "ArrowDown") {
    event.preventDefault();
    stepLyrics(event.key === "ArrowUp" ? -1 : 1);
    return;
  }
  if (event.key.toLowerCase() === "l") { event.preventDefault(); setLoopEnabled(!selectedSong()?.loopEnabled); return; }
  if (event.key === "/") { event.preventDefault(); $("#search").focus(); return; }
  if (event.code === "Space") { event.preventDefault(); $("#play").click(); }
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    event.preventDefault();
    const delta = event.key === "ArrowLeft" ? -10 : 10;
    if (isDocumentSong(selectedSong()) && event.shiftKey) return;
    if (event.shiftKey && isMidiSong(selectedSong())) midiPlayer.seek(Math.max(0, Math.min(currentDuration(), currentPosition() + delta)));
    else if (event.shiftKey) audio.currentTime = Math.max(0, Math.min(audio.duration || 0, audio.currentTime + delta));
    else if (event.key === "ArrowLeft") playQueueStep(-1);
    else playQueueStep(1);
  }
});

async function initialize() {
  updateModeUi();
  saveDisplayOutputs();
  void refreshDisplays().catch(() => {});
  installWorkspaceResizing();
  renderPedalMap();
  try {
    state.songs = await dbGetAll();
  } catch {
    toast("O armazenamento local não está disponível neste navegador.");
  }
  const lyricMigrations = state.songs.filter((song) => typeof song.lyricsText === "string" && (
    song.lyricLines?.some((line) => !Number.isInteger(line.sourceIndex)) ||
    song.midiLyricLines?.some((line) => !Number.isInteger(line.sourceIndex))
  ));
  for (const song of lyricMigrations) {
    const parsed = parseLyrics(song.lyricsText);
    song.lyricLines = parsed.timeLines;
    song.midiLyricLines = parsed.barBeatLines;
    await dbPut(song).catch(() => {});
  }
  state.setlist = JSON.parse(localStorage.getItem("stageset-setlist") || "[]").filter((id) => state.songs.some((song) => song.id === id));
  const songIds = new Set(state.songs.map((song) => song.id));
    state.playedSongIds = new Set([...state.playedSongIds].filter((id) => songIds.has(id)));
    localStorage.setItem("stageset-played-song-ids", JSON.stringify([...state.playedSongIds]));
  state.quickies = state.quickies.map((id) => id && songIds.has(id) ? id : null);
  persistQuickies();
  const priorSong = localStorage.getItem("stageset-current-song");
  state.currentId = state.songs.find((song) => song.id === priorSong)?.id ?? state.setlist[0] ?? state.songs[0]?.id ?? null;
  renderLibrary();
  renderSetlist();
  if (state.currentId) await selectSong(state.currentId);
  else renderLyrics();
  void initializeDeviceAccessAtStartup();
}

window.addEventListener("beforeunload", () => {
  if (state.activeObjectUrl) URL.revokeObjectURL(state.activeObjectUrl);
  if (state.currentId) localStorage.setItem("stageset-current-song", state.currentId);
});


const transferSettingKeys=['stageset-display-outputs','stageset-main-background','stageset-button-shortcuts','stageset-queue-end-action','stageset-lyric-highlight','stageset-mosaic-timestamps','stageset-main-display','stageset-mosaic-display'];
backgroundEditor=setupBackgroundEditor({
  outputs:()=>[{id:'main',name:'Palco principal'},...state.displayOutputs],
  get:id=>id==='main'?mainBackground():normalizeBackground(state.displayOutputs.find(o=>o.id===id)?.background),
  set:(id,value)=>{
    if(id==='main'){localStorage.setItem('stageset-main-background',JSON.stringify(value));applyBackground($('#lyrics-stage'),value);}
    else {
      const output=state.displayOutputs.find(o=>o.id===id);if(!output)throw Error('Esta saída foi removida.');
      const previous=output.background;output.background=value;
      try{saveDisplayOutputs();}catch(error){output.background=previous;throw error;}
      refreshMosaic();
    }
  },report:toast,
});
applyBackground($('#lyrics-stage'),mainBackground());
syncController=setupSync({getInputs:allMidiInputs,getOutputs:allMidiOutputs,connectMidi:()=>requestMidiAccess({notify:true,sysex:true}),position:currentPosition,playing:isPlaying,seek:seekPlaybackTo,play:async()=>{if(!isPlaying())$('#play').click();},pause:pausePlayback,speed:()=>selectedSong()?.tempo||1,report:toast});
sessionController=setupSession({
  readState:()=>{const song=selectedSong();return {song:song?{id:song.id,title:String(song.title||'').slice(0,180),fileName:String(song.fileName||'').slice(0,180)}:null,playing:isPlaying(),position:currentPosition(),rate:song?.tempo||1};},
  pause:()=>{if(queueDelayTimer)clearTimeout(queueDelayTimer);queueDelayTimer=null;pausePlayback();},stopTimecode:()=>syncController.stop(),report:toast,
  applyState:async(value,valid)=>{
    if(!value.song){pausePlayback();return;}
    const byId=state.songs.find(song=>song.id===value.song.id);
    const matches=state.songs.filter(song=>song.title===value.song.title&&song.fileName===value.song.fileName);
    const song=byId||(matches.length===1?matches[0]:null);
    if(!song||isDocumentSong(song))throw Error('Música ausente ou ambígua: '+value.song.title);
    if(state.currentId!==song.id){pausePlayback();await selectSong(song.id);}
    if(!valid())return;
    if(song.tempo!==value.rate){song.tempo=value.rate;audio.playbackRate=value.rate;stemPlayers.forEach(p=>p.audio.playbackRate=value.rate);if(midiData)await midiPlayer.setRate(value.rate);$('#tempo-value').textContent=Math.round(value.rate*100)+'%';}
    if(!valid())return;
    if(Math.abs(currentPosition()-value.position)>.2||!value.playing)seekPlaybackTo(value.position);
    if(!value.playing)pausePlayback();
    else if(!isPlaying()){
      if(isMidiSong(song))await midiPlayer.play();
      else {await audio.play();if(hasMidiLayer(song)&&midiData)await midiPlayer.play();}
      if(!valid())pausePlayback();
    }
  }
});
$('#ip-midi-start').disabled=!window.stageSetDesktop?.startIpMidi;
if(!window.stageSetDesktop?.startIpMidi)$('#ip-midi-status').textContent='Disponível na aplicação desktop.';
$('#ip-midi-start').onclick=async()=>{
  if(!requireStudio())return;
  $('#ip-midi-start').disabled=true;
  try{
    await networkMidi.start({group:$('#ip-midi-group').value.trim(),basePort:Number($('#ip-midi-port').value),interfaceAddress:$('#ip-midi-interface').value.trim()});
    $('#ip-midi-stop').disabled=false;
    $('#ip-midi-list').replaceChildren(...[...networkMidi.outputs.values()].map(p=>{const li=document.createElement('li');li.textContent=p.name+' · UDP '+p.port;return li;}));
  }catch(error){$('#ip-midi-start').disabled=false;toast(error.message);$('#ip-midi-status').textContent=error.message;}
};
$('#ip-midi-stop').onclick=async()=>{await networkMidi.stop();$('#ip-midi-start').disabled=false;$('#ip-midi-stop').disabled=true;$('#ip-midi-list').replaceChildren();$('#ip-midi-status').textContent='Desligado';};
initialize();


$('#learn-key').onclick=()=>{buttonLearnKind='key';$('#learn-modal').hidden=true;toast('Prime o atalho de teclado. Escape cancela.');};
$('#learn-midi').onclick=async()=>{buttonLearnKind='midi';$('#learn-modal').hidden=true;if(!allMidiInputs().length)await requestMidiAccess({notify:true});toast('Envia Note, CC ou Program Change na entrada selecionada em Pedais. Escape cancela.');};
$('#learn-clear').onclick=()=>{delete buttonShortcuts[buttonLearnTarget];localStorage.setItem('stageset-button-shortcuts',JSON.stringify(buttonShortcuts));buttonLearnTarget=null;$('#learn-modal').hidden=true;toast('Atalhos removidos.');};
$('#learn-cancel').onclick=()=>{buttonLearnTarget=null;$('#learn-modal').hidden=true;};
