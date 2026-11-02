StageSet 0.16.0 — correção do Host Windows e recetores para Android/iPad.

- **Host Windows Portable:** corrigido o arranque que terminava sem janela. O EXE real é agora testado com janela visível, ligação, letras e encerramento.
- **Android-Test.apk:** aplicação nativa de teste para telemóveis e tablets Android 8+, com endereço, código, apresentação e gravação de PDF. Instalar diretamente no dispositivo.
- **iOS-Project.zip:** projeto nativo universal iPhone/iPad (iOS/iPadOS 16+) para compilar/assinar no Xcode. **Não é um IPA instalável**; a instalação física depende da assinatura Apple.
- **Web instalável:** interface adaptada a iPad, iPhone e Android, instruções por plataforma, nome recordado e pedido para manter o ecrã ligado. Instalar pelo Safari/Chrome usando HTTPS confiado.

O recetor recebe a saída atribuída pelo computador StageSet e não necessita da biblioteca áudio local. Pode usar HTTP na app nativa; HTTPS continua a exigir certificado confiado. Para testar no iPad sem assinatura Apple, usar a versão web instalável.

Downloads StageSet Setup/Portable são a aplicação principal Windows. Host Portable e Android Test são recetores separados. Ver **HOST-ANDROID-IOS.md** para instalação e **STAGESET-ALTERACOES.md** para testes e limites. Os ficheiros não têm assinatura comercial Windows; o APK usa uma chave de desenvolvimento. Aparelhos físicos e rede do espetáculo por ensaiar.
