# StageSet 0.22.1 — versão de teste

O Host Windows e Android pode procurar computadores StageSet na rede, conservando a opção manual. Inclui faders independentes de click e SMPTE/LTC e marcadores de loop A/B alternáveis.

**Limitação importante:** as pistas WAV ainda usam leitores independentes. Um teste isolado com 32 WAV silenciosas observou desvios entre 0 e 16 ms, mas isto não garante sincronismo à amostra ou ausência de falhas noutras máquinas. Não confiar neste mecanismo para uma atuação sem ensaios e validação em equipamento real.

Inclui visão geral e zoom nos mixers e mosaico, master MIDI/áudio, click BPM, indicadores e medidores, seleção múltipla de pistas, melhorias do show e do Host e correções no editor de letras. Ver o ficheiro STAGESET-ALTERACOES.md para o detalhe e as limitações.

Windows: Setup instala por utilizador e Portable executa sem instalação. O Host tem as suas próprias versões Setup e Portable. Os programas não têm assinatura digital de editor.

Android-Test.apk é para teste em Android. iOS-Project.zip é código para compilar e assinar num Mac com Xcode; não é um IPA instalável. A versão web continua disponível para iPad.

Antes de utilizar ao vivo, testar com a interface MIDI/áudio, o tablet e o equipamento DMX reais. Copiar os executáveis não transfere a biblioteca; usar o backup ou a pasta de show.

Neste ambiente Windows, se o Gradle falhar com `Unable to establish loopback connection` em `UnixDomainSockets`, pode ser necessário definir apenas para o processo `JAVA_TOOL_OPTIONS=-Djdk.net.unixdomain.tmpdir=D:/stageset-nonexistent-socket-dir-221`, apontando para uma pasta que não exista, antes de compilar. A compilação usou JDK 17 e SDK Android 35.
