# StageSet — alterações anotadas

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

Distribuição: gerados `StageSet-0.9.0-Setup-x64.exe` e `StageSet-0.9.0-Portable-x64.exe`, com o runtime oficial. Os checksums são produzidos por scripts/checksums.mjs. Repositório público `luisrodr123/StageSet-Nova` e backup privado `luisrodr123/StageSet-0.8` criados; os dois remotes Git estão configurados. Publicação das fontes e dos EXE em curso, com notas de pré-lançamento em docs/RELEASE-0.9.md.

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
