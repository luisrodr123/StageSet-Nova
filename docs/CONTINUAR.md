# Continuar o StageSet noutro PC

## Obter e executar

Instalar Git e Node.js 24 (mínimo suportado: 22.12). No terminal:

```powershell
git clone https://github.com/luisrodr123/StageSet-Nova.git
cd StageSet-Nova
git remote add backup https://github.com/luisrodr123/StageSet-0.8.git
npm ci
npm run desktop
```

O repositório privado exige autenticação na conta com acesso. O mesmo código também pode ser clonado a partir dele. `npm start` abre um servidor de desenvolvimento em http://127.0.0.1:4177. Abrir o HTML com `file://` não oferece todas as APIs de dispositivos e módulos necessárias.

## Guardar trabalho nos dois repositórios

```powershell
git pull --ff-only origin main
# editar, atualizar STAGESET-ALTERACOES.md e testar
git add .
git commit -m "Descrever a alteração"
git push origin main
git push backup main
```

Não usar `push --force` para sincronizar o backup. Se existirem alterações remotas, conciliá-las primeiro. Os dois remotes são independentes: um push ao principal não replica automaticamente o backup. O comando acima explicita ambos.

## Verificar e gerar Windows x64

```powershell
npm run check
npm test
npm run test:smoke
npm run dist:win:all
node scripts/checksums.mjs
```

O teste de interface cria um perfil temporário e uma janela Electron oculta; não usa dados reais. O teste UDP abre dez sockets locais temporários; um sandbox que bloqueie UDP pode impedir esse teste mesmo que a implementação esteja correta. O runtime Electron tem de ser o oficial instalado pelo postinstall deste projeto em `npm ci`, não um StageSet.exe renomeado. A distribuição Electron 44 separa o instalador do pacote npm; se os scripts estiverem desativados ou se usares o tag inicial v0.9.0, executar também `node node_modules/electron/install.js`. A compilação inicial precisa de Internet para os binários oficiais do Electron/NSIS.

Os dois EXE e SHA256SUMS.txt ficam em dist/. O instalador permite escolher a pasta e instala por utilizador. O portátil executa sem instalação. Ambos usam armazenamento do perfil do utilizador: copiar apenas o EXE não transfere a biblioteca. Os binários não têm assinatura digital de um editor.

Em GitHub → Actions → Windows, cada push em main permite descarregar o artefacto Windows após o workflow terminar. Também existe execução manual. As Releases versionadas, quando publicadas, oferecem links diretos para os EXE.

Os comandos de compilação usam `--publish never`: geram ficheiros sem tentar publicar nem exigir um token GitHub. O workflow carrega esses ficheiros como artefactos. Para publicar uma versão aprovada nos dois repositórios, criar/pushar o tag, verificar os EXE e executar `node scripts/release.mjs` com a conta Git autenticada; o script não substitui ficheiros de uma Release que tenham conteúdo diferente.

Para avançar a versão menor, `npm run bump` atualiza package.json, lockfile, interface, cache e acrescenta uma secção por preencher no ficheiro de alterações.

## Transferir biblioteca e espetáculo

No PC/origem original, entrar no Studio e guardar o show completo pelo menu da aplicação. Copiar esse ficheiro para o outro PC e abrir o show na aplicação nova. Isto inclui os ficheiros áudio/documentos/stems/MIDI/CDG e metadados; uma setlist isolada não transporta todos os ficheiros. O restauro pede confirmação porque substitui a biblioteca de destino.

`file://`, localhost:4177 e desktop localhost:4178 guardam dados separadamente. Não apagar perfis para resolver problemas de atualização. Rever as interfaces MIDI/áudio e ecrãs depois de mudar de PC, pois os identificadores do hardware podem mudar.

## Mapa do código

| Ficheiro | Responsabilidade |
| --- | --- |
| app.js / index.html / styles.css | Biblioteca, setlist, editores, configuração, áudio e controlos |
| midi.js | Leitura/exportação SMF/KAR e reprodução MIDI |
| backup.js | Contentor de backup de show e validação |
| timecode.js / ltc-worklet.js / sync.js | SMPTE, codec LTC, MTC e controlos de sincronização |
| desktop/ip-midi.cjs / network-midi.js | Dez portas UDP multicast e adaptação à interface MIDI |
| desktop/main.cjs / preload.cjs | Electron, IPC, ecrãs, MIDI por rede, StemDeck |
| mosaic.html / mosaic.js | Mosaico e controlos por saída |
| server.mjs / sw.js | Servidor localhost e cache offline |
| tests/ | Protocolos, backup e integração Electron com perfil isolado |

## Protocolos e limites a validar

IP MIDI usa multicast UDP 225.0.0.37 e portas 21928–21937 por defeito, sem abrir um servidor na Internet. Suporta 16 canais por porta, running status, mensagens em pacotes e SysEx até 4096 bytes. O menu permite escolher a interface IPv4. Não fornece um driver de portas virtuais Windows e não implementa sessões RTP-MIDI/AppleMIDI. Para outra DAW Windows usar um driver compatível com IP MIDI ou as portas físicas/virtuais já expostas por Web MIDI.

MTC gera quarter frames e full frames, incluindo 29,97 DF. LTC em áudio gera e lê frames com codificação biphase-mark. A escolha de fps é manual na leitura LTC não drop-frame porque o sinal não identifica inequivocamente 24/25/30. O modo de seguimento está desligado por defeito; segue a música selecionada e pára quando perde o sinal. O processamento e o áudio têm latência dependente do hardware. Não há garantia de sincronismo com precisão de amostra, genlock de vídeo, leitura LTC em marcha inversa nem ensaio de palco certificado.

Falta validação física: 2 PCs multicast, todas as interfaces reais, full-frame SysEx, cabos LTC áudio com ruído, compensação de latência, vários monitores, instalação/desinstalação Windows e teste de portátil numa conta limpa. Os testes automatizados não substituem esses ensaios.

Referências de protocolo consultadas (implementação própria): [MIDI Association — Time Code](https://midi.org/midi-time-code), [libltc — documentação do formato LTC](https://github.com/x42/libltc/blob/master/src/ltc.h), [ipMIDI FAQ — multicast](https://www.nerds.de/en/ipmidi_faq.html), [Arduino-ipMIDI — portas UDP](https://github.com/lathoub/Arduino-ipMIDI).
