# Estado das anotações — StageSet 0.13.0

Este registo consolida os pedidos recebidos nesta conversa. O código das funções abaixo existe; a coluna de verificação distingue testes automáticos de ensaios físicos ainda necessários.

| Pedido | Implementação / verificação |
| --- | --- |
| Menu transparente em todos os ecrãs de letras | Palco, saídas independentes e mosaico; opacidade e recolha automática guardadas por saída. |
| Ecrã inteiro sem bordas | Painel ocupa o monitor atual; letras, desenho e controlos sobrepostos, editor dentro do fullscreen. Vários monitores físicos por validar. |
| Editar letras no próprio ecrã | Editor local por saída, música fixada ao abrir o rascunho, bloqueio de conflitos e proteção Studio. |
| Anotações tipo Paint | Caneta, cores, espessura, borracha, anular e limpar; gravação por música/saída e backup. |
| Puxar letra sem alterar tempo principal | Roda, arrasto e botões consultam apenas esse ecrã; regresso ao foco atual após 5 segundos sem interação. |
| IP local automático e atribuição remota Master/Slave | Interfaces detetadas, modo Disponível e transferência de comando; testes de protocolo e interface aprovados. |
| Luz azul Master e laranja Slave | Só acendem com ligação confirmada; perda de sinal apaga a indicação. |
| Fundo independente por monitor de letras | Cor sólida ou imagem, preencher/inteira/repetir e escurecimento. Janelas, mosaico, reabertura e backup testados. EPS convertido por Ghostscript externo no desktop. |
| Detetar computadores StageSet e selecionar Slaves | Canal de controlo UDP multicast autenticado, seleção explícita e pausa por perda de sinal. Dois pares locais e interface testados; ensaio em dois PCs físicos pendente. Não é descoberta MIDI convencional. |
| Entrar no Studio apenas com palavra-passe | Confirmada no teste de interface; confirmação apenas na criação. |
| Gerar e ler SMPTE/LTC e MTC | Codecs e PCM verificados automaticamente; interfaces e latência exigem ensaio físico. |
| Criar dez portas IP MIDI com dezasseis canais | UDP multicast implementado no desktop, teste real de dez sockets e dezasseis canais. Não instala driver virtual Windows nem implementa RTP-MIDI. Dois PCs por validar. |
| Menus de entradas/saídas MIDI | Seletores físicos e IP MIDI, seleção de porta por canal e pedais. Hardware por validar. |
| Selecionar saídas de vídeo | Configurações: palco principal, mosaico e cada janela; restaura preferências. Vários monitores físicos por validar. |
| Selecionar saídas e fonte no mosaico | Visibilidade persistente, remoção de saídas e tamanho por música verificados na interface. |
| Fonte em tempo real em cada janela | Controlos na própria janela e nas Configurações; gravação por música/saída verificada. |
| Learn com botão direito, MIDI e teclado | Mapeamentos coexistentes para botões fixos e gerados; teste de aprendizagem de teclado; MIDI físico por validar. |
| Nome da música sempre visível e ordem das ações | Biblioteca com título em linha própria e duração, seleção MIDI, adicionar e restantes ações. |
| Intervalo com Next/Stop | Guardado nas preferências e no backup do show. |
| Guardar/carregar setlist | Exportação/importação de setlist; backup completo para transportar também os ficheiros. |
| Nova música vazia ou stems e MIDI/KAR agrupados | Criação vazia e MIDI sem áudio verificadas na interface; ZIP de stems é expandido antes de escolher a faixa principal. |
| Letras independentes por saída e exportação TXT/MID/KAR | Grava todos os rascunhos editados; exportação com nome da janela, tempos e BPM verificada. |
| Importar BPM de MIDI/KAR | Importação de BPM isolada, de letras ou de faixa associada; persistência verificada. |
| Nome e campos de eventos conforme o tipo MIDI | CC, PC, Note e Song Select verificados com atribuições por música. |
| Mais de quatro pedais | Adição dinâmica; cinco pedais verificados na interface. |
| Scroll e foco no editor | Destaque e acompanhamento temporal; preserva timestamps de MIDI/KAR ao abrir o editor. |
| Editor com todas as funções visíveis | Testado a 1273×930, 1024×768 e 800×650; painéis menores podem necessitar de scroll. |
| Nomes editáveis e números no mixer | Nomes numerados com persistência verificada. |
| Timestamps opcionais no mosaico | Ocultos por defeito, opção persistente e incluída no backup. |
| Ocultar músicas já tocadas | Filtro aplicado às marcas da setlist atual, preservadas no backup. |
| Guardar anotações, incrementar versão e ficheiro de alterações | Pedidos consolidados aqui e histórico em STAGESET-ALTERACOES.md. Só são registadas anotações recebidas nesta conversa. |
| Executável portátil, instalador e continuidade noutro PC | Scripts de compilação, workflow Windows, dois repositórios e guia CONTINUAR.md. Teste de instalação/início/desinstalação executado apenas no runner descartável do GitHub. |

Os limites técnicos de sincronismo, drivers e protocolos estão descritos em CONTINUAR.md. Não considerar a existência de uma função como certificação para uso em palco sem ensaio com o equipamento real.
