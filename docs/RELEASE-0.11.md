# StageSet 0.11.0 para Windows x64

Instalador e executável portátil, sem assinatura digital.

- Fundos independentes no palco principal e em cada monitor de letras: cor sólida ou wallpaper, preencher/imagem inteira/repetir, escurecimento e pré-visualização. Mudanças ao vivo nas janelas e mosaico; persistência e backup com as imagens incluídas.
- JPG, PNG, WebP, GIF (imagem fixa), BMP e SVG; EPS no desktop através de Ghostscript instalado separadamente. A imagem convertida fica guardada e não precisa do ficheiro original.
- Computadores Master/Slave: ativar em cada PC com o mesmo código de sessão e selecionar no Master os Slaves a controlar. Seguimento de música, posição, play/pause e velocidade; pausa por perda de sinal e diagnóstico de músicas ausentes.
- Descoberta StageSet em UDP multicast na porta 21938, separada das dez portas IP MIDI; mensagens autenticadas e seleção explícita. MIDI convencional não enumera computadores. Sem transferência de ficheiros ou garantia de alinhamento áudio à amostra.

14 testes de protocolo/backup aprovados localmente, incluindo tráfego multicast real entre instâncias no mesmo PC e conversão EPS real. Testes Electron verificam fundos diferentes, backup/reabertura, controlo remoto e pausa por perda de sinal com ponte simulada. Consultar STAGESET-ALTERACOES.md para o registo de distribuição e docs/CONTINUAR.md para configuração.

A validação com dois PCs físicos, interfaces, vários monitores e a rede do espetáculo continua necessária; distribuição identificada como pré-lançamento. Instalar a mesma versão nos PCs e transportar as músicas usando o backup completo do show. Copiar apenas o EXE não transfere a biblioteca.
