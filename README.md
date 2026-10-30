# StageSet

**Versão 0.11.0 — Windows x64.** [Alterações e verificação](STAGESET-ALTERACOES.md) · [Continuar noutro PC](docs/CONTINUAR.md).

Principal: [StageSet-Nova](https://github.com/luisrodr123/StageSet-Nova). Cópia privada: [StageSet-0.8](https://github.com/luisrodr123/StageSet-0.8). Ambos recebem o mesmo código; o nome do backup mantém a versão de origem.

Para desenvolver: Node.js 24, `npm ci`, `npm run desktop`. Para distribuir: `npm run check`, `npm test`, `npm run test:smoke`, `npm run dist:win:all`. O workflow **Windows** do GitHub gera o instalador e o portátil nos artefactos de cada execução bem-sucedida.

As bibliotecas e músicas não estão no GitHub: transferi-las pelo backup de show da aplicação. Os EXE ficam em `dist/` localmente ou nas Releases quando publicados. A versão portátil não exige instalação; a biblioteca continua guardada no perfil do utilizador.

Novo na 0.11: fundos independentes por saída (cor ou imagem), EPS via Ghostscript, descoberta e seleção de computadores Master/Slave no desktop. [Configuração e limites](docs/CONTINUAR.md#computadores-master--slave).

Da versão 0.10: gravação de todas as saídas editadas, janelas com controlos próprios, remoção sem trocar letras, importação MIDI/KAR com tempos e BPM e preferências persistentes no mosaico. [Estado das anotações](docs/ANOTACOES.md).

Da versão 0.9: dez portas IP MIDI de 16 canais no desktop, emissão/leitura MTC e SMPTE/LTC, controlos por saída no mosaico, Learn MIDI e teclado por botão e correções de BPM/backup. Os testes de protocolo e da interface são automáticos; falta ensaio com interfaces físicas, vários monitores e dois PCs. Ver o guia para os limites dos protocolos.

StageSet is a clean-room prototype for a musician's setlist and lyrics player, inspired by the publicly documented feature categories of ShowPlay 6. It does not include ShowPlay's source code, assets, branding, or license logic. The app version is shown in the top bar; each feature increment advances the minor version by 0.1. The desktop package version uses the matching patch-zero form.

## Run

Requires Node.js 22.12 or later. From this directory:

```bash
npm start
```

Open `http://127.0.0.1:4177` in a browser.

The app requests MIDI, microphone, and camera access during startup, then closes temporary microphone/camera streams after enumerating the available interfaces. If the browser asks, allow access. Do not open `index.html` directly as a `file://` URL; use the localhost address above so device APIs are available.

## Windows desktop app

The desktop shell opens the same app in its own window at http://127.0.0.1:4178, separate from the browser server on port 4177. Its stable desktop origin keeps IndexedDB available across launches and avoids colliding with npm start. The window can be resized down to 380 × 520 px; the layout reflows for narrow tablet screens, putting playback and lyrics above the library and setlist. With Node.js 22.12 or later, run npm install once, then npm run desktop. npm ci downloads the official Electron runtime. On Windows, run npm run dist:win:all to build both the per-user NSIS installer (`StageSet-0.11.0-Setup-x64.exe`) and the no-install portable executable (`StageSet-0.11.0-Portable-x64.exe`). You can also build either one with npm run dist:win or npm run dist:win:portable; npm run dist:win:zip remains available for the unpacked portable ZIP. Packaging requires the Electron runtime and Windows build tools in the local cache; the first build may need GitHub access to download them. The installer is unsigned for local testing. Leave enough free space for the unpacked Electron runtime and installer output; a few hundred megabytes is not sufficient.

On Windows, open that address in Edge or Chrome and use the browser's install-as-app command when available to get a standalone StageSet window. The app shell is cached for offline launches after the first visit; library media and metadata remain in that browser profile's IndexedDB. `server.mjs` only listens on `127.0.0.1`.

## Current prototype

### Complementary projects

- [REA](https://github.com/morluto/rea) remains a separate companion/reference repository for this project.
- [StemDeck](https://github.com/stemdeckapp/stemdeck) can extract instrument stems locally. The StageSet desktop app can launch the installed StemDeck executable from the timeline editor, connect to its local service, and import the resulting WAV stems directly. StemDeck and its separation models still need to be installed on the computer.

### Studio and live operation

- The app always opens in protected Live mode. A locally stored password unlocks Studio for programming the show.
- Save or load a complete show, including the library media, setlist, playback settings, and song metadata. Setlists can also be moved between libraries as standalone files.
- Library tracks already placed in the setlist are crossed out. Tracks played during the current show are also crossed out until the Studio user clears the played markers.
- Each setlist song can store a MIDI selection mapping with its own channel and CC/value or Program Change number.
- The MIDI mixer exposes all 16 channels and lets each channel use the internal synth, inherit the general MIDI output, or route to a separate available MIDI port. Channel routes are saved with the song.
- In the lyric editor, choose line or word timing and insert the current playback timestamp to program lyric scrolling.
- Import TXT/LRC lyric files from inside the lyric editor. Learn a lyric timestamp shortcut from a keyboard key or an incoming MIDI note, then stamp the active lyric while programming.
- Export synchronized lyrics as a MIDI karaoke `.kar` file. When the song has an associated MIDI, the export preserves its musical events and tempo map while replacing the lyric events; audio-only songs export a timed lyric track without the MP3/WAV audio.
- Add optional Stage Traxx-style MIDI command tags on their own lyric lines: load, play, stop, and timestamp triggers, with Program Change, Control Change, note, Song Select, and MIDI transport commands routed to the selected external MIDI output or the song's channel route.
- Open the visual timeline editor to inspect an audio waveform, MIDI piano-roll notes, controller events, and lyric timestamps together. Add or adjust MIDI CC points at the current playback position, and edit or save synchronized lyrics from the timeline.
- From the timeline editor, send the selected MP3/WAV/FLAC/OGG/Opus/M4A/MP4 to a running local StemDeck service, choose which of its six stems to extract, follow job progress, cancel the job, and import the resulting WAV lanes straight into the song mixer. StemDeck must be running locally on port 8765; launch StageSet through `npm start` or its desktop app for the local bridge to work.

- Import local audio and keep the audio and song metadata in the browser's IndexedDB.
- Read multichannel WAV and unencrypted Harmonix MOGG v10 audio; route each mono channel or imported stem to a selectable stereo output pair, and adjust volume, pan, mute, and solo independently. Choose an audio interface from the browser's output picker. MOGG is played by stripping its small wrapper and sending its Ogg/Vorbis stream to the browser decoder; encrypted MOGG versions are rejected.
- Import a selected folder in Chromium or Edge; match adjacent MP3/WAV and CDG files by relative path and filename.
- Import PDF, RTF, and TXT documents into the same library and setlist; use the browser PDF viewer for scores and render extracted plain text for RTF/TXT.
- Search the library; rename titles/artists, copy or delete library items, and build, reorder, and edit a setlist.
- Mark favorites, add comma-separated keywords, filter by favorites or play history, and sort the library by title, artist, recent import, or play count. Playback history and song metadata are stored locally and travel with backups.
- Select a setlist song from an incoming MIDI Control Change or Program Change: choose the input channel and message type in the MIDI pedal settings, then assign a unique CC value or program number from 0–127 to each setlist song. A match selects that song without starting playback. The controller configuration is included in backups.
- Mark a setlist song to play next; it is moved directly after the currently selected song and starts when that song ends.
- Play, pause, seek, adjust volume, skip 10 seconds, and move through the setlist.
- Assign up to nine Quickies with Ctrl+1–9 and play them with 1–9; assignments persist locally and are included in backups.
- Import plain text or timestamped `.lrc` lyrics, with optional time-based scrolling.
- Advance unsynchronized lyrics one line at a time with the keyboard or a mapped foot pedal; time-synchronized lyrics continue to follow playback.
- Edit and save a song's lyrics in the app; saving reparses time and bar/beat markers for synchronized display.
- Read MIDI/KAR Standard MIDI files, play their notes through an in-browser Web Audio synth, synthesize approximate GM percussion on channel 10, and use embedded MIDI/KAR lyric events when present.
- Optionally route MIDI/KAR notes to a MIDI output selected by the user, including a software synthesizer exposed by the browser; the internal Web Audio synth remains the default.
- Mix active MIDI channels independently with per-channel volume, mute, and stereo pan; settings are saved per song.
- Solo one or more MIDI channels in the mixer without losing their mute or volume settings; solo states are saved per song.
- Choose among all 128 GM program names as a per-channel MIDI override; changing the program while playing reschedules notes that have not started, and the choice is saved per song.
- Attach a MIDI/KAR layer to an MP3/WAV song and control the two sources together with synchronized transport and a shared output-volume control.
- Add up to 31 independent audio stems to a selected song, keep them synchronized with playback, and mix each stem with volume, pan, mute, and solo controls.
- Import a ZIP containing audio stems, including the all-stems ZIP exported by [StemDeck](https://github.com/stemdeckapp/stemdeck): select a song in Studio, choose **Pistas**, and select the ZIP. Each WAV/audio file is added as its own mixer channel. StemDeck performs the source separation; StageSet imports and plays the exported files locally.
- Set an optional pause between queued songs, choose Next or Stop, and hide previously played setlist songs while retaining the current song.
- Edit the current lyric phrase with Ctrl+E, or select text and use Ctrl+Shift+E to replace it in the current lyric line.
- Sync `[bar:beat]` lyric markers against MIDI timing and time-signature events; preserve those markers as references when the selected song is not MIDI.
- Show the current MIDI measure and beat while the song plays.
- Adjust playback tempo for audio with browser pitch preservation and for MIDI/KAR; transpose audio through a local AudioWorklet, transpose MIDI notes, and transpose chord-only lyric lines and bracketed chord annotations.
- Connect a MIDI foot controller, learn note/CC triggers, and assign playback, pause, stop-and-rewind, FFW/REW by 10 seconds, queue, manual lyric-scroll, or volume actions; one pedal can start playback on its first press and advance plain lyrics on later presses.
- Mark loop A/B points during audio or MIDI playback, persist them per song, and operate the loop from the transport, keyboard, or a mapped MIDI pedal.
- Import zipped MP3/WAV + CD+G karaoke pairs by matching filenames, or attach a raw `.cdg` file to an audio song; render CD+G palette, tile, scroll, and transparency updates in time with playback and switch between CD+G and imported lyrics.
- Use keyboard shortcuts and a distraction-reduced full-screen lyrics view.
- Export printable HTML reports for the current setlist or the full library, with item counts and known track durations.
- Export and restore a single local backup containing the library's audio, imported audio stems, documents, attached MIDI/CD+G layers, lyrics, loops, setlist, Quickies, and selected playback preferences.
- Use F7/F8 to move by MIDI measure, F9/F10 for transposition, and F11/F12 for tempo, matching ShowPlay's documented shortcut layout.

Audio decoding and multichannel routing depend on the browser's decoder, Web Audio support, and the selected device's exposed output channel count. The browser output picker chooses one audio device for the audio context; channel pairs on that device can then be assigned per mono channel or stem. MOGG v10 is the only accepted MOGG variant; encrypted MOGG variants are not decoded. MOGG channels are presented as separate mono channels, without Harmonix game metadata for instrument names, original pan, or gain. MP3/WAV playback uses the browser's native audio engine, with an in-browser time-domain pitch shifter when transposition is active. Large pitch changes may add audible modulation or coloration. MIDI/KAR playback uses a small clean-room oscillator/noise synth, not the original's General MIDI sound bank. All 128 GM program names can be selected, but internal synthesis uses 16 approximate families with limited variations between programs; these profiles are not sample-accurate GM instruments. Percussion voices in the internal synth are approximations and do not use sampled GM kits. An optional external MIDI output can provide device-native timbres, but device enumeration, software-synth exposure, and sound quality depend on browser support and installed devices. MIDI channel volume, pan, mute, solo, and selected program are per-song mix controls; CC 7, 10, and 11 automate channel volume, pan, and expression, and other control changes are forwarded to external MIDI outputs. PDF display uses the browser's built-in PDF viewer; RTF is converted to plain text, so its typography and page layout are not retained. Pedal input and external MIDI output use the browser Web MIDI API, which is not available in every browser; analog jacks and USB HID pedals are not covered. ZIP import handles single-volume, non-encrypted archives using Store or Deflate; karaoke archives match MP3/WAV with CDG by path and base filename, while stem archives import MP3/WAV/M4A/OGG/FLAC/MOGG audio files as separate mixer channels. ZIP64, encrypted ZIP files, other compression methods, and sector-image formats are not supported. ShowPlay-specific song formats are not implemented yet.

StageSet backups use a versioned, uncompressed binary container capped at 4 GB. Restore replaces the entire current library after a confirmation prompt.

The browser install path is provided through `manifest.webmanifest`, `icon.svg`, and `sw.js`; the install flow and offline launch have not been verified on this machine.

