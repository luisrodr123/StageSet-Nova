# StageSet 0.22.8 — versão de teste

Corrige o bloqueio de leitura quando as WAV não satisfazem as condições do relógio partilhado: a aplicação volta ao modo de leitores independentes e apresenta o motivo no mixer. Se faltar algum ficheiro de pista, identifica-o e impede a reprodução parcial. O modo independente exige verificação do sincronismo.

Até 16 WAV PCM de duração igual e andamento 100% são agendadas no mesmo relógio de áudio, incluindo a pista principal. O mixer identifica este modo. Quando a estimativa dos buffers descodificados excede 512 MiB, é usado o modo independente; a memória efetiva usada pode ser superior. Outros formatos ou mais de 16 pistas continuam em leitores independentes. Foram testadas WAV curtas no modo partilhado e 16 WAV sintéticas de quatro minutos a 8 kHz no modo independente. Validar ficheiros reais e interface de áudio antes de qualquer utilização ao vivo. MIDI, rede e precisão do loop não foram validados à amostra.

Mute independente no master áudio, Click e SMPTE/LTC. A reprodução de pistas faz verificações no arranque e corrige deriva, mas continua sem garantia de sincronismo à amostra.

O ecrã inicial do Host Windows e Android foi compactado para apresentar pesquisa, seleção e endereço manual no mesmo ecrã; listas longas têm paginação.

O Host Windows e Android pode procurar computadores StageSet na rede, conservando a opção manual. Inclui faders independentes de click e SMPTE/LTC e marcadores de loop A/B alternáveis.

**Limitação importante:** os conjuntos fora das condições indicadas usam leitores independentes. Os testes não garantem ausência de falhas noutras máquinas. Não confiar neste mecanismo para uma atuação sem ensaios e validação em equipamento real.

Inclui visão geral e zoom nos mixers e mosaico, master MIDI/áudio, click BPM, indicadores e medidores, seleção múltipla de pistas, melhorias do show e do Host e correções no editor de letras. Ver o ficheiro STAGESET-ALTERACOES.md para o detalhe e as limitações.

Windows: Setup instala por utilizador e Portable executa sem instalação. O Host tem as suas próprias versões Setup e Portable. Os programas não têm assinatura digital de editor.

Android-Test.apk é para teste em Android. iOS-Project.zip é código para compilar e assinar num Mac com Xcode; não é um IPA instalável. A versão web continua disponível para iPad.

Antes de utilizar ao vivo, testar com a interface MIDI/áudio, o tablet e o equipamento DMX reais. Copiar os executáveis não transfere a biblioteca; usar o backup ou a pasta de show.

Neste ambiente Windows, se o Gradle falhar com `Unable to establish loopback connection` em `UnixDomainSockets`, pode ser necessário definir apenas para o processo `JAVA_TOOL_OPTIONS=-Djdk.net.unixdomain.tmpdir=D:/stageset-nonexistent-socket-dir-221`, apontando para uma pasta que não exista, antes de compilar. A compilação usou JDK 17 e SDK Android 35.
