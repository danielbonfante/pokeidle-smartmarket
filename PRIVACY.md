# Política de privacidade — Smart Market

*Última atualização: 12 de novembro de 2026*

A Smart Market é uma extensão do Chrome que mostra preços estimados dentro do jogo [pokeidle.io](https://pokeidle.io). Ela foi feita para funcionar inteira no seu navegador: **não tem servidor próprio, não envia seus dados para ninguém e não guarda o nick de nenhum jogador.**

Esta política explica o que a extensão lê, o que guarda, onde guarda e como apagar.

## Resumo

| | |
|---|---|
| Coleta dados pessoais? | Não. |
| Envia dados para fora do seu navegador? | Não. A única comunicação é com o próprio pokeidle.io, pela conexão que o jogo já abriu. |
| Guarda nick de jogadores? | Não. Vendedor, comprador, quem capturou e apelidos são descartados antes de guardar. |
| Vende ou compartilha dados? | Não. |
| Tem anúncios, rastreamento ou analytics? | Não. |

## O que a extensão lê

A extensão só funciona nas páginas de `https://pokeidle.io/`. Nelas, ela:

- **Lê as mensagens que o jogo recebe pela conexão dele** (WebSocket), para reconhecer os Pokémon que aparecem na tela (os seus, os do Mercado e os que outros jogadores mostram no chat) e as respostas às consultas de preço.
- **Lê a tela do jogo** (a ficha do Pokémon, a vitrine do Mercado e a tela de anúncio) para saber onde mostrar o preço.

O conteúdo das mensagens do chat não é guardado. A extensão só verifica se o servidor pediu para ir mais devagar.

## O que a extensão envia

Só consultas ao próprio pokeidle.io, as mesmas que a interface do jogo faz:

- `market.historicoGlobal`: o histórico de vendas do Mercado (a "Tabela de preços"), filtrado por Pokémon, moeda e espécie;
- `market.listar`: uma página de anúncios de uma espécie, quando você abre o painel da tela de anúncio.

Essas consultas saem pela conexão que o jogo já abriu, num ritmo limitado (uma por vez, com pausa entre elas, no máximo 12 por minuto) e só quando você abre uma ficha, uma vitrine focada ou o painel de anúncio. **Nenhum dado é enviado a qualquer outro endereço.**

## O que a extensão guarda, e onde

Tudo fica **no seu computador**, no próprio navegador:

1. **Cache de vendas do Mercado** (IndexedDB do site pokeidle.io, banco `pokeidle-preco`). Para cada venda: o número da venda, a data, a moeda, o preço e os dados do Pokémon vendido (espécie, nome da espécie, nível, Nota, IV somado, qualidade, potência, shiny, TM AoE, Z-Move, mega e refino). Também guarda, para cada busca feita, até onde o histórico já foi baixado e quando, e, para cada espécie, se a busca usa só o nome ou a família (com a data da escolha). As vendas com mais de 30 dias, que já não entram no preço, são apagadas sozinhas uma vez por dia. **Não guarda nicks de vendedor, comprador ou de quem capturou o Pokémon.**
2. **Estado do freio** (localStorage do site pokeidle.io, chave `pism-freio`): se o servidor pediu para ir mais devagar, o intervalo atual entre consultas e até quando vale a pausa. Expira em 1 hora.
3. **Suas preferências** (armazenamento da extensão, `chrome.storage.local`, chave `config`): se o quadro de preço, os selos da vitrine e o painel de anúncio estão ligados ou desligados.

Enquanto a aba do jogo está aberta, a extensão também mantém **na memória** (e não em disco) os dados de preço dos Pokémon que passaram pela tela e dos anúncios vistos na vitrine, sem nicks. Isso some quando você fecha ou recarrega a aba.

## Permissões que a extensão pede

- **Acesso a `https://pokeidle.io/*`**: para mostrar os preços dentro do jogo e fazer as consultas de preço pela conexão do jogo.
- **`storage`**: para guardar as suas preferências (as três chaves do popup).

## Como apagar os dados

- **Cache de vendas:** clique no ícone da extensão, com a aba do jogo aberta, e use **Limpar cache…**.
- **Preferências:** são apagadas quando você remove a extensão.
- **Tudo de uma vez:** como o cache de vendas e o freio ficam no armazenamento do site pokeidle.io, **remover a extensão não apaga esses dois**. Para apagar, use **Limpar cache…** antes de remover, ou apague os dados do site em `chrome://settings/content/all` → `pokeidle.io` → **Excluir dados**. Atenção: apagar os dados do site também pode desconectar você do jogo.

## Crianças

A extensão não coleta dados pessoais de ninguém, de nenhuma idade.

## Link de apoio (Pix)

O popup da extensão tem o botão **Apoie o dev!**, que mostra um QR code e um link para [livepix.gg/danthetreiner](https://livepix.gg/danthetreiner), a página de doação do autor na Livepix. O QR é uma imagem dentro da extensão: abrir o popup não acessa nenhum site. Só se você escanear o QR ou clicar no link é que a página da Livepix abre, e o que acontece lá (inclusive o pagamento) segue as regras e a política de privacidade da Livepix. A extensão não envia nenhum dado para a Livepix e não sabe se alguém doou. Doar não libera nada: a extensão é a mesma para todos.

## Relação com o pokeidle.io

A Smart Market é um projeto independente, sem relação com os criadores do pokeidle.io. Os dados do jogo que passam pelo seu navegador estão sujeitos também às regras e à política de privacidade do próprio jogo.

## Mudanças nesta política

Se a extensão passar a tratar algum dado de outra forma, esta página será atualizada antes, com a nova data no topo. O histórico de mudanças fica no repositório do projeto.

## Contato

Dúvidas ou pedidos: abra uma *issue* em [github.com/danielbonfante/pokeidle-smartmarket/issues](https://github.com/danielbonfante/pokeidle-smartmarket/issues).

O código da extensão é público no GitHub: qualquer pessoa pode conferir que ela faz o que esta política diz.
