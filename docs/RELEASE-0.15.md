StageSet 0.15.0 — Windows x64, com Host portátil separado.

- Novo show com pasta própria, cópia de segurança do show anterior, cópias dos ficheiros importados, gravação automática e ZIP para transportar para outro PC.
- Limpar setlist e limpar biblioteca, preservando os ficheiros originais.
- Paint acompanha a letra; exportação PDF por saída com anotações.
- Inserir MIDI, imagem, vídeo e DMX nos editores; SL04 através da interface USB de rede/Art-Net.
- Recetor web com código e saída independente, HTTP/HTTPS e instalação PWA; novo Host portátil Windows para testar em paralelo.

Downloads: **StageSet Setup** instala; **StageSet Portable** executa sem instalar; **StageSet Host Portable** é apenas o recetor de letras e requer um StageSet principal ativo na rede.

Ver STAGESET-ALTERACOES.md para verificações e limites, SHOWS-E-HOST-PORTATIL.md para pastas/ZIP/recetor e HOST-E-EVENTOS.md para eventos/SL04/HTTPS. SHA256SUMS.txt permite verificar os três EXE.

Validação: 26 testes automáticos, suite Electron com perfil isolado, ligação real do aplicativo Host, HTTPS local e PDF de três páginas revisto. Sem assinatura digital. Falta ensaio na SL04 física, em vários monitores e nos cinco sistemas reais. ZIP limitado a 2 GB; PDF rasterizado; o Host exige ligação ativa. Não houve publicação separada da 0.14; as suas funções estão incluídas aqui.
