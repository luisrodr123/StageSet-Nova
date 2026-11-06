# StageSet — alterações anotadas

## Versão 0.22.1 — em desenvolvimento

- Host Windows e Android: procura de computadores StageSet na rede local, com ligação por seleção e endereço manual como alternativa. A descoberta depende da rede e da firewall; o acesso continua a exigir autorização do StageSet. O Host web em iPad mantém ligação por endereço.
- Número de versão visível no Host Windows, Android e na interface web.
- A e B passam a alternar entre marcar e remover cada ponto; o terceiro botão ativa/desativa o loop.
- Mixer de áudio com faders independentes de Click e SMPTE/LTC, que podem ser ocultados; o nível LTC controla apenas a emissão de áudio, não o MTC MIDI.
- Arranque de pistas: ignora respostas de uma tentativa ultrapassada, volta a alinhar quando todas iniciam e interrompe o conjunto se uma das pistas falhar. A reprodução ainda usa leitores independentes e não oferece sincronismo à amostra garantido de 32 pistas; é necessária uma arquitetura com relógio de áudio partilhado e ensaios em equipamento real antes de utilização ao vivo.
- Verificações: 33 testes automatizados e teste geral Electron passaram; teste isolado com 32 WAV silenciosas e três pausas/retomas observou desvios entre 0 e 16 ms. O APK Android compilou, sem teste físico. Descoberta validada em loopback; testar também em rede real.


## Versão 0.22.0 — preparação para teste

- Inclui as alterações da série 0.21.1–0.21.8 e a opção de mostrar/ocultar eventos MIDI e DMX em cada ecrã de letras. A opção é guardada localmente por ecrã.
- Os dispositivos de áudio e MIDI, o Host em tablet físico e a interface USB DMX ainda necessitam de validação com equipamento real.
- Verificações automatizadas de sintaxe, eventos MIDI, backup, pasta de show, interface, rede e Host com toque simulado passaram. Os executáveis e a app Android destinam-se a testes antes da utilização ao vivo.
- Verificações finais: 32 testes automatizados e o teste geral Electron passaram; o Host portátil 0.22.0 abriu e recebeu letras com perfil de teste isolado. O APK Android foi compilado em modo de teste; não foi instalado num dispositivo físico.

## Versão 0.21.8 — em desenvolvimento

- Escape fecha as janelas independentes e o mosaico; primeiro sai do ecrã inteiro, termina o desenho ou pede confirmação ao fechar um editor alterado.
- Indicadores MIDI incluem eventos das letras, editor multipista e mensagens MTC, além do leitor e da entrada de pedal.


## Versão 0.21.7 — em desenvolvimento

- Pasta do show: exportação das imagens de fundo e letras identificadas por janela; pastas de temas distinguem nomes repetidos sem depender de maiúsculas e evitam nomes reservados no Windows.
- Escape fecha os controlos e o editor de letras das janelas; pede confirmação antes de descartar um rascunho alterado. Escape fecha também o diálogo de inserção de eventos.
- Falta confirmar a experiência com dispositivos físicos e rever Escape nas restantes janelas antes de gerar a versão 0.22.


## Versão 0.21.6 — em desenvolvimento

- Click BPM independente com andamento introduzido manualmente, e indicadores de atividade MIDI para mensagens recebidas na entrada ativa e enviadas pelo leitor.
- Medidores de nível de áudio no mixer ligados aos sinais reais dos canais, pistas e master; pistas voltam a ser encaminhadas quando o grafo do mixer é reconstruído.
- Seleção de pistas importadas por botão e por intervalo com Shift; remoção múltipla pede confirmação e preserva ficheiros originais.
- Verificações de sintaxe/versão, MIDI/backup e teste geral em Electron passaram, incluindo Host com toque simulado. O click, os níveis e as portas MIDI ainda precisam de confirmação com equipamento real.
- Pendentes: auditar importação integral para pasta de show, rever Escape em todas as janelas, validar indicadores e níveis com dispositivos físicos e preparar versões finais 0.22.


## Versão 0.21.5 — em desenvolvimento

- Mosaico de letras com Visão geral adaptada à janela e zoom manual dos painéis.
- Teste tátil do Host ajustado para desenhar fora da barra lateral; passou com eventos táteis simulados no Chromium, incluindo gravação, redimensionamento por dois dedos e reconexão. Ainda requer validação em dispositivo físico.
- Verificações de sintaxe/versão, MIDI/backup e integração geral passaram.
- Ainda pendentes para a versão 0.22: importação completa para pasta de show, clique BPM, medidores reais de áudio, indicadores MIDI, seleção/remoção múltipla de pistas e revisão de Escape em todas as janelas.


## Versão 0.21.4 — em desenvolvimento

- Corrigida a gravação das definições de eventos MIDI inseridos no editor e o posicionamento do evento no cursor; o marcador técnico fica oculto na apresentação das letras.
- Mixer de áudio: Solo e Mute alinhados antes do fader para canais e pistas, com fundo amarelo em Solo e vermelho em Mute; nomes mais legíveis ao lado do número. Indicador master decorativo removido até existirem medidores reais.
- A setlist recolhe controlos secundários quando estreita para preservar o título.
- Pendentes das novas anotações: importação completa para pasta de show, overview/zoom do mosaico, clique BPM, medidores reais de áudio, indicadores MIDI, seleção/remoção múltipla de pistas e fecho das janelas com Escape.
- Verificação: sintaxe, versão, testes MIDI/backup e inserção de MIDI/DMX/imagem/vídeo passaram. O teste geral terminou com falha na persistência de desenho tátil no Host, que continua por investigar.


## Versão 0.21.3 — em desenvolvimento

- Ambos os mixers têm Visão geral, que ajusta todos os canais e o master à janela, e zoom manual para definir a largura das tiras na vista normal. A escolha de cada mixer fica guardada neste dispositivo.
- Validação: verificação de sintaxe/versão, testes MIDI/backup e testes de ajuste horizontal dos mixers passaram. O teste geral prosseguiu até falhar na validação de eventos MIDI inseridos no editor de letras; este ponto anterior continua por resolver.


## Versão 0.21.2 — em desenvolvimento

- Incremento de versão após as alterações ao master MIDI, aos botões Setlist/Biblioteca e ao modo Desenhar. O número completo aparece na aplicação e o comando de versão passa a incrementar a versão de correção.

## Versão 0.21.1 — em desenvolvimento

- Mixer de áudio alinhado ao mixer MIDI: strips horizontais estreitos, faders de volume verticais, pan horizontal, canais dimensionados para caber na janela sem deslocamento lateral e fader MASTER ligado ao ganho geral e guardado por música.
- Mixer MIDI com fader MASTER guardado por música, aplicado ao sintetizador interno e às saídas MIDI através do volume de canal (CC7).
- Setlist e Biblioteca nos ecrãs de letras abrem e fecham no mesmo botão. No modo Desenhar, a música continua e a posição da letra fica suspensa até fechar o painel de desenho.
- Verificação: sintaxe, versão e testes de MIDI/backup passaram; falta confirmar a utilização com interfaces MIDI físicas.
- Atualização das novas anotações: mixer MIDI aproximado a uma consola DAW, com strips estreitos lado a lado, secção de canal no topo, controlo horizontal de pan, fader vertical longo, Mute/Solo no rodapé e deslocamento horizontal quando necessário; eventos MIDI inseridos em sintaxe legível `[midi: ...]`; diálogo de eventos reduzido; destaque de foco visível e separação maior entre versos no editor.
- Fecho da auditoria das anotações: ecrãs, Hosts, setlists, Show, mixer, mosaico, editor multipista, eventos e gravação por janela estão ligados e testados.
- Inclui compatibilidade com Show/Setlist de versões anteriores e pastas `media` identificadas pelo nome do tema.


## Versão 0.20.0 — em desenvolvimento

- Auditoria das anotações: o botão Hosts passa a abrir diretamente e a deslocar a janela para a lista de recetores ligados/visíveis.
- As pastas `media` dos shows passam a usar o título seguro de cada tema; títulos repetidos recebem apenas um sufixo numérico para evitar colisões.
- O editor multipista passa a permitir selecionar uma região arrastando no gráfico; Trim guarda a região e Cut remove os eventos MIDI/letras dessa região de forma não destrutiva.
- Importação aceita backups JSON legados (com áudio data URL) e setlists antigas sem o cabeçalho atual; os campos ausentes são preenchidos com valores seguros e as músicas são reconciliadas por ID, nome e ficheiro.
- Corrigido o carregamento de Setlist/Show no modo Live: os botões já não aparecem ativos enquanto a função recusava a operação por exigir Studio.
- O mosaico ajusta automaticamente o tamanho da letra ao tamanho de cada janela; um valor introduzido manualmente mantém prioridade nessa janela.
- Abrir uma pasta de show deixou de exigir a entrada no Studio; o carregamento de um show completo está disponível no menu Live, mantendo criação/gravação protegidas.


## Versão 0.19.0 — em desenvolvimento

- Restaurado o ícone StageSet nos instaladores Windows e no Host portátil.
- Duplo clique no título de uma música da setlist do Master seleciona e inicia imediatamente a música.
- No modo Live, o menu permite agora Abrir setlist e Abrir show; as opções de gravação continuam protegidas pelo Studio.
- As subpastas `media` dos shows usam agora o nome seguro do tema (com sufixo numérico apenas quando existem títulos repetidos), em vez do identificador interno.


## Versão 0.18.0 — em desenvolvimento

- Ecrã inteiro passou a oferecer Setlist e Biblioteca laterais, com títulos sempre legíveis e layout elástico.
- Barra de ferramentas dos ecrãs ganhou ativação por janela, guardar snapshot identificado por saída, PDF, desenho com pausa e retoma automática após 5 segundos.
- Inserção de eventos MIDI/Imagem/DMX/Vídeo ficou disponível diretamente junto de “Importar BPM MIDI/KAR”.
- Saídas de letras passaram a ter botão individual Ativar/Desativar; menu Hosts abre a área de clientes visíveis/autorizados.
- Mixer usa disposição horizontal de mesa e botões Mute/Unmute; editor multipista ganhou rewind, avanço rápido, seleção, Trim e Cut não destrutivos.
- Menu de show foi reorganizado e inclui Criar pasta de show; todos os campos de faixa permitem edição manual por duplo clique.
- Guardar janela cria `.stageset-window.json` com nome da janela, letra, música e anotações.

Validação local: `npm run check` passou. A suite `npm test` mantém falhas de rede/loopback e renomeação EPERM específicas do ambiente sandbox; não são introduzidas por esta alteração e devem ser repetidas no Windows normal antes da publicação.


## 2026-11-03 — versão 0.17.0

- Hosts Android, iPad/web e Windows: edição de letras ligada à biblioteca do StageSet, por música e saída; Studio e proteção de conflitos preservados. O rascunho não substitui alterações concorrentes nem outra música/saída.
- Desenho por toque/caneta com traços presos às linhas, borracha, anular e gravação no show. Dois dedos ajustam a letra sem deixar um traço acidental.
- Tamanho por A−/A+, cursor e pinça. Preferência local por música/saída e botão para repor o tamanho definido no StageSet.
- Wi-Fi: removida a consulta fixa a cada 500 ms. O servidor responde aos pedidos pendentes logo que há alterações, envia deltas e evita repetir imagens/letras a cada atualização de posição. Relógio local com compensação de ida/volta e ajuste manual de −1000 a +1000 ms para letras temporizadas; não altera o áudio.
- Palavra-passe Host configurável no StageSet, guardada como hash scrypt. Opção Recordar dispositivo, autorização revogável sem guardar a palavra-passe no recetor, recuperação automática da saída após reconexão/reinício. Revogar todos ou esquecer um dispositivo. Credenciais ficam fora dos shows e do GitHub.
- Aplicativos recordam o endereço e permitem ligação automática ao abrir. Mantidas as opções Casa/Outro servidor e validação normal de certificados HTTPS.
- Setlist lateral nos Hosts com música atual/tocadas, sempre visível ou ocultação após 1–300 s. Botão para abrir/recolher, preferência por dispositivo e atualização durante o espetáculo.
- Guia móvel, instruções de continuidade, versões da interface e caches atualizados. É necessário atualizar o StageSet principal e reabrir os Hosts para receber a interface nova.

Validação: `npm run check`, 29 testes unitários/rede e suite Electron completos aprovados. Testada gravação HTTP → IPC → IndexedDB, preservação da letra principal, desenho tátil ancorado, gesto de pinça real no Chromium, tamanho local, compensação sem alterar transporte, setlist/temporizador, palavra-passe pelo menu e reconexão após recarregar. Testes de autorização incluem reinício do servidor, recuperação da saída, revogação e ausência de palavras-passe/tokens em claro no ficheiro do servidor. APK e testes Android compilados; lint aprovado.

Verificação de distribuição: APK 0.17.0 (17000), Android mínimo 8/API 26, assinatura v2 verificada. Host portátil EXE testado com janela Windows visível, ligação HTTP real, receção de letras, isolamento e encerramento com código zero. Revogar uma autorização limpa imediatamente a apresentação no Host e exige nova entrada.

A suite Electron também passou dentro do `app.asar` distribuído (código funcional `37dd31a`). No GitHub, a mesma revisão passou os testes Android (ligação, letras, edição, tamanho e setlist no emulador) e iPad (compilação, ligação e receção no simulador): https://github.com/luisrodr123/StageSet-Nova/actions/runs/41597293948. O desenho e a pinça foram exercitados com entrada tátil real no Chromium dos testes; estes resultados não substituem o ensaio físico no tablet.

Pacotes gerados; somas também em `SHA256SUMS.txt`:

- `StageSet-0.17.0-Portable-x64.exe` — `00ad3598dee367457d0ded7210c2f0bc182002876efe85aa4179a83a136ed35c`.
- `StageSet-0.17.0-Setup-x64.exe` — `c41fb3017fec7371f106f0de804464b2dacd24f3f03f088ff13d8f95715ad2cc`.
- `StageSet-Host-0.17.0-Portable-x64.exe` — `9a112b5b7a20c4e8e448284e85db5227b7d4c26599f8e9fe9b7e9bd5d1f8e5da`.
- `StageSet-Host-0.17.0-Android-Test.apk` — `03b383aca1e9e22eef0857f8094fe98ee919a9456c5d422f5039d1f34e48d27c`.
- `StageSet-Host-0.17.0-iOS-Project.zip` — `5b3b2063fe819193cfb24c6975a53851ac0aa3ddec43d46095d90b00f4cd715a`.

Limites: a compensação reduz a espera introduzida pela aplicação, mas não elimina a latência física nem mede a latência do áudio. Ensaio em tablets físicos e na rede Wi-Fi do espetáculo ainda necessário. Edição exige Studio no principal; consulta da setlist não controla reprodução. No iPad mantém-se a versão web; o projeto nativo necessita de compilação/assinatura Apple. A reconexão automática usa o mesmo endereço/origem e requer o servidor ativo.


## 2026-11-02 — versão 0.16.0

- Corrigido o Host portátil que terminava sem janela: o lançador passa a extrair diretamente os ficheiros, evitando a falha observada no caminho de extração 7z. Janela mostrada após carregar; erro de arranque apresentado e perfil Host separado da biblioteca StageSet.
- Teste novo abre o EXE final, confirma janela Windows visível, liga a um servidor real, recebe letras e fecha com código zero. Este teste passou localmente e passa a fazer parte do workflow Windows. Os testes anteriores da 0.15 carregavam o app.asar e não detetavam a falha do lançador.
- Host nativo Android para telemóveis e tablets Android 8+, com endereço, ligação, letras, modo imersivo e gravação de PDF. APK pequeno que usa o WebView do sistema, com assinatura de desenvolvimento para ensaios; não é uma publicação Play Store.
- Projeto iOS universal para iPhone e iPad (iOS/iPadOS 16+), com acesso à rede local e partilha de PDF. Distribuído como código XcodeGen; assinatura Apple necessária para instalação física. O utilizador escolheu testar primeiro no iPad através da versão web instalável.
- PWA adaptada a tablets e telemóveis, margens de segurança, botões de toque, instruções de instalação Safari/Chrome, nome do dispositivo recordado e pedido de manter o ecrã acordado quando suportado. Código da sessão continua a ser introduzido ao ligar.
- Guia HOST-ANDROID-IOS.md e projetos móveis disponíveis nos dois repositórios. O incremento de versão mantém também o projeto iOS e o cache Host alinhados.

Validação aprovada: 26 testes automáticos, sintaxe/versões, suite Electron sobre o app.asar final e Host portátil real com janela visível/ligação/letras/saída zero. Windows isolado confirmou instalação/início/desinstalação e o novo teste do EXE Host: https://github.com/luisrodr123/StageSet-Nova/actions/runs/41536702226. Android: compilação APK e testes, lint sem erros, assinatura APK v2 verificada; ligação/receção e validação de endereços passaram no emulador de tablet no job Android de https://github.com/luisrodr123/StageSet-Nova/actions/runs/41545214282. O primeiro ensaio Android sem acesso KVM foi lento; o runner passou a permitir aceleração.

iOS: compilação e teste de ligação/receção num simulador iPad passaram no job iOS de https://github.com/luisrodr123/StageSet-Nova/actions/runs/41536267330. Um ensaio seguinte encontrou instabilidade do foco do teclado no teste; passou a usar avanço/submissão pelo teclado. A nova execução está identificada no workflow móvel acima. Não se declara instalação em iPad físico nem se fornece IPA sem assinatura. PDF/partilha nativa móvel e aparelhos físicos/rede do espetáculo continuam por ensaiar; PDF nativo limitado a 30 MB.

Distribuição local: código da aplicação principal fd3e30b; Host Windows conforme 860070d (sem alterações posteriores no runtime Host). SHA256SUMS.txt inclui os cinco artefactos:

- StageSet-0.16.0-Portable-x64.exe — 740e265187e371e29507f6fe847f571925345f435d94bf1f47beb3284f2b694a.
- StageSet-0.16.0-Setup-x64.exe — 7d3870432b7e46367460876559b2c6d12a9d8c5e3bb6329504ed3a866ed48a43.
- StageSet-Host-0.16.0-Portable-x64.exe — 54c81f59a07d4af61eb39717e56e62d1c8010475e4dfeb4a4959fe7998909574.
- StageSet-Host-0.16.0-Android-Test.apk — 1605475fb965b4333c0120d6e5ffafa3b99347e71b63858dfe4410099337914a.
- StageSet-Host-0.16.0-iOS-Project.zip — 2da387224f62f8761d9d59cdc3ae50ee7a967ebae7965a0523132a04f30a61e5.


## 2026-11-02 — versão 0.15.0

- Botão explícito Limpar setlist; mantém as músicas na biblioteca. Limpar biblioteca pede confirmação e preserva ficheiros originais e cópias na pasta do show.
- Novo show cria pasta própria, guarda cópia do show anterior junto dessa pasta e começa com biblioteca/setlist vazias. Importações, stems, MIDI, documentos, letras e anexos são copiados para a pasta; Show.stagebackup contém o restauro completo.
- Gravação automática na pasta após alterações, estado de gravação e botão Guardar na pasta. Abrir pasta de show e exportação ZIP da pasta completa, até 2 GB. Ficheiros retirados da biblioteca permanecem na pasta.
- Desktop recorda a pasta entre arranques. No browser, requer acesso a pastas e nova seleção após reabrir. Extrair o ZIP antes de usar Abrir pasta de show noutro PC; para shows maiores copiar a pasta diretamente.
- Aplicativo StageSet Host portátil Windows: endereço, ligação HTTP/HTTPS, código e atribuição de saída, sem biblioteca nem áudio local. HTTPS requer confiança normal do certificado.
- Integra as quatro ideias implementadas como 0.14; não houve distribuição intermédia 0.14.

Validação: 26 testes automáticos aprovados, incluindo backup de vários anexos grandes, ArtDmx em loopback, proteção de caminhos, preservação dos originais, pasta e estrutura ZIP. Suite Electron aprovada, incluindo Novo show, salvaguarda do anterior, gravação automática, ZIP, limpeza separada e restauro. Recetor Host dedicado testado com ligação HTTP real, código, atribuição, receção de letras e isolamento do código remoto. Ambas as suites também passaram nos app.asar distribuídos, correspondentes ao código d68d621. SL04 física e cinco sistemas reais por ensaiar.

Distribuição Windows x64 gerada, sem assinatura digital:

- StageSet-0.15.0-Portable-x64.exe — SHA256 d53175ab71f6731de8bd2908a5b5ebcc5fc07df694b30398d737ceed584463e6.
- StageSet-0.15.0-Setup-x64.exe — SHA256 abc75e82d4b1dd6ea977643afe9c3051c2511772dcd1d820741ab4df9553ca1f.
- StageSet-Host-0.15.0-Portable-x64.exe — SHA256 dcd048a9c8f52c78721dc9cb918408fdd8577a20ad5ae329b23831ff75e92722.
- O workflow GitHub compila os três executáveis e verifica instalação/início/desinstalação do StageSet num Windows descartável. Uma execução no backup encontrou uma porta reservada do Windows; os testes passaram a pedir uma porta disponível ao sistema. A execução do código d68d621 no principal passou os testes e encontrava-se a compilar o Host durante esta geração: https://github.com/luisrodr123/StageSet-Nova/actions/runs/41446246168.


## Versão 0.14.0 — incorporada na 0.15.0

- Traços novos associados às linhas das letras: acompanham o scroll, foco e redimensionamento. Notas antigas preservadas com opção explícita de as fixar às linhas visíveis.
- Exportação PDF por saída: letra completa e anotações, páginas A4 e nome da música/janela. PDF visual rasterizado, sem texto pesquisável.
- Menu Inserir com botão direito no editor principal e no editor de cada janela: MIDI, imagem, vídeo e DMX, com campos próprios, tempo de execução e dimensões para multimédia.
- SL04: saída Art-Net pela interface USB de rede que a caixa disponibiliza, IP configurável, quatro universos, canais/valores, transições e blackout. Não utiliza nem altera os modos proprietários da caixa.
- StageSet Host web: recetores com código de sessão, presença automática após ligação e atribuição de saída no StageSet. Recebe letras, desenhos, fundos e multimédia; não recebe autorização para controlar o transporte.
- Manifesto e ícones para instalação web nos cinco sistemas pedidos. HTTP para teste no browser; HTTPS com certificado PFX e confiança no dispositivo para instalação. Script de criação de certificados locais, sem instalar confiança automaticamente.

Validação local aprovada: desenho acompanha scroll, PDF de três páginas renderizado e revisto, imagem/vídeo importados e descodificados, dimensões, backups, recetor a 390×844, atribuição/revogação, isolamento e ponte desktop com disparo temporal DMX. HTTPS ensaiado com PFX, cadeia de confiança e IP SAN, sem instalar confiança no Windows. A SL04 física e os cinco sistemas não foram testados neste computador.


## 2026-10-31 — versão 0.13.0

- Menu sobreposto no palco principal, nas janelas independentes e em cada painel do mosaico. Opacidade de 10% a 100%, recolha automática opcional, tamanho de letra e saída de vídeo nos controlos da janela. Preferências guardadas por saída e transportadas no backup do show.
- Ecrã inteiro do painel de letras no monitor atual, sem barras da aplicação, moldura ou transporte. Controlos e editor permanecem dentro desse painel; botão de saída e Escape para regressar.
- Consulta independente da letra completa com roda, arrasto do rato e botões anterior/seguinte. Não altera o áudio, a velocidade nem o transporte Master/Slave. Cinco segundos após a última interação regressa à frase sincronizada atual; botão para regressar imediatamente.
- Edição das letras no próprio ecrã, incluindo em fullscreen. Guarda apenas a saída selecionada, mantendo os tempos. O rascunho fica associado à música em que foi aberto e conflitos com outra edição não o apagam. Respeita a proteção Studio/Live.
- Anotações com caneta, cor, espessura, borracha, anular e limpar. Guarda cada traço por música e saída; posições proporcionais acompanham o redimensionamento do monitor. Desenhos fixos sobre o ecrã, incluídos no backup, distintos entre Palco/Banda/Público/etc.
- Integra todos os ajustes de rede desenvolvidos como 0.12.0, descritos abaixo. Não houve distribuição intermédia 0.12.0.

Verificação local aprovada: sintaxe/IDs/versões, 21 testes automáticos e suite Electron com perfil temporário. Confirmados: consulta isolada, reinício do prazo de 5 s, regresso ao foco atualizado sem deslocar o transporte, reabertura do menu com um clique, fullscreen HTML sem bordas, edição independente, conflito preservando rascunho, mudança de música sem trocar o destino da edição, caneta/borracha/anular, persistência/reabertura e backup. Capturas dos controlos e indicadores revistas. A permissão fullscreen foi ativada apenas para a origem local da aplicação desktop.

Limites de ensaio: fullscreen HTML testado sem ocupar o monitor físico do utilizador; mudança entre vários monitores e utilização em dois PCs físicos requerem ensaio no equipamento do espetáculo. Ativação de fullscreen local a cada janela; não é enviada pelo Master da rede. Os desenhos ficam fixos sobre o ecrã, não ligados a palavras.

Distribuição 0.13.0 gerada e validada: a suite Electron também passou sobre dist/win-unpacked/resources/app.asar, correspondente ao código 535c110. Instalador e portátil Windows x64, sem assinatura digital; SHA256SUMS.txt acompanha os ficheiros.

- StageSet-0.13.0-Portable-x64.exe — SHA256: 8cddec361e82e0f7a34e7c2d0e51889d24a0c900e79ab8afd6824f94a8d75446.
- StageSet-0.13.0-Setup-x64.exe — SHA256: 5c9b9a5e690783c50c50f28e596c5f8dbf672e5c56bc67d9be5ad7a4a9560b2c.
- Verificação de instalação/início/desinstalação em Windows isolado submetida ao GitHub: https://github.com/luisrodr123/StageSet-Nova/actions/runs/41231472719. Ainda em execução no momento desta geração local; não foi realizada instalação sobre o perfil do utilizador.


## Versão 0.12.0 — incorporada na 0.13.0

Conjunto de ajustes de rede incluído na distribuição 0.13.0.

- Deteção das interfaces IPv4 locais, escolha automática de um IP existente e seletores com nome da placa/endereço para sessão Master/Slave e IP MIDI. Botão para atualizar interfaces após mudar a ligação de rede.
- Modo Disponível e atribuição da função Slave a partir do Master, respeitando a opção de permitir atribuição remota.
- Botão Passar comando (Master), com confirmação entre os computadores, encaminhamento dos Slaves selecionados e pausa durante a transferência.
- Indicadores luminosos na barra principal e na lista: azul para Master ligado, laranja para Slave ligado e cinzento enquanto não existe ligação confirmada.
- Mensagens e ações separadas para computadores detetados, ligação em curso, ligação confirmada, libertação e perda de sinal; instruções de configuração e ajuda para a rede.
- Novos testes preparados para interfaces, atribuição remota, transferência com perda de mensagens e indicadores da interface.

Verificação em 2026-10-31: testes de interfaces, protocolo, atribuição remota, transferência com mensagens perdidas e dois pares multicast locais aprovados. A suite Electron confirmou o IP automático, seleção remota, indicadores azul/laranja, transporte MIDI, perda de ligação e mudança de interface.

O utilizador confirmou a ligação Master/Slave da 0.11 entre os seus PCs. Os novos ajustes de rede foram verificados localmente; a validação física desta versão em dois computadores continua pendente.


## 2026-10-30 — versão 0.11.0

- Fundos independentes para palco principal e cada saída de letras: cor sólida ou wallpaper, preencher/imagem inteira/repetir padrão, escurecimento e pré-visualização. Botão Fundo junto de cada saída nas Configurações.
- JPG, PNG, WebP, GIF (imagem fixa), BMP e SVG importados como imagem raster otimizada (até 180 000 caracteres por saída). EPS convertido no desktop com Ghostscript instalado separadamente; não é incluído nos EXE. Originais até 16 MB. O ficheiro original pode ser movido depois da importação.
- Fundos atualizados em tempo real nas janelas abertas e no mosaico, persistidos por saída para todas as músicas e incluídos no backup do show. Imagens só são reenviadas às janelas quando mudam, sem repetir dados em cada atualização de letras. Erros de ficheiro ou armazenamento preservam o fundo anterior.
- Descoberta de computadores StageSet desktop na LAN e seleção de até 16 Slaves pelo Master. Ativação explícita em cada PC com o mesmo código de sessão, nome, grupo multicast e porta configuráveis.
- Canal StageSet UDP multicast separado das dez portas IP MIDI: grupo 225.0.0.37, porta 21938 por defeito. Mensagens autenticadas com HMAC-SHA256, sequências e sessão renovada por arranque. Código não gravado em disco nem exportado. Os dados não são cifrados.
- Slaves selecionados seguem música, reproduzir/pausar, posição e velocidade. A biblioteca fica local; identificar por ID de um backup comum ou título/nome de ficheiro exatos e únicos. Música ausente/ambígua pausa e informa o Master.
- Libertação, perda de sinal (2,5 s) ou estado de reprodução congelado no Master interrompem o seguimento. Loops e avanço automático locais não competem com o Master. Sincronização SMPTE/MTC é parada ao ativar a sessão; pode ser retomada ao desligá-la. Temporizadores desktop mantidos ativos com janela minimizada.
- Versão, cache, documentação, lista de anotações e ambos os formatos de distribuição preparados para 0.11.0.

Validação local: 14 testes de protocolo/backup aprovados, incluindo dois pares multicast reais no mesmo PC, isolamento de Slaves, autenticação/repetição/perda de sinal e conversão EPS real. Testes Electron com perfil temporário aprovados: fundos diferentes por saída, mudança ao vivo, exportação e reabertura; ponte nativa simulada com seleção de música, seek/play, pausa por perda e publicação Master. Sintaxe, IDs HTML e versões aprovados. Capturas verificadas: wallpaper quadriculado e cor sólida em saídas diferentes. Instalador e portátil 0.11.0 gerados por scripts versionados; o ficheiro SHA256SUMS.txt acompanha a distribuição.

Distribuição local concluída e testada a partir de dist/win-unpacked/resources/app.asar (código 7f9cb33). Os mesmos testes Electron passaram no pacote distribuído.

- StageSet-0.11.0-Portable-x64.exe — SHA256: c49c136d1745a210c2a185d3686d24590c656479850d2b5326e24b7c7c906ab4.
- StageSet-0.11.0-Setup-x64.exe — SHA256: 6703ca066f373891a920e537aff1687f78239da20a94e8659bdda04ad5e29175.
- Verificação Windows isolada submetida: https://github.com/luisrodr123/StageSet-Nova/actions/runs/41111149738. O resultado remoto ainda não estava disponível no momento da geração local.

Limites: ensaio com dois PCs físicos, firewalls/redes e vários monitores ainda necessário. Descoberta através do canal StageSet na rede local, não através de MIDI convencional nem RTP-MIDI/AppleMIDI. Não transmite ficheiros áudio, não cifra o tráfego e não garante sincronismo à amostra; correção de posição acima de 200 ms. EPS requer Ghostscript e é rasterizado numa área de 1600×1200. CD+G e documentos PDF mantêm a sua própria imagem sobre o fundo.


## 2026-10-30 — versão 0.10.0

- Corrigida a perda do rascunho do palco principal quando se guardava noutra saída; gravação e autosave conservam todas as saídas editadas e o BPM. Fechar o editor guarda o rascunho pendente.
- Janelas de letras com tamanho e monitor selecionáveis; identidade estável ao remover outras saídas. Letras de saídas removidas não são reutilizadas por posição.
- Mosaico: ocultação efetiva, visibilidade persistente e remoção de painéis eliminados. Timestamps continuam opcionais e ocultos por defeito.
- Importação MIDI/KAR no editor conserva timestamps e BPM; não apresenta cabeçalhos de karaoke. Abrir letras MIDI embutidas já não descarta os tempos. Exportações independentes TXT/KAR verificadas com o nome da saída e BPM.
- Criação com apenas MIDI/KAR usa o ficheiro original; ZIP de stems expandido antes da escolha da faixa principal, até 32 pistas. Associar MIDI atualiza BPM e duração.
- Preferências de monitores e timestamps incluídas no backup; ecrãs restaurados no arranque desktop.
- Consolidado o estado de todos os pedidos em docs/ANOTACOES.md. Versão, lockfile, interface, README e cache atualizados.
- Validação local aprovada: verificação de sintaxe/IDs/versões, oito testes de protocolos/backup e testes Electron ampliados para rascunhos entre saídas, importação/exportação, controlos das janelas, remoção, mosaico e nova música MIDI. Perfil temporário; biblioteca do utilizador preservada.
- Instalação, arranque e desinstalação aprovados num Windows descartável do GitHub, juntamente com testes, compilação e carregamento dos artefactos: https://github.com/luisrodr123/StageSet-Nova/actions/runs/41097267196. Código verificado: 26c7c32.

Distribuição local gerada: StageSet-0.10.0-Setup-x64.exe e StageSet-0.10.0-Portable-x64.exe. Os testes Electron também passaram usando os ficheiros dentro do app.asar distribuído. Capturas das novas janelas em dist/qa.

- SHA256 portátil: `90b184eb9e4f9ee3c7f319922f7001aa9e727a2a7ada7b2baa0aa880fd86715b`.
- SHA256 instalador: `09a93b5f3ba5a408bf35d9afb390b80dc46fb07a20fdbdc02f9ee4c8f6234c6b`.

Continuam a exigir equipamento físico: interfaces áudio/MIDI e níveis/latência LTC, vários monitores e comunicação entre dois PCs. Sem driver virtual Windows, RTP-MIDI/AppleMIDI, LTC inverso ou garantia de genlock. Estes limites não são apresentados como funções verificadas.


## 2026-10-28 — versão 0.9.0

Implementado no código:

- MTC: emissão e leitura de quarter-frame/full-frame, 24/25/29,97 DF/30 fps, seleção de portas, desvio e seguimento opcional da música atual. Pedir acesso SysEx pelo botão de atualização nas Configurações para mensagens full-frame.
- SMPTE/LTC: emissão PCM por AudioWorklet e leitura biphase-mark; seleção de dispositivos áudio e paragem de seguimento por perda de sinal. Leitura LTC em marcha inversa não suportada.
- IP MIDI desktop: dez portas UDP multicast independentes com 16 canais cada, seleção de interface, ativação/desativação explícita e integração nos menus de entrada/saída e rotas do mixer. Não instala um driver virtual Windows; não é RTP-MIDI/AppleMIDI.
- Mosaico: escolha de saídas visíveis, tamanho de letra por música/saída, seleção de monitor na versão desktop e timestamps opcionais, ocultos por defeito. Controlos mantêm-se estáveis durante as atualizações.
- Learn com botão direito para botões, incluindo controlos gerados dos mixers, pedais e janelas. Atalho de teclado e MIDI coexistem; menu para aprender/remover; CC repetido enquanto premido não volta a alternar a ação.
- Importação MIDI: andamento explícito no tick zero já não é substituído pelo padrão de 120 BPM.
- Backup/restauro: preserva os quatro tipos de seleção MIDI, nomes e preferências das saídas, atalhos, Next/Stop, nomes dos canais e marcas de músicas tocadas. Corrigido o tipo e identificador do trigger dos pedais.
- Editor de letras alargado e adaptado para manter os controlos visíveis; criação de música vazia, mixer numerado/editável, atribuição de eventos MIDI por música e mais de quatro pedais verificados.
- Continuidade: AGENTS.md, docs/CONTINUAR.md, scripts de versão/verificação/checksum, lockfile e workflow GitHub Actions para testes e builds Windows.

Verificação concluída em perfil isolado:

- `npm run check`: sintaxe, IDs HTML e versões coerentes.
- `npm test`: 8 testes aprovados, incluindo tráfego UDP real nas dez portas e dezasseis canais, estados de mensagens MIDI, backup, BPM, limites drop-frame, MTC e PCM LTC a 44,1/48 kHz nos quatro frame rates.
- `npm run test:smoke`: criação de música/setlist, login e confirmação de palavra-passe, editor com foco, gravação e reabertura, nomes do mixer, cinco pedais, CC/PC/Note/Song Select e alteração de tamanho no mosaico persistente. Editor verificado a 1273×930, 1024×768 e 800×650. Captura em dist/qa/editor.png.
- Runtime de desenvolvimento reposto a partir da distribuição oficial Electron 44.7.2. A cópia anterior era um executável StageSet renomeado e não executava os testes; não usar essa cópia para futuras builds.

Distribuição: gerados `StageSet-0.9.0-Setup-x64.exe` e `StageSet-0.9.0-Portable-x64.exe`, com o runtime oficial e metadados Windows 0.9.0.0. Os testes de interface também passaram usando os ficheiros incluídos em `dist/win-unpacked/resources/app.asar`.

Publicação concluída: fontes e tag v0.9.0 nos dois repositórios; instalador, portátil, SHA256SUMS.txt e ficheiro de alterações carregados nas duas Releases:

- Principal público: https://github.com/luisrodr123/StageSet-Nova/releases/tag/v0.9.0
- Backup privado: https://github.com/luisrodr123/StageSet-0.8/releases/tag/v0.9.0
- SHA256 portátil: `9dfd7310cd61ce1e8ea3ccc357da563ce211793eb5f65ef44501357bee1528e7`.
- SHA256 instalador: `c7a4232b6d6f09197e2320a7ba8dbaa37ecf3183d15c18746899dfa2af7ac97b`.

Ajuste de continuidade após o tag: o ramo main inclui postinstall explícito do Electron oficial para que `npm ci` num PC novo instale também o runtime. O tag inicial requer `node node_modules/electron/install.js` após npm ci. Isto não altera o funcionamento dos executáveis distribuídos. As Releases estão identificadas como pré-lançamento devido aos ensaios físicos pendentes.

Verificação num Windows limpo do GitHub Actions: instalação de dependências, verificação de código, oito testes e testes de interface aprovados. A primeira compilação gerou ambos os EXE mas terminou com erro porque o electron-builder tentou publicar automaticamente. Os comandos de compilação passaram a usar `--publish never`; o workflow guarda os artefactos e a publicação em Releases continua a ser uma operação explícita.

Resultado após a correção: [workflow completo aprovado no repositório principal](https://github.com/luisrodr123/StageSet-Nova/actions/runs/40677472594), incluindo geração dos dois EXE, checksums e carregamento dos artefactos. Commit de código verificado: `e9f0c0a`, sincronizado no backup. O ficheiro de alterações anexo às Releases é atualizado para incluir este registo; os EXE publicados mantêm os checksums acima.

Validação externa pendente: instalação/desinstalação numa conta Windows limpa; dois PCs em multicast; interfaces MIDI/áudio reais e níveis/latência LTC; seleção de vários monitores físicos. A compilação e os testes automáticos não comprovam estes ensaios. Em ecrãs muito pequenos, os painéis podem necessitar de scroll. Código fonte e biblioteca são separados: usar backup de show para transferir músicas entre PCs.

## 2026-10-27 — distribuição 0.8.0 e desenvolvimento 0.9.0

O pedido atual autoriza gerar executáveis antes de terminar as funções pendentes. Foram gerados `dist/StageSet-0.8.0-Portable-x64.exe` e `dist/StageSet-0.8.0-Setup-x64.exe`. São uma fotografia da versão 0.8, sem as alterações seguintes. Não foram instalados sobre os dados do utilizador.

Alterações 0.9 em curso:

- Dez entradas e dez saídas IP MIDI multicast, cada uma com 16 canais, integradas nos seletores MIDI e no mixer da aplicação desktop. Ligar/desligar explicitamente nas Configurações; grupo e interface configuráveis. Não instala portas virtuais no sistema Windows nem implementa RTP-MIDI/AppleMIDI.
- Emissão/leitura MTC quarter-frame e full-frame; SMPTE/LTC em áudio por AudioWorklet; seleção de entrada/saída, 24/25/29,97 DF/30 fps e desvio. Seguimento da música atual opcional, com paragem na perda de sinal. Validação com equipamento externo ainda pendente.
- Correção do relógio MIDI: o andamento padrão de 120 BPM já não substitui um evento de andamento explícito no tick zero.
- Backup passa a conservar MIDI Note e Song Select, definições de janelas, atalhos e Next/Stop; correção do restauro dos pedais e das marcas de músicas tocadas.
- Preparação dos repositórios `luisrodr123/StageSet-Nova` (principal público) e `luisrodr123/StageSet-0.8` (backup privado), por indicação do utilizador. Publicação e validação ainda em curso.

Os resultados dos testes e os executáveis 0.9 serão registados após conclusão. Não considerar esta secção uma confirmação de ensaio em palco.

Abra a aplicação em `http://127.0.0.1:4177`.

## Fluxo de edição

1. **Biblioteca** — importe ou selecione uma música.
2. **Letras** — use o editor de letras para alterar o texto, cores e tamanho.
3. **Linha temporal** — use o editor de timeline para adicionar eventos MIDI e guardar marcações.
4. **Setlist** — organize a ordem arrastando as músicas e teste a reprodução.

## Notas de execução

- As alterações são guardadas localmente no browser através do armazenamento da aplicação.
- Para desfazer uma alteração na timeline, use `Ctrl+Z` quando o editor estiver ativo.
- Recarregar a página mantém os dados guardados neste perfil do browser.
- Este ficheiro serve como guia anotado; a execução das alterações é feita nos editores da aplicação.

## Verificação rápida

- [ ] A música aparece na biblioteca.
- [ ] A letra foi guardada e aparece no palco.
- [ ] Os eventos da timeline aparecem na posição correta.
- [ ] A setlist reproduz na ordem pretendida.

## Anotações e requisitos

Esta lista mantém todas as indicações, incluindo as já iniciadas. O estado de implementação e de verificação está registado abaixo; uma alteração de código não equivale a uma função testada.

- Ajustar tamanho de letra com atualização em tempo real na saída correspondente e guardar por música e por saída.
- Permitir que todos os botões tenham função Learn no botão direito, criando atalhos MIDI e/ou teclado.
- No acesso ao Studio, mostrar apenas o campo da palavra-passe quando esta já foi criada; a confirmação fica apenas nas Configurações.
- Na biblioteca, mostrar sempre o nome da música e ordenar os elementos por: duração, CC, adicionar à setlist e restantes ações.
- No menu de intervalo entre músicas, acrescentar funções Next e Stop.
- Criar opções Save Setlist e Load Setlist.
- Criar nova música com importação agrupada de stems e MIDI/KAR, além da opção de criar uma música vazia.
- Permitir selecionar uma saída de vídeo independente para cada janela criada.
- Permitir selecionar a saída de vídeo do ecrã principal.
- Permitir escolher as saídas no mosaico e configurar o tamanho da fonte por janela.
- Suportar SMPTE, MTC e criação de portas IP MIDI.
- Disponibilizar seleção de entradas e saídas MIDI, com 10 portas MIDI independentes e 16 canais por porta.
- Exportar cada saída de letras separadamente em texto, MIDI ou KAR, identificando a janela no nome do ficheiro.
- Importar ficheiro MIDI ou KAR para obter o andamento em BPM.
- Ajustar a designação do campo de seleção MIDI ao tipo de mensagem escolhido.
- Permitir mais de quatro pedais MIDI configuráveis.
- No editor de letras, acompanhar a letra por scroll e mostrar a barra de foco durante a reprodução.
- Mostrar campos para introduzir os eventos correspondentes ao tipo de mensagem MIDI selecionado.
- Ajustar a janela do editor de letras para manter as funções visíveis.
- Permitir editar os nomes dos canais do mixer de áudio e mostrar o número à esquerda de cada canal.
- Permitir escolher se os timestamps são apresentados no mosaico; não os mostrar por defeito.
- Verificar a importação de BPM de MIDI/KAR.
- Corrigir o botão Nova música, que foi reportado como não funcional.
- Fazer a opção de ocultar aplicar-se às músicas já tocadas na setlist atual.
- Incrementar o número de versão à medida que as alterações são implementadas e manter este ficheiro atualizado.

## Estado de desenvolvimento — versão 0.8

As seguintes alterações estão no código, mas ainda precisam de verificação na interface e, quando aplicável, com dispositivos:

- Acesso ao Studio, apresentação da biblioteca, guardar e carregar setlists e escolha Next/Stop.
- Ajuste do tamanho de letra por música e saída; seleção de ecrãs na versão de desktop; seleção das saídas no mosaico já existente.
- Criação de música vazia ou agrupada, aprendizagem de atalhos em botões identificados e adição de pedais.
- Exportação de letras por saída, importação do BPM inicial MIDI/KAR e ocultação do campo CC quando não aplicável.
- Destaque e acompanhamento da linha no editor, e correção da abertura do editor de letras.
- Nova janela de criação de música, campos de atribuição MIDI por música, nomes editáveis e numerados no mixer e filtro de músicas tocadas na setlist.
- Opção para mostrar timestamps no mosaico e ajuste da dimensão do editor; requerem verificação visual. A importação MIDI/KAR lê o BPM inicial, não um mapa de mudanças de andamento.

Continuam por concluir ou validar integralmente: SMPTE, MTC e portas IP MIDI; dez portas MIDI independentes com 16 canais; Learn para todos os botões; controlo do mosaico e testes completos de saídas de vídeo. A verificação de sintaxe passou, e foi feito um teste pontual de leitura e exportação MIDI/KAR. Os executáveis finais ainda não foram gerados com estas alterações.
