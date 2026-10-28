# StageSet — continuidade do projeto

- Trabalhar neste repositório, separado do projeto REA adjacente.
- Responder em português. Concluir o trabalho autorizado sem pedir repetidamente permissão.
- Atualizar sempre STAGESET-ALTERACOES.md: alterações concretas, versão, testes executados e limitações reais. Nunca marcar testes de hardware como aprovados sem os realizar.
- Cada conjunto de funcionalidades avança a versão menor: `npm run bump`. Manter package.json, package-lock.json, interface e cache alinhados.
- Preservar IndexedDB, localStorage, biblioteca e shows do utilizador. Usar o perfil temporário de `npm run test:smoke` para testes.
- Antes de distribuir: `npm run check`, `npm test`, `npm run test:smoke`, `npm run dist:win:all`, `node scripts/checksums.mjs`.
- Binários em dist/ não entram no Git. Publicar em Releases ou usar os artefactos do workflow Windows.
- Não incluir músicas, stems, ficheiros de shows, perfis, credenciais ou tokens no código/repositórios.
- Principal: https://github.com/luisrodr123/StageSet-Nova. Backup: https://github.com/luisrodr123/StageSet-0.8. O nome do backup regista a versão de origem; ambos podem receber versões seguintes.
- O Git guarda código. Para transferir uma biblioteca entre PCs/origens usar o backup de show da aplicação.
- Ver docs/CONTINUAR.md para arquitetura, procedimentos e validação pendente.
