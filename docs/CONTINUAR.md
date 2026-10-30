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
| mosaic.html / mosaic.js / lyric-window.html / lyric-window.js | Mosaico, janelas e controlos por saída |
| server.mjs / sw.js | Servidor localhost e cache offline |
| tests/ | Protocolos, backup e integração Electron com perfil isolado |

## Protocolos e limites a validar

IP MIDI usa multicast UDP 225.0.0.37 e portas 21928–21937 por defeito, sem abrir um servidor na Internet. Suporta 16 canais por porta, running status, mensagens em pacotes e SysEx até 4096 bytes. O menu permite escolher a interface IPv4. Não fornece um driver de portas virtuais Windows e não implementa sessões RTP-MIDI/AppleMIDI. Para outra DAW Windows usar um driver compatível com IP MIDI ou as portas físicas/virtuais já expostas por Web MIDI.

MTC gera quarter frames e full frames, incluindo 29,97 DF. LTC em áudio gera e lê frames com codificação biphase-mark. A escolha de fps é manual na leitura LTC não drop-frame porque o sinal não identifica inequivocamente 24/25/30. O modo de seguimento está desligado por defeito; segue a música selecionada e pára quando perde o sinal. O processamento e o áudio têm latência dependente do hardware. Não há garantia de sincronismo com precisão de amostra, genlock de vídeo, leitura LTC em marcha inversa nem ensaio de palco certificado.

Falta validação física: 2 PCs multicast, todas as interfaces reais, full-frame SysEx, cabos LTC áudio com ruído, compensação de latência, vários monitores, teste de portátil numa conta limpa. O workflow executa instalação, arranque e desinstalação num Windows descartável; ver o resultado da execução da versão. Os testes automatizados não substituem esses ensaios.

Referências de protocolo consultadas (implementação própria): [MIDI Association — Time Code](https://midi.org/midi-time-code), [libltc — documentação do formato LTC](https://github.com/x42/libltc/blob/master/src/ltc.h), [ipMIDI FAQ — multicast](https://www.nerds.de/en/ipmidi_faq.html), [Arduino-ipMIDI — portas UDP](https://github.com/lathoub/Arduino-ipMIDI).

## Fundos por monitor de letras

Em Configurações → Fundo das letras, escolher Palco principal, Vocalista, Banda, Público ou outra saída criada. Escolher cor sólida ou imagem e o modo Preencher / Imagem inteira / Repetir padrão. A barra Escurecer ajuda a manter o texto legível. O botão Fundo de cada saída abre diretamente a configuração dessa janela. O fundo é global para essa saída, independentemente da música; o tamanho das letras continua guardado por música/saída.

Importar JPG, PNG, WebP, GIF (um fotograma), BMP ou SVG. A aplicação guarda uma cópia raster otimizada, sem ligação ao caminho original; o backup de show inclui essa imagem. Cada saída pode ter uma imagem diferente. Imagens até 16 MB, raster máximo de 64 megapíxeis, otimizado até 180 000 caracteres por saída para caber nas preferências locais. Um erro de armazenamento não confirma a gravação.

EPS: apenas na aplicação desktop e com Ghostscript para Windows instalado em Program Files/gs. Não é incluído no instalador/portátil. A conversão usa uma pasta temporária própria, processo sem janela/shell, limite de 15 segundos e raster de 1600×1200. Usar uma versão atual do Ghostscript. [Opções oficiais de conversão EPS](https://ghostscript.readthedocs.io/en/master/Use.html#eps-parameters). Depois de importar, o fundo guardado e o backup funcionam em PCs sem Ghostscript.

Código: backgrounds.js (normalização, importação, interface), desktop/background-image.cjs (EPS), app.js (persistência/backup/envio), lyric-window.js e mosaic.js (apresentação). CD+G/PDF possuem conteúdo visual próprio e podem cobrir o wallpaper.

## Computadores Master / Slave

1. Instalar StageSet 0.11 ou posterior nos computadores da mesma rede local. Levar as músicas pelo backup completo do show para conservar os IDs. Sem backup comum, o título e nome de ficheiro têm de ser iguais e únicos.
2. Nos PCs a controlar: Configurações → Computadores StageSet → modo Slave, nome e código de sessão com pelo menos seis caracteres → Ativar. O código é necessário novamente após fechar a aplicação.
3. No PC de comando: escolher Master com o mesmo código/grupo/porta → Ativar. Selecionar na lista os Slaves que devem seguir a reprodução. Desmarcar liberta e pausa esse Slave; Desligar termina a sessão.
4. Os Slaves seguem a faixa, reproduzir/pausar, posição e velocidade. Mantêm as suas saídas áudio/MIDI, letras e fundos locais. Sem a faixa correspondente, pausam e mostram a causa na lista do Master.

A descoberta é um protocolo StageSet sobre UDP multicast (225.0.0.37:21938), separado das dez portas IP MIDI (21928–21937). Não confundir com enumeração de hardware MIDI, RTP-MIDI ou AppleMIDI. Uma ligação MIDI normal continua a poder transportar MTC, mas não descobre automaticamente nomes de computadores. Evitar usar uma porta de controlo já atribuída a IP MIDI. Em redes com várias placas, indicar o IPv4 da placa na opção Interface em cada PC. A firewall deve permitir o StageSet na rede privada e o router/Wi-Fi deve permitir multicast entre clientes; TTL 1, não atravessa sub-redes por defeito.

Até 32 computadores visíveis e 16 Slaves selecionados. Ativação por sessão; não aceita controlo quando desligado ou em Master. HMAC-SHA256 autentica o código partilhado, mas não cifra mensagens; usar numa LAN de confiança e código não trivial. Não há transferência de músicas. Estado a 10 Hz, correção de desvio acima de 200 ms; não serve de genlock nem alinhamento áudio à amostra. Perda de controlo por 2,5 segundos pausa; se o renderer Master deixa de publicar por 1 segundo, liberta Slaves. Desligar a sessão permite voltar a ativar SMPTE/MTC.

Código: desktop/session-link.cjs (máquina de estados e sockets), session-ui.js (configuração/lista), app.js (transporte) e IPC em desktop/main.cjs/preload.cjs. Testes de multicast real entre duas instâncias no mesmo PC; tests/session-ui.cjs usa ponte simulada num perfil temporário para testar o transporte real da aplicação. Falta ensaio físico em dois PCs, interfaces e rede do espetáculo.
