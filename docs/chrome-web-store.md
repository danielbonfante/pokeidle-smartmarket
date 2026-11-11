# Chrome Web Store — textos e respostas do formulário

Tudo o que o painel de desenvolvedor da Chrome Web Store pede, pronto para copiar e colar. Os nomes dos campos podem variar um pouco no painel. As respostas precisam continuar batendo com o [`PRIVACY.md`](../PRIVACY.md): se a extensão mudar o que lê, guarda ou envia, atualize os dois.

## Pacote

O ZIP enviado à loja leva só o que a extensão usa, com o `manifest.json` na raiz. No terminal, na pasta do projeto:

```powershell
tar.exe -a -c -f ..\pokeidle-smartmarket.zip manifest.json src popup icons LICENSE
```

Use o `tar` (vem com o Windows 10/11), não o `Compress-Archive`: o do Windows PowerShell 5.1 grava os caminhos com `\` (`src\ws.js`), e a loja pode não reconhecer as pastas. A cada versão nova, suba o `version` do `manifest.json` antes de empacotar.

O resumo da loja vem do campo `description` do `manifest.json` (no máximo 132 caracteres):

> Quanto vale seu Pokémon no Mercado do pokeidle.io: preço em Gemas e Coins na ficha, selos de pechincha e ajuda para anunciar.

## Aba "Página na loja" (Store listing)

**Idioma:** Português (Brasil)

**Categoria:** Jogos, se o painel oferecer; senão, Ferramentas.

**Descrição:**

```text
Quanto vale o seu Pokémon no Mercado da Comunidade do pokeidle.io? A Pokeidle Smart Market responde dentro do próprio jogo, em Gemas e em Coins, com base nas vendas reais do Mercado.

NA FICHA DO POKÉMON
• Vender rápido, Preço justo e Esperar, nas duas moedas.
• Quanto você recebe depois da comissão do Mercado.
• Confiança da estimativa: alta, média ou baixa.
• Botão Precificar: as vendas parecidas numa barra, a tabela das vendas que mais pesaram no preço (comparando nível, Potência, IV, Qualidade e Nota com o seu) e quantas vezes a estimativa acertou nas últimas vendas da espécie.

NO MERCADO
• Cada anúncio de Pokémon ganha um selo: pechincha, no preço ou acima do justo, com a porcentagem em relação ao Preço justo.

NA HORA DE ANUNCIAR
• Um painel ao lado da tela de anúncio com os preços, os anúncios parecidos à venda agora e os que já foram vendidos.
• Um botão "usar" preenche o campo de preço. Quem publica é sempre você.

COMO O PREÇO É CALCULADO
A extensão consulta o histórico de vendas do Mercado (o mesmo da Tabela de preços do jogo) e compara o seu Pokémon com as vendas da mesma espécie nos últimos 30 dias. As mais parecidas pesam mais: principalmente a Nota, que já resume IV, Qualidade e Potência; depois o nível, TM AoE, Z-Move e Mega. Vendas recentes contam mais que as antigas.

SÓ LEITURA E SEM COLETA DE DADOS
• Não compra, não vende, não anuncia e não automatiza nenhuma ação no jogo.
• Consulta o jogo devagar, como uma pessoa: uma consulta por vez, com pausa entre elas, e para sozinha se o servidor pedir calma.
• Não tem servidor próprio e não envia seus dados para lugar nenhum. As vendas ficam guardadas só no seu navegador, sem o nick de nenhum jogador.
• Pelo ícone da extensão você liga e desliga cada parte e limpa o cache.

Código aberto (GPL-3.0): github.com/danielbonfante/pokeidle-smartmarket

Projeto independente, sem relação com os criadores do pokeidle.io. Os preços são estimativas e não garantem nada.

Created by dan_the_treiner.
```

**Imagens:**

- Ícone da loja: `icons/icone-128.png` (128×128).
- Capturas de tela: 5, em 1280×800, na pasta `capturas-loja/` (fora do git, porque mostram dados da conta): `1-ficha.png`, `2-precificar.png`, `3-vitrine.png`, `4-anuncio.png` (painel no Novo anúncio do Blastoise, com o "usar 190 M" já aplicado: o "VOCÊ RECEBE" do jogo bate com o líq) e `5-popup.png`. Há também `extra-editar-anuncio.png` (o painel no Editar), para trocar por alguma se quiser. Foram tiradas no jogo com as colunas laterais (chat, conta) e os nicks dos vendedores borrados; a do popup é a página de teste sobre a ficha escurecida. Para refazer: viewport do jogo com proporção 1,6, recorte e redimensionamento para 1280×800.
- Bloco promocional pequeno (440×280): o painel pode pedir. Pode ser o ícone com o nome sobre o fundo vinho da extensão.

**Site oficial / página inicial:** `https://github.com/danielbonfante/pokeidle-smartmarket`

**URL de suporte:** `https://github.com/danielbonfante/pokeidle-smartmarket/issues`

**Conteúdo adulto:** não.

## Aba "Práticas de privacidade" (Privacy practices)

**Descrição da finalidade única** (Single purpose):

```text
Mostrar, dentro do jogo pokeidle.io, o preço estimado dos Pokémon no Mercado da Comunidade, calculado a partir do histórico de vendas do próprio jogo.
```

**Justificativa da permissão `storage`:**

```text
Guarda as preferências do usuário feitas no popup da extensão: ligar ou desligar o quadro de preço na ficha, os selos na vitrine do Mercado e o painel na tela de anúncio. São só três valores verdadeiro/falso, guardados no próprio navegador.
```

**Justificativa da permissão de host (`https://pokeidle.io/*`):**

```text
A extensão só funciona no jogo pokeidle.io. Ela precisa rodar nas páginas do jogo para: (1) mostrar o preço na ficha do Pokémon, os selos nos anúncios do Mercado e o painel na tela de anúncio; (2) ler as mensagens que o jogo recebe pela própria conexão (WebSocket), para reconhecer os Pokémon na tela; (3) consultar o histórico de vendas do Mercado pela mesma conexão do jogo, no mesmo formato que a Tabela de preços do jogo usa, num ritmo limitado (uma consulta por vez, no máximo 12 por minuto). Nada é enviado a outros sites.
```

**Código remoto:** Não, não uso código remoto. Todo o JavaScript está no pacote; a extensão não baixa nem executa código de fora.

**Uso de dados** (quais tipos de dados de usuário a extensão coleta):

Recomendação: **não marcar nenhum tipo.** A extensão não tem servidor e não transmite dados para fora do navegador; as vendas do Mercado que ela guarda são dados públicos do jogo, sem nicks, e ficam só no computador do usuário. Isso é o que diz o `PRIVACY.md`.

Se a revisão da loja entender que guardar dados do site localmente conta como coleta, a resposta mais próxima é marcar **Conteúdo do site** (Website content), com a explicação: *"Histórico de vendas do Mercado do jogo (preço, data e dados do Pokémon vendido, sem nicks), guardado só no navegador do usuário para calcular os preços. Nada é enviado para fora do navegador."*

**Declarações** (marcar as três):

- Não vendo nem transfiro dados de usuários para terceiros, fora dos casos de uso aprovados.
- Não uso nem transfiro dados de usuários para finalidades não relacionadas à finalidade única do item.
- Não uso nem transfiro dados de usuários para determinar crédito ou para fins de empréstimo.

**URL da política de privacidade:** `https://github.com/danielbonfante/pokeidle-smartmarket/blob/main/PRIVACY.md`

## Instruções para a revisão (se o painel pedir)

```text
Para ver a extensão funcionando é preciso uma conta gratuita no pokeidle.io (https://pokeidle.io). Depois de entrar no jogo:
1. Abra a ficha de qualquer Pokémon (por exemplo, pelo botão "Ver ficha" da equipe): aparece o quadro "Preço estimado" e o botão "Precificar".
2. Abra o Mercado da Comunidade e clique numa espécie: cada anúncio ganha um selo (pechincha / no preço / acima do justo).
3. Em "+ Anunciar" → "Um pokemon", escolha um Pokémon: aparece o painel de preços ao lado. Não é preciso publicar nada.
4. Clique no ícone da extensão para ligar/desligar cada parte e ver o cache.
Na primeira vez, a extensão leva até 1 minuto para baixar o histórico de uma espécie.
```

## Aba "Distribuição"

- **Preço:** gratuito.
- **Visibilidade:** pública. Se preferir testar antes com alguns jogadores, use "não listada" (só quem tem o link encontra) e mude para pública depois.
- **Regiões:** todas.
