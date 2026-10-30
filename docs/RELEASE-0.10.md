# StageSet 0.10.0 para Windows x64

Instalador e executável portátil, sem assinatura digital. Esta versão conclui correções encontradas na revisão das anotações:

- Grava as letras de todas as saídas editadas, mesmo terminando noutra janela.
- Janelas independentes com controlos de tamanho e monitor; remover uma saída mantém as identidades das restantes.
- Mosaico com visibilidade persistente e remoção imediata das saídas eliminadas.
- Importação de letras MIDI/KAR com tempos e BPM, sem cabeçalhos de karaoke no texto; exportação independente TXT/MID/KAR com nome da janela.
- Música criada só com MIDI/KAR usa o ficheiro original; ZIP de stems é expandido antes de escolher a faixa principal.
- Preferências de ecrãs e timestamps incluídas no backup do show.

Testes de protocolo/backup e testes de interface aprovados, incluindo as regressões acima. O workflow também verifica instalação, arranque e desinstalação num Windows isolado.

Mantém MTC, SMPTE/LTC e dez portas IP MIDI da versão 0.9. A validação física de interfaces, vários monitores e dois computadores continua necessária; distribuição identificada como pré-lançamento. IP MIDI é UDP multicast, sem driver virtual Windows nem RTP-MIDI/AppleMIDI. Consultar docs/ANOTACOES.md e docs/CONTINUAR.md.

Para transferir músicas, usar o backup de show; copiar apenas o EXE não transfere a biblioteca.
