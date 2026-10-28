# StageSet 0.9.0 para Windows x64

Instalador e portátil da versão de desenvolvimento 0.9.0. O instalador permite escolher a pasta; o portátil executa sem instalação. Ambos estão sem assinatura digital.

- Dez portas IP MIDI de rede com 16 canais cada na aplicação desktop.
- Emissão e leitura de MTC e SMPTE/LTC, com seleção de dispositivos e seguimento opcional da música atual.
- Mosaico com tamanho de letra e monitor por saída, e opção de mostrar timestamps.
- Learn MIDI e teclado no mesmo botão.
- Correções de BPM importado, restauro de backup, editor de letras, criação de música, nomes do mixer e atribuições MIDI.
- Guia para continuar o desenvolvimento noutro PC e compilação automática no GitHub Actions.

Verificação: oito testes de protocolo/backup aprovados; testes Electron de criação, edição, gravação, reabertura, mixer, pedais, atribuições e mosaico aprovados. Falta validação com equipamento físico, vários monitores, duas máquinas em rede e instalação numa conta Windows limpa. Por isso esta distribuição está identificada como pré-lançamento.

Não inclui um driver de portas virtuais Windows nem sessões RTP-MIDI/AppleMIDI. Consultar `docs/CONTINUAR.md` para formatos, funcionamento e limitações.

Usar o backup de show do StageSet para transferir a biblioteca. Copiar o EXE ou clonar o repositório não transfere músicas. As cópias das alterações estão anexadas; SHA256SUMS.txt permite verificar os executáveis.
