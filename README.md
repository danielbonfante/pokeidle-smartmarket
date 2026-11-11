# Pokeidle Smart Market

Extensão do Chrome que mostra, dentro da ficha do Pokémon no [PokeIdle](https://pokeidle.io), o preço estimado em **Gemas** e em **Coins**, calculado a partir das vendas do mercado da comunidade (RMT).

*Created by dan_the_treiner.* Ideia inspirada no [Precificador de Pokémon](https://briaoale.github.io/precificador-pokemon/) do briao. Esta extensão não usa os dados nem o código dele: coleta as vendas direto do jogo e tem um motor próprio.

Projeto independente, sem relação com os criadores do PokeIdle. Os preços são estimativas e não garantem nada.

## Instalar (modo desenvolvedor)

1. Baixe o projeto (`git clone https://github.com/danielbonfante/pokeidle-smartmarket.git` ou o ZIP do GitHub) e extraia a pasta.
2. Abra `chrome://extensions` e ligue o **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e escolha a pasta do projeto (a que tem o `manifest.json`).
4. Abra ou recarregue o pokeidle.io.

Quando você mudar algum arquivo, clique em ↻ na extensão e recarregue o jogo.

## Como usar

Abra a ficha de qualquer Pokémon. Abaixo dos botões aparece o quadro **Preço estimado**:

- **Vender rápido / Preço justo / Esperar** em 💎 Gemas e 🪙 Coins.
- Embaixo de cada moeda, **líq**: quanto você recebe se vender por aquele preço, já descontada a comissão do RMT (15% em Coins; em Gemas, 13% até 500, 10% até 5.000 e 7,5% acima).
- A **confiança** (alta, média ou baixa), que leva em conta quantas vendas parecidas existem e quanto os preços variam.
- O botão **vendas** mostra as vendas que mais pesaram na conta.

Na primeira vez que você abre uma espécie, a extensão busca o histórico dela (uma espécie muito vendida leva perto de 1 minuto por moeda; o preço vai aparecendo enquanto carrega). Depois disso fica em cache e a atualização é de 1 ou 2 páginas.

## Como funciona

- **Dados:** a Tabela de preços do RMT conversa com o servidor pelo WebSocket do jogo (`market.historicoGlobal`). A extensão faz a mesma consulta, filtrando por Pokémon, moeda e nome da espécie, pela conexão que o jogo já abriu. O servidor devolve até ~40 páginas de 30 vendas; com o filtro por espécie isso cobre de ~1 dia (espécies muito vendidas, como Furious Scizor) a 30 dias (espécies raras).
- **Ritmo:** uma consulta por vez, com 1,5 s entre elas e no máximo 12 por minuto, e a mesma busca no máximo a cada 10 minutos. Se o jogo pedir para ir mais devagar, a extensão para de consultar por 3 minutos. Só busca quando você abre uma ficha ou uma vitrine de uma espécie só (ou só shiny / só P5); nunca varre o mercado inteiro. Ela também conta as mensagens que outras extensões mandam pela mesma conexão e cede a vez quando a conexão já está ocupada. Evite ter duas abas do jogo abertas: cada uma faz as próprias consultas.
- **Cache:** as vendas ficam no IndexedDB do navegador, pelo id da venda, **sem nicks** de vendedor, comprador ou de quem capturou. O cache cresce com o uso e passa dos 30 dias do jogo.
- **Motor (`src/motor.js`):** pega as vendas da mesma espécie, mesma moeda e mesmo status shiny nos últimos 30 dias. Cada venda recebe um peso pela semelhança de Nota, nível e potência, por ter ou não AoE / Z-Move / Mega, e pela idade (meia-vida de 5 dias). Os três preços são os quartis ponderados (25%, 50%, 75%) em escala logarítmica.

## Backtest (11/11/2026)

Cada venda precificada só com as vendas anteriores a ela; "acerto" = Preço justo a até 25% do valor pago.

| Dados | Gemas | Coins |
|---|---|---|
| Furious Scizor, 2.399 vendas (~33 h) | 75% (erro mediano 15%) | 81% (erro mediano 11%) |
| Planilha exportada, 588 vendas de 119 espécies (85 min) | 69% (mediana simples: 57%) | 85% (mediana simples: 76%) |

Para repetir com uma planilha exportada pelo jogo: `node tests/backtest-csv.js planilha.csv`.

## Caçador de pechinchas

No Mercado da Comunidade, cada anúncio de Pokémon ganha um selo logo abaixo do preço:

- **pechincha −30%**, em verde: o preço está na faixa "Vender rápido" ou abaixo dela;
- **no preço**: o preço está entre "Vender rápido" e "Esperar";
- **acima do justo +40%**, em vermelho: o preço está acima de "Esperar".

A porcentagem compara o anúncio com o Preço justo. Borda tracejada quer dizer confiança baixa ou estimativa pela Nota (≈). Passe o mouse no selo para ver a faixa completa e a base do cálculo. Quando ainda não há vendas guardadas de uma espécie, o selo mostra **"sem preço justo · buscar"**: um clique busca as vendas dela.

O selo usa as vendas já guardadas. A extensão só busca vendas novas quando a vitrine mostra uma espécie só, ou só shiny / só P5. Na primeira vez com "Só shiny" ela baixa até 15 páginas (menos de 1 minuto, em segundo plano), e depois só o que for novo.

## Precificar

No quadro de preço da ficha, o botão **Precificar** abre a análise completa:

- o **Preço justo** em destaque e quanto você recebe;
- uma **barra** com as vendas parecidas como pontos (maiores = mais parecidas com o seu) e as marcas Vender rápido / Justo / Esperar;
- a **confiança medida**: a extensão refaz a conta para as últimas vendas da espécie e diz quantas vezes o Preço justo acertou (a até 25% do valor pago);
- um **aviso de dois grupos** quando as vendas se dividem em preços bem diferentes, com o que diferencia cada grupo (nível, Nota, AoE, Z-Move, refino).

## Painel na tela de anúncio

Ao anunciar um Pokémon (Mercado → "+ Anunciar" → "Um pokemon" → escolher o Pokémon), aparece ao lado da tela de preço um painel de tenda com:

- **Vender rápido / Preço justo / Esperar** na moeda escolhida, com o **líq** (o que você recebe) e um botão **"usar"** em cada um, que preenche o campo de preço. Quem publica é sempre você.
- À esquerda, uma **ficha resumida** do seu Pokémon (tipos, Potência, Qualidade, IV somado, Nota com a faixa e Poder), com a borda roxa da extensão.
- As abas **À venda** (anúncios abertos agora da mesma espécie) e **Vendidos** (vendas dos últimos 30 dias), com os mais parecidos com o seu primeiro.

Clicou em Coins ou Gemas na tela do jogo, o painel troca junto. Para a aba À venda a extensão pede uma página de anúncios daquela espécie e, ao fechar, devolve a vitrine que você estava vendo.

## Popup (ícone da extensão)

Clique no ícone da extensão na barra do Chrome:

- **Na tela do jogo:** liga e desliga o quadro de preço da ficha, os selos da vitrine e o painel do Novo anúncio. Vale na hora, em todas as abas do jogo.
- **Cache de vendas:** quantas vendas e espécies estão guardadas e o período. **Limpar cache…** pede confirmação; as vendas voltam aos poucos, no ritmo de sempre.
- **Freio:** se as consultas estão no ritmo normal, mais devagar (depois de o jogo pedir calma) ou pausadas, e quanto da conexão do jogo foi usada no último minuto, somando o jogo e outras extensões.

Cache e freio só aparecem com a aba do pokeidle.io aberta e ativa.

## Limitações conhecidas

- Os dados completos (AoE, Z-Move, shiny) do **seu** Pokémon vêm das mensagens que o jogo recebe pelo WebSocket. Se a extensão carregar depois do jogo, recarregue a página. Sem esses dados ela lê o que a ficha mostra e avisa que AoE, Z-Move e shiny não foram detectados.
- O protocolo é interno do jogo e pode mudar em qualquer atualização.
- Refino não entra no preço.

## Contribuir

O código é aberto e contribuições são bem-vindas. Leia o [CONTRIBUTING.md](CONTRIBUTING.md) antes: a extensão é só leitura, não guarda nicks e segue um ritmo de consultas que não pode ser acelerado. Mudanças entram por pull request, com revisão do mantenedor.

## Licença

[GPL-3.0](LICENSE). Você pode usar, estudar, mudar e redistribuir; quem distribuir uma versão modificada precisa mantê-la sob a mesma licença, com o código aberto e os créditos.
