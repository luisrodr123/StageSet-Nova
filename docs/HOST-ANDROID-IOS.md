# StageSet Host 0.16 — Android, iPhone e iPad

O Host recebe letras, foco, fundos, desenhos e multimédia de uma saída do StageSet. Não necessita das músicas no dispositivo e não controla o transporte do computador. As versões web e nativas usam o mesmo servidor e podem funcionar em paralelo.

## Preparar o computador

1. Abrir StageSet → Configurações → StageSet Host.
2. Escolher a interface Wi-Fi/Ethernet da rede partilhada e carregar **Ativar recetores**.
3. Anotar o endereço e o código. A porta habitual é 4180; usar sempre o endereço efetivamente apresentado.
4. Ligar cada recetor com esse endereço, dar um nome ao dispositivo e introduzir o código. Na lista do StageSet escolher a saída: Vocalista, Banda, Público, etc.

## Android: APK de teste

Descarregar `StageSet-Host-0.16.0-Android-Test.apk` para o telemóvel ou tablet Android 8 ou posterior e abrir. Quando o Android pedir, permitir a instalação a partir do browser/gestor de ficheiros usado. Abrir **StageSet Host**, escrever o endereço do computador e carregar **Ligar ao StageSet**.

Funciona em retrato e paisagem. O ecrã mantém-se ligado durante a receção, as barras do sistema recolhem-se e o botão Casa regressa à escolha de servidor. Os controlos de letras estão no menu sobreposto. Exportar PDF abre a escolha de destino do Android (até 30 MB).

O APK é uma compilação de teste com chave de desenvolvimento, não uma publicação na Play Store. Compilações feitas noutro PC/runner podem usar outra chave; nesse caso é necessário desinstalar o Host anterior antes de instalar a nova compilação. O recetor só guarda o endereço/nome/preferências; não contém a biblioteca musical. Esta versão não envia credenciais para serviços externos.

HTTP funciona na rede local. Para HTTPS, instalar a autoridade pública do servidor no dispositivo; certificados inválidos são recusados, não ignorados. O endereço fica guardado, mas o código de sessão tem de ser introduzido após nova ligação.

## iPad/iPhone e Android: aplicação web instalável

1. Preparar HTTPS no StageSet seguindo [Host e eventos](HOST-E-EVENTOS.md#preparar-https-local). Copiar apenas o certificado público CER para o dispositivo; não copiar o PFX/chave privada.
2. Abrir `https://IP:PORTA/host.html` sem avisos de certificado, usando o endereço real do StageSet.
3. **iPad/iPhone:** Safari → Partilhar → Adicionar ao ecrã principal; manter **Abrir como aplicação** ativo quando essa opção aparecer → Adicionar. Abrir o ícone StageSet Host.
4. **Android:** Chrome → menu → Adicionar ao ecrã principal → Instalar, ou usar o botão Instalar aplicação quando aparecer.
5. Introduzir nome/código e atribuir a saída no computador.

A interface adapta-se a telemóveis/tablets, retrato/paisagem e margens de segurança. Pede para manter o ecrã acordado quando o sistema permite. A PWA conserva a interface em cache; precisa da rede e do StageSet ativo para receber as letras. O botão fullscreen depende do browser; a aplicação instalada usa o espaço disponibilizado por iOS/iPadOS/Android.

Referência Apple: [Transformar um site numa aplicação no iPad](https://support.apple.com/guide/ipad/ipad8f1f7a29/ipados).

## App nativa para iPhone e iPad

O projeto `mobile/ios` é universal (famílias iPhone e iPad), iOS/iPadOS 16 ou posterior. Inclui WKWebView, ligação HTTP/HTTPS, autorização de rede local, retrato/paisagem, botão Casa e partilha de PDF. Mantém o ecrã acordado enquanto está ligado. Não altera nem ignora a validação TLS.

Para instalar num dispositivo físico é necessária assinatura Apple; um ZIP de código ou um binário de simulador não é um IPA instalável. Esta distribuição inclui `StageSet-Host-0.16.0-iOS-Project.zip`, para preparar no Mac:

```sh
brew install xcodegen
cd mobile/ios
xcodegen generate
open StageSetHost.xcodeproj
```

Ao extrair o ZIP, `project.yml` encontra-se na pasta principal, pelo que basta executar `xcodegen generate` nessa pasta. No Xcode selecionar o target StageSetHost → Signing & Capabilities → Team (Apple ID), ligar o iPad/iPhone, escolher esse dispositivo e Run. Ativar Developer Mode no dispositivo se o Xcode o solicitar. Para TestFlight/distribuição é necessária a conta e o aprovisionamento Apple correspondentes, não incluídos neste projeto. O workflow GitHub gera e testa uma compilação de simulador, sem assinatura para dispositivos físicos.

Permitir o acesso à rede local quando o iOS pedir. Se for recusado, ativar nas Definições → Privacidade e segurança → Rede local → StageSet Host. Usar HTTP na LAN para o primeiro teste, ou HTTPS com a autoridade do servidor confiada no iPad/iPhone.

## Desenvolvimento e verificações

- Android: abrir `mobile/android` no Android Studio ou executar `mobile/android/gradlew -p mobile/android assembleDebug lintDebug` (Windows: gradlew.bat). Requer JDK 17 ou posterior compatível com Gradle 8.14 e SDK 35. O APK aparece em `mobile/android/app/build/outputs/apk/debug/`.
- iOS: XcodeGen + Xcode no Mac. `.github/workflows/host-mobile.yml` testa a ligação e receção de letras num simulador iPad e num emulador Android; `tests/mobile-server.cjs` é um servidor exclusivamente loopback para estes testes.
- Windows: `npm run dist:host` e `npm run test:host:portable` verificam o EXE real, incluindo o lançador e a janela visível.
- Consultar [alterações](../STAGESET-ALTERACOES.md) para os resultados concretos. Compilação/simuladores não substituem o ensaio em tablets físicos, Wi-Fi e certificados do espetáculo.
