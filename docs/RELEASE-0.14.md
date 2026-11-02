StageSet 0.14.0 para Windows x64, com recetor web para os cinco sistemas.

- Anotações Paint acompanham as linhas; exportação PDF por janela com letra e desenhos.
- Botão direito nos editores → Inserir MIDI, imagem, vídeo ou DMX; campos próprios, tempos e dimensões. Os anexos seguem no backup completo do show.
- Saída SL04 por adaptador USB de rede/Art-Net, quatro universos, transições e blackout.
- StageSet Host: endereço/código, presença e seleção de saída por recetor. Letras, foco, fundo, desenhos e multimédia, sem controlo remoto do transporte. HTTPS/PWA com certificado confiado.

**Portable** executa sem instalação; **Setup** instala no Windows. Ver STAGESET-ALTERACOES.md, SHA256SUMS.txt e HOST-E-EVENTOS.md anexos. O script host-certificate.ps1 prepara certificados locais para o Host; não instala confiança automaticamente.

Validação: 24 testes automáticos, sintaxe/IDs/versão, suite Electron com perfil isolado, PDF multipágina e HTTPS local. A suite verifica imagem/vídeo, backup, atribuição/revogação do recetor, vista móvel e disparo DMX pela ponte desktop. O workflow Windows verifica instalação, arranque e desinstalação num runner descartável.

Versão de teste sem assinatura digital. SL04 física e instalação em cinco sistemas reais ainda não ensaiadas. PDF rasterizado; vídeos sem áudio; o Host exige ligação ativa. A SL04 recebe ArtDmx unicast, sem funções proprietárias hahan/RDM. O guia distingue o recetor Host do controlo StageSet Master/Slave.
