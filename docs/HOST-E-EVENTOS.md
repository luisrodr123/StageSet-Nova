# StageSet 0.14 — letras, eventos e recetores

## Anotações e PDF

Em cada janela de letras ou painel do mosaico, abrir **☰ Ecrã → Desenhar**. Os novos traços ficam associados às linhas, por música e saída. Acompanham a roda do rato, o foco e o tamanho da letra. São guardados ao largar o rato e incluídos no backup do show. As notas da versão 0.13, que eram fixas no ecrã, são preservadas: posicionar a letra correta e usar **Fixar notas antigas às linhas visíveis** uma vez.

**Exportar PDF** guarda todas as linhas dessa saída e os desenhos em páginas A4, com o nome da música e da janela. Inclui imagens e o fotograma disponível dos vídeos. O PDF é visual, rasterizado; não contém texto pesquisável, vídeo reproduzível nem eventos MIDI/DMX executáveis. Notas antigas ainda não fixadas são projetadas sobre as linhas atualmente visíveis apenas para essa exportação.

## Inserir eventos

Entrar no Studio. No editor principal ou em **Editar letras** de uma janela, clicar com o botão direito dentro do texto e escolher **Inserir evento**. Os campos acompanham o tipo escolhido:

- **MIDI:** Control Change, Program Change, Note On, Note Off, Pitch Bend, Channel Pressure, Song Select, Start, Stop ou Continue. Canal 1–16; notas/programas/CC 0–127; Pitch Bend 0–16383. Usa as saídas do mixer MIDI. Inserir Note Off para terminar uma nota sustentada.
- **Imagem:** PNG, JPG ou WebP; importar e indicar largura/altura em píxeis. O tamanho adapta-se à largura disponível da janela.
- **Vídeo:** MP4, WebM ou Ogg compatível com o browser. Largura/altura próprias; reproduz sem som e segue a posição da música. Não fornece genlock nem sincronismo de vídeo à amostra.
- **DMX:** universo Art-Net, canal 1–512, valor 0–255 e duração da transição em milissegundos. Requer a saída DMX ativa no desktop.

O tempo é expresso em segundos a partir do início da música. MIDI/DMX são emitidos uma vez quando a reprodução atravessa esse tempo, independentemente de quantas janelas estiverem abertas. Saltar diretamente para depois de um evento não reconstrói o estado anterior dos equipamentos. Imagens/vídeos fazem parte das linhas consultáveis. Guardar as letras conserva o marcador `[stage:…]`; apagar o marcador de todas as saídas deixa o evento inativo. Guardar o **show completo** para transportar os dados multimédia e definições: TXT/MID/KAR isolados não transportam estes novos anexos.

Limites: 256 eventos por música, ficheiro até 8 MB, até 20 milhões de caracteres de dados multimédia guardados por música. Vídeos compridos devem ser reduzidos antes de importar.

## SL04 por USB

A descrição do produto indica que a SL04 cria uma **placa de rede USB** no Windows/Linux; os pacotes Art-Net podem seguir por essa placa. Na ligação LAN também recebe Art-Net. Esta versão não implementa comandos privados hahan, RDM, reprodução interna de efeitos ou alteração da configuração da caixa.

1. Ligar a SL04 e confirmar no Windows o adaptador USB de rede e o respetivo IPv4. Configurar a placa na mesma sub-rede da caixa, conforme o manual da SL04. O StageSet não altera endereços do Windows nem da caixa.
2. Abrir as Configurações do StageSet → **DMX · SL04 por USB/rede**. Escolher essa interface e o IP real da SL04 (o campo começa em `2.0.0.44`; confirmar no equipamento).
3. Na configuração web da SL04, selecionar Art-Net/DMX de saída e fazer corresponder os universos às portas físicas. O StageSet usa endereçamento de universo a partir de zero.
4. Carregar **Ligar saída DMX**, inserir um evento e reproduzir a música. São enviados até quatro universos de 512 canais, a 25 Hz, por UDP 6454. O indicador confirma a abertura da saída local; não é uma confirmação de receção da caixa.
5. **Blackout** coloca a zero os universos usados nesta sessão. **Parar envio** fecha a saída; o comportamento de retenção/perda de sinal depende da configuração da caixa. Os canais ainda não programados de um universo começam em zero.

Referências: [página indicada pelo utilizador, hahan](http://hahan123.com/mybox/super-all-in-one-box/), [descrição técnica SL04](https://dmx-usb.com/sl04-box-dmx-controller/), [especificação Art-Net](https://art-net.org.uk/downloads/art-net.pdf). Art-Net™ é uma marca de Artistic Licence. O código envia ArtDmx unicast para o IP indicado; não implementa descoberta ArtPoll nem certificação Art-Net completa. Ensaios automáticos confirmam os pacotes, porta de origem/destino, valores e transições em loopback; falta ensaio na SL04 física.

## StageSet Host nos cinco sistemas

O StageSet desktop Windows fornece o servidor. O **recetor web** abre em Android, iOS/iPadOS, Linux, macOS ou Windows com browser moderno. A instalação depende do suporte do browser: Chromium/Chrome/Edge e Safari onde disponível. Não são cinco aplicações nativas separadas.

1. Ligar o PC StageSet e os recetores à mesma rede. Nas Configurações → **StageSet Host**, escolher a placa Ethernet/Wi-Fi alcançável pelos recetores e **Ativar recetores**. A porta começa em 4180. Permitir o StageSet na firewall da rede privada se necessário.
2. Abrir o endereço apresentado, terminado em `/host.html`, em cada dispositivo. Indicar um nome e o código de sessão apresentado no StageSet.
3. O dispositivo aparece automaticamente na lista depois dessa ligação. Escolher **Vocalista**, **Banda**, **Público** ou outra saída criada. Não é descoberta autónoma de browsers ainda não ligados: a primeira entrada exige endereço e código.
4. Recebe letra, foco, fundo, anotações e multimédia da saída escolhida. O menu permite fullscreen quando suportado, consulta local com retorno após cinco segundos e PDF. Desde a 0.17, permite editar letras em modo Studio e desenhar; grava na música/saída atribuídas no computador principal. Não controla transporte nem envia MIDI/DMX. Permite ajustar tamanho por botões/pinça e consultar a setlist lateral.
5. **Sem saída** retira a letra desse recetor. **Desligar** termina todos. Pode definir uma palavra-passe persistente e autorizar dispositivos recordados; sem palavra-passe usa código de sessão. As autorizações ficam no perfil local do computador principal, fora do projeto. Máximo de 16 recetores simultâneos. As atualizações são enviadas assim que disponíveis, com pedidos pendentes e deltas; a espera fixa de meio segundo foi removida. O Host oferece compensação automática e ajuste manual de −1000 a +1000 ms para letras temporizadas.

HTTP permite experimentar a receção. Para instalar a PWA é necessário HTTPS com um certificado confiado no dispositivo. O cache guarda apenas a aplicação; não permite seguir o espetáculo sem ligação ao StageSet. Não expor a porta do servidor à Internet.

### Preparar HTTPS local

No PC Windows, a partir do repositório (ou descarregando `host-certificate.ps1` junto desta versão), executar no PowerShell:

```powershell
./scripts/host-certificate.ps1 -Address '192.168.1.20'
```

Substituir pelo IPv4 real da placa escolhida para os recetores. Introduzir uma palavra-passe para proteger a chave. O script cria `dist/host-certificate/StageSet-Host.pfx` e `StageSet-Host-CA.cer`; recusa substituir ficheiros existentes. Cria certificados temporários no armazenamento pessoal e remove-os no fim, sem instalar autoridades de confiança.

No StageSet, escolher o PFX e indicar a sua palavra-passe antes de ativar o servidor. Copiar **apenas o CER público** para os recetores e instalá-lo como autoridade de confiança seguindo os mecanismos do sistema/browser. No iOS, pode ser necessário ativar explicitamente a confiança total depois de instalar o perfil. Manter o PFX e a palavra-passe apenas no PC StageSet. Também é possível usar um PFX emitido pela infraestrutura de certificados da organização.

Abrir o endereço HTTPS **sem aviso de certificado** e instalar pelo menu do browser. No Safari móvel, usar Partilhar → Adicionar ao ecrã principal. A aplicação standalone ocupa o espaço permitido pelo sistema; fullscreen via botão depende da API disponível. Se o IP mudar ou o certificado expirar, gerar outro para o endereço novo. O nome `stageset.local` no certificado não cria por si só um registo DNS.

Referência: [requisitos de instalação de PWA](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable). Verificados localmente: recetor a 390×844, presença/atribuição/revogação, isolamento, HTTPS com cadeia de confiança e IP SAN, manifesto e ícones. A instalação em cinco dispositivos físicos e as permissões particulares de cada browser ainda precisam de ensaio.
