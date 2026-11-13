# Smart Market

Extensão do Chrome para quem joga [pokeidle.io](https://pokeidle.io): mostra **quanto vale o seu Pokémon no Mercado da Comunidade (RMT)**, em Gemas e Coins, calculado a partir das vendas reais do próprio jogo.

- Na **ficha do Pokémon**: Vender rápido, Preço justo e Esperar, e quanto você recebe depois da comissão.
- No **Mercado**: um selo em cada anúncio dizendo se está com **desconto**, **no preço** ou **acima do justo**.
- Na hora de **anunciar** (ou editar um anúncio): os preços e os anúncios parecidos ao lado da tela, com um botão para preencher o preço.

**Só leitura:** a extensão não compra, não vende, não anuncia e não guarda o nick de ninguém. Quem decide e clica é sempre você.

*Created by dan_the_treiner.* Projeto independente, sem relação com os criadores do pokeidle.io. Os preços são estimativas e não garantem nada.

## Instalar

**Pela Chrome Web Store (recomendado):** [Smart Market na Chrome Web Store](https://chromewebstore.google.com/detail/smart-market/lhfeijlnlbglakplddjgbaopgcdfkcmm). Clique em **Usar no Chrome**; as atualizações chegam sozinhas.

**Pelo código (modo desenvolvedor):**

1. Baixe o projeto: botão verde **Code → Download ZIP** nesta página, e extraia a pasta.
2. Abra `chrome://extensions` e ligue o **Modo do desenvolvedor**, no canto superior direito.
3. Clique em **Carregar sem compactação** e escolha a pasta extraída (a que tem o arquivo `manifest.json`).
4. Abra ou recarregue o pokeidle.io.

Para atualizar, baixe o ZIP de novo, substitua a pasta e clique em ↻ na extensão em `chrome://extensions`.

## Como usar

### Preço na ficha

Abra a ficha de qualquer Pokémon. Aparece o quadro **Preço estimado**:

- **Vender rápido**: 1 em cada 4 vendas parecidas saiu por menos que isso. Anunciar aqui tende a vender logo.
- **Preço justo**: o meio das vendas parecidas.
- **Esperar**: só 1 em cada 4 saiu por mais. Dá para pedir se você puder esperar um comprador.
- **líq**: quanto você recebe vendendo por aquele preço, já descontada a comissão do RMT (15% em Coins; em Gemas, 13% até 500, 10% até 5.000 e 7,5% acima).
- **Confiança** (alta, média ou baixa): quantas vendas parecidas existem e quanto os preços variam.

Na primeira vez que você abre uma espécie, a extensão busca o histórico dela. Enquanto busca, o quadro mostra "carregando" com a página em que está, e o preço só aparece quando a busca termina, já com todas as vendas. As consultas seguem um ritmo lento de propósito, então uma espécie muito vendida pode levar uns 4 minutos para baixar tudo, Gemas e Coins juntas. Depois disso fica guardado e a atualização leva poucos segundos. Vendas com mais de 30 dias, que já não entram no preço, são apagadas sozinhas uma vez por dia.

Shiny só se vende em Gemas, então a linha de Coins mostra "só em Gemas". O preço sai **só das vendas da mesma espécie** (e, para shiny, só das vendas shiny dela). Sem vendas parecidas da espécie nos últimos 30 dias, o quadro diz isso ("sem vendas parecidas", "sem vendas shiny") em vez de inventar um número: cada espécie tem a sua procura, e o preço de uma não serve para outra. Só pode ir ao Mercado Pokémon com Nv 50+ e Nota 3,5+ (shiny, P5 e lendário podem com qualquer nível e Nota). Abaixo da Nota mínima, o quadro avisa que ele não tem preço de Mercado; abaixo do Nv 50, mostra o preço para quando ele chegar lá.

### Precificar

O botão **Precificar**, no quadro da ficha, abre a análise completa:

- uma **barra** com as vendas parecidas como pontos (maiores = mais parecidas com o seu);
- a tabela das **vendas que mais pesaram no preço**, com o seu Pokémon na primeira linha para comparar nível, Potência, IV, Qualidade e Nota;
- a **confiança medida**: a extensão refaz a conta para as últimas vendas da espécie e diz quantas vezes acertou;
- um **aviso** quando as vendas se dividem em dois grupos de preço bem diferentes: o **preço de cada grupo**, qual deles mais se parece com o seu (★), o que os diferencia, e a dica de vender perto do grupo barato para vender logo ou perto do caro se puder esperar.

**O que pesa no preço:** principalmente a **Nota**, que já resume IV, Qualidade e Potência; depois o **nível**. TM AoE, Z-Move e Mega também contam, e vendas recentes pesam mais que as antigas.

### Selos no Mercado

Na vitrine do Mercado da Comunidade, cada anúncio de Pokémon ganha um selo abaixo do preço:

- **desconto −30%**, em verde: preço na faixa "Vender rápido" ou abaixo;
- **no preço**: entre "Vender rápido" e "Esperar";
- **acima do justo +40%**, em vermelho: acima de "Esperar".

A porcentagem compara o anúncio com o Preço justo; o rótulo compara com a faixa entre Vender rápido e Esperar. Por isso nem sempre andam juntos: quando as vendas parecidas custam quase o mesmo, a faixa é estreita e −9% já ganha o selo de desconto; quando os preços variam muito, a faixa é larga e −31% ainda fica "no preço". A segunda linha do selo mostra o justo e essa faixa (por exemplo, "justo 130 · faixa 115–140"). Borda tracejada quer dizer confiança baixa ou estimativa; a estimativa pela Nota (shiny ou P5 de espécie pouco vendida) também ganha a palavra **estimado** no selo. Passe o mouse no selo para ver os detalhes.

Os selos usam as vendas já guardadas. Vendas novas são buscadas quando a vitrine mostra uma espécie só (clicando na espécie ou buscando pelo nome) ou só shiny / só P5. Se a espécie não tem vendas guardadas, ou tem poucas, o selo oferece **buscar**: um clique busca as vendas dela, no mesmo ritmo de sempre.

### Painel na tela de anúncio

Ao anunciar um Pokémon (Mercado → **+ Anunciar** → **Um pokemon** → escolher o Pokémon), aparece um painel ao lado da tela de preço:

- **Vender rápido / Preço justo / Esperar** na moeda escolhida, com o **líq** e um botão **usar** que preenche o campo de preço. Quem publica é sempre você.
- Dentro do palco do jogo, ao lado do Pokémon, uma **ficha resumida**: tipos, Potência, Qualidade, IV, Nota e Poder.
- Dá para **arrastar** o painel pela barra de cima, para ver o que está atrás (a janela Precificar também).
- As abas **À venda** (anúncios abertos agora da mesma espécie) e **Vendidos** (vendas dos últimos 30 dias), com os mais parecidos com o seu primeiro.

Trocou a moeda na tela do jogo, o painel troca junto.

O mesmo painel aparece ao **editar** um anúncio de Pokémon (Mercado → **Meus anúncios** → **Editar**). Ali a aba À venda mostra os anúncios que você já viu na vitrine, e, se o jogo ainda não deixar mudar o preço (30 min depois da última mudança), os botões "usar" ficam desativados.

### Gemas em dinheiro

Valores em Gemas assustam quem não sabe quanto valem. A extensão mostra o equivalente em **dólar (US$)** e, se você quiser, em **real (R$)**, pela cotação do próprio jogo (telas **Depósito** e **Saque** do Mercado):

- na **vitrine**, quanto custa comprar o anúncio (cotação de compra, 0,0100 USDT por Gema em 13/11/2026);
- na **ficha**, no **painel de anúncio** e na **Precificar**, quanto você recebe sacando o líquido (cotação de saque, 0,0090).

Se o jogo mudar a cotação, a extensão percebe quando você abre a tela de Depósito ou de Saque. O real usa a cotação que você digita no ícone da extensão (padrão R$ 5,50): ela não consulta nenhum site de câmbio.

### Ícone da extensão

Clique no ícone da extensão (o diamante rosa com etiqueta) na barra do Chrome:

- **liga e desliga** o quadro da ficha, os selos do Mercado e o painel de anúncio (vale na hora, em todas as abas do jogo);
- escolhe se as **Gemas aparecem em dinheiro**: nada, dólar, ou dólar e real (com a cotação do real que você digitar);
- mostra quantas vendas estão guardadas e permite **limpar o cache**;
- mostra o **freio**: se as consultas estão no ritmo normal, mais devagar ou pausadas porque o jogo pediu calma;
- tem o botão **Apoie o dev!**, com o QR do Pix.

## Perguntas frequentes

**É seguro? Posso tomar ban?**
A extensão só lê. Ela faz as mesmas consultas que a **Tabela de preços** do Mercado faz quando você a abre, pela mesma conexão do jogo, e num ritmo de pessoa: uma consulta por vez, com pausa entre elas, e só quando você abre uma ficha ou uma vitrine. Se o servidor pedir para ir mais devagar, ela para por alguns minutos. Mesmo assim, ela não é oficial: use por sua conta.

**Por que o preço do meu Pokémon é igual ao de outro com Potência ou IV diferente?**
Porque o mercado paga pela **Nota**, que já junta IV, Qualidade e Potência. Testando com milhares de vendas, IV e Qualidade separados da Nota não melhoraram o acerto. Abra o **Precificar** para ver as vendas que definiram o preço.

**Por que aparece "sem vendas"?**
A espécie teve poucas vendas parecidas nos últimos 30 dias. Lendários e míticos quase nunca são vendidos, então costumam ficar sem preço.

**E se o jogo tirar ou mudar a Tabela de preços?**
A extensão depende do histórico de vendas do Mercado. Se ele parar de responder, ela percebe depois de três tentativas seguidas, para de consultar e avisa no quadro e no ícone. Enquanto isso, os preços usam as vendas já guardadas, que não são apagadas, e uma tentativa por hora confere se a Tabela voltou.

**Uso duas abas do jogo. Tem problema?**
Evite. Cada aba faz as próprias consultas, e duas abas juntas chegam mais perto do limite do servidor.

**A extensão manda meus dados para algum lugar?**
Não. Tudo fica no seu navegador, e nenhum nick é guardado. Veja a [política de privacidade](PRIVACY.md).

## Limitações

- Os dados completos do **seu** Pokémon (AoE, Z-Move, shiny) vêm das mensagens que o jogo recebe. Se a extensão carregar depois do jogo, recarregue a página; até lá, o quadro avisa que esses dados não foram detectados.
- A extensão depende do funcionamento interno do jogo, que pode mudar em qualquer atualização.
- O refino entra só pela Nota, não sozinho.

## Privacidade

A extensão não tem servidor, não envia dados para fora do seu navegador e não guarda nick de jogadores. Detalhes na [política de privacidade](PRIVACY.md).

## Para desenvolvedores

**Como funciona.** O jogo conversa com o servidor por um WebSocket. A extensão pede o histórico de vendas do Mercado (`market.historicoGlobal`) pela conexão que o jogo já abriu, guarda as vendas no IndexedDB sem nicks e calcula o preço em [`src/motor.js`](src/motor.js): pega as vendas da mesma espécie, moeda e status shiny dos últimos 30 dias, dá um peso a cada uma pela semelhança (Nota, nível, potência, AoE / Z-Move / Mega) e pela idade (meia-vida de 5 dias), e usa os quartis ponderados (25%, 50%, 75%) em escala logarítmica. O selo da vitrine compara o preço do anúncio com esses quartis ([`src/vitrine.js`](src/vitrine.js)). O [`CLAUDE.md`](CLAUDE.md) descreve o protocolo do jogo, a arquitetura e as decisões tomadas.

**Backtest** (11/11/2026; cada venda precificada só com as anteriores; acerto = Preço justo a até 25% do valor pago):

| Dados | Gemas | Coins |
|---|---|---|
| Furious Scizor, 2.399 vendas (~33 h) | 75% (erro mediano 15%) | 81% (erro mediano 11%) |
| Planilha exportada, 588 vendas de 119 espécies (85 min) | 69% (mediana simples: 57%) | 85% (mediana simples: 76%) |

Para repetir com uma planilha exportada pelo jogo: `node tests/backtest-csv.js planilha.csv`. Testes: `node --test tests/*.test.js`.

**Contribuir.** Contribuições são bem-vindas (veja a [licença](#licença)). Leia o [CONTRIBUTING.md](CONTRIBUTING.md) antes: a extensão é só leitura, não guarda nicks e segue um ritmo de consultas que não pode ser acelerado. Mudanças entram por pull request, com revisão do mantenedor.

**Créditos.** Ideia inspirada no [Precificador de Pokémon](https://briaoale.github.io/precificador-pokemon/) do briao. Esta extensão não usa os dados nem o código dele: coleta as vendas direto do jogo e tem um motor próprio.

## Apoie o dev

A extensão é gratuita e continua igual para todo mundo. Se ela te ajudou a vender ou comprar melhor, dá para apoiar com um Pix de valor livre pela Livepix: [livepix.gg/danthetreiner](https://livepix.gg/danthetreiner). O botão **Apoie o dev!** no ícone da extensão mostra o QR. Obrigado!

## Licença

**Código visível, todos os direitos reservados** ([LICENSE](LICENSE)). O código fica público para qualquer pessoa conferir que a extensão só lê e não guarda nicks. Você pode ler, usar de graça, mudar no seu próprio computador para uso pessoal e mandar contribuições. **Não pode** publicar cópias ou versões modificadas (em lojas de extensões ou em qualquer outro lugar), vender, oferecer uma versão "PRO" nem usar o código em outro projeto sem autorização por escrito.

As versões até a 1.1.0 foram publicadas sob a GPL-3.0; a licença atual vale a partir de 12/11/2026.
