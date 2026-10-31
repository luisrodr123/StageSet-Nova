# StageSet — alterações anotadas

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
