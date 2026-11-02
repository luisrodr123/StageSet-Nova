# Shows e Host portátil — 0.15

## Novo show e pasta

No Studio, carregar **Novo show**, indicar o nome e escolher a pasta onde será criada a nova pasta desse show. Se houver uma biblioteca, uma cópia `StageSet-anterior-….stagebackup` é guardada junto da nova pasta antes de a biblioteca ficar vazia. Não substitui uma pasta existente com o mesmo nome.

As importações seguintes são copiadas para `media/<id da música>/`, incluindo áudio/documentos, stems, MIDI/KAR, CD+G, letras por saída e anexos. `Show.stagebackup` guarda o show completo com definições, desenhos, fundos e setlist; `stageset-show.json` identifica a pasta. Os ficheiros de origem não são movidos nem apagados. As cópias retiradas da biblioteca permanecem na pasta.

Alterações de músicas/setlist/letras iniciam a gravação automática após um curto intervalo. Ver o estado no **Menu**; antes de fechar ou transportar, carregar **Guardar na pasta** e aguardar **guardado**. Em caso de erro de disco, a biblioteca local continua disponível e o erro é apresentado; tentar guardar de novo. O desktop recorda a pasta; no browser, **Abrir pasta de show** volta a pedir acesso após reabrir. Browsers sem acesso a pastas devem usar o executável desktop.

**Limpar setlist** retira apenas a lista atual. **Limpar biblioteca** pede confirmação e retira músicas/lista da aplicação, mantendo os originais e cópias em disco. Exportar o show antes de limpar se quiser conservar também as edições atuais.

## Levar para outro PC

1. **Menu → Exportar pasta ZIP**, guardar fora da pasta do show. Inclui toda a pasta, mesmo cópias de ficheiros já retirados da biblioteca.
2. Copiar o ZIP para o outro PC e extrair para uma pasta local.
3. No StageSet, **Menu → Abrir pasta de show** e selecionar a pasta extraída. Em alternativa, **Abrir show** aceita o `Show.stagebackup`, sem ligar automaticamente a pasta.

ZIP padrão, sem ZIP64 e sem compressão adicional; limite de 2 GB para exportação. Para shows maiores, copiar a pasta diretamente. A gravação utiliza memória para preparar o backup; bibliotecas grandes exigem RAM/espaço livres. O ZIP não inclui o instalador do StageSet.

## Host portátil Windows para teste

Executar `StageSet-Host-0.15.0-Portable-x64.exe` no PC recetor. No StageSet principal: **Configurações → StageSet Host → Ativar recetores**. Copiar o endereço mostrado para o aplicativo Host, carregar **Ligar**, indicar o nome do PC e o código da sessão. Atribuir a saída na lista de recetores do StageSet principal.

Funciona em paralelo com outros recetores no browser. HTTP é suficiente para o aplicativo Windows na LAN; HTTPS exige certificado confiado, tal como no browser. O aplicativo não ignora erros de certificado. F11 ou o botão do ecrã de letras ativa fullscreen. Para mudar de servidor, usar o menu Ligação (Alt revela a barra de menus).

É um recetor dedicado, sem biblioteca local e sem som; o runtime Electron torna o EXE maior do que a página web. Android, iOS, Linux e macOS continuam a usar o recetor web instalável, descrito em [Host e eventos](HOST-E-EVENTOS.md).

## Continuar o desenvolvimento

Depois de clonar o repositório: Node.js 24, `npm ci`, `npm run desktop`. Verificar com `npm run check`, `npm test` e `npm run test:smoke`. Gerar a aplicação com `npm run dist:win:all`; gerar o recetor separado com `npm run dist:host`. Não enviar bibliotecas, pastas de shows, certificados ou chaves para o GitHub. Ver [CONTINUAR.md](CONTINUAR.md).
