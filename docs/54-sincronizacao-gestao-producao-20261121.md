# Gestão Contratual — sincronização do código publicado, sem implantação

Referência: 21/11/2026. Atualiza o [retrato anterior à sincronização](53-gestao-contratual-publicado-20261121.md). Escopo: incorporar ao GitHub as alterações recentes da Gestão Contratual já publicadas, preservando o trabalho local, os avanços anteriores do repositório e todos os ambientes.

## Código incorporado

Foram selecionados explicitamente 19 arquivos de código e testes, restritos a `apps/api/src/modules/contract-management`, `apps/web/src/app/gestao-contratual` e `scripts/frontend/contract-management.spec.mjs`.

- Aprovação das próprias medições pelo proprietário, preservando as permissões dos demais usuários.
- Preenchimento de Apresentada e No período pelo saldo disponível.
- Retificação/exclusão de medições, aditivos e reajustes, com diário, motivo, recálculos e pagamentos preservados.
- Correção dos bloqueios por mera existência de aditivo posterior, destaque dos percentuais e recálculo do eventograma.
- Constituição com preços contratado e paradigma pré-preenchidos/editáveis e desconto linear sobre o paradigma atual.
- Revisões dos manuais de preços, correções e aprovação.
- Arquivos novos de replay, interface de correções e testes de replay/preços, incluídos junto aos arquivos já rastreados.

Não foram incorporadas alterações pendentes de Infra nem modificados arquivos de código dos demais produtos. Não foram incluídos artefatos compilados, dependências, configurações reais, backups, dados de clientes ou conteúdo de `.runtime`. O schema e os arquivos de migration não mudaram.

## Correspondência verificada com produção

A produção permanece com API `gestao-source-prices-production-20261121` e interface/manual `gestao-manual-corrections-production-20261121`.

- Os 88 arquivos do manifesto web publicado foram conferidos no servidor. A recompilação reproduziu 84 exatamente; os quatro arquivos de rota restantes diferem exclusivamente pelo identificador aleatório de build do Next.js. Não há diferença de conteúdo após normalizar esse identificador.
- Os cinco módulos alterados da API (`contract.service`, `contract.dto`, `contract.controller`, `contract-state` e `contract-replay`) reproduziram exatamente os JavaScripts e mapas publicados.
- Dos 15 artefatos compilados desses módulos, 14 coincidiram por SHA-256. A única exceção foi uma declaração `.d.ts` de `contract-state`: o mesmo tipo Decimal é referenciado por outro caminho de exportação do Prisma na geração local. Isso não altera o JavaScript executado.
- A comparação ampliada dos 30 JavaScripts contratuais encontrou 25 hashes idênticos, um arquivo com diferença somente de quebra de linha e quatro com a diferença administrativa anterior descrita abaixo.

**A sincronização dos ajustes recentes não torna toda a árvore Git uma cópia literal do servidor.** O repositório já continha a remoção do e-mail pessoal fixo de administrador, documentada na [revisão de 15/11](47-revisao-codigo-sem-implantacao-20261115.md). Essa alteração foi preservada: `contract-access`, `contract-billing.service`, `contract-saas-access` e `contract.guard` usam `GESTAO_ADMIN_EMAIL` junto a `GESTAO_ADMIN_USER_IDS`; os artefatos antigos em produção ainda têm a comparação por valor fixo. `contract-saas-audit` difere apenas na terminação das linhas.

Não se reintroduziu uma identidade pessoal no repositório público nem se alterou configuração remota para eliminar essa diferença. Uma implantação futura exige conferir privadamente a configuração administrativa, além dos controles normais de ambiente, backup e compatibilidade. Não promover esta revisão automaticamente com base apenas na correspondência das funcionalidades recentes.

Desenvolvimento também contém diferenças anteriores em módulos de identidade, origem e ambiente. Seus arquivos não foram substituídos por esta sincronização. Este registro não afirma igualdade integral entre os dois runtimes.

## Verificação local

Foi montada uma cópia isolada da revisão-base com os arquivos selecionados, sem copiar configurações reais. O cliente Prisma foi gerado somente para compilação, com URL fictícia local e sem conectar a banco.

- API: 22 suítes, 220 testes aprovados, abrangendo operações, compartilhamento, isolamento, segurança, replay, preços e ciclo contratual.
- Interface: 40 testes aprovados.
- Compilação TypeScript da API, build web de produção, lint dos componentes alterados e verificação de whitespace aprovados.
- A recompilação adicional no caminho original foi necessária para comparar os identificadores dos módulos webpack. Os diretórios de saída anteriores foram guardados e restaurados; nenhum arquivo de código original foi alterado por esse procedimento.

Esses são resultados locais. A sincronização usa `[skip ci]`; não representa nova execução de CI remota nem homologação de uma implantação.

## Gatilhos conferidos antes da atualização de main

- Repositório confirmado: `andrebaetaobraspublicas-collab/manutencao-predial`, ID `1284502303`.
- `main` inicial: `28d3b822623d4e2425407c251bb4a96321ce1305`.
- `deploy-api` preservada: `2497bcf1b6305392322e1a4930e4d81c484e0156`.
- GitHub: promoção de desenvolvimento em `disabled_manually`; promoção comercial exige execução manual; nenhum webhook de repositório cadastrado.
- hPanel da conta de desenvolvimento: frontend `gestaodepredios.com.br` mostra implantação automática desligada. A API observa `deploy-api`, e essa branch não é atualizada.
- hPanel de produção: API contratual cadastrada a partir de arquivo bootstrap, não de uma branch Git.

Nenhum controle de hospedagem ou workflow foi ativado, desativado ou reconfigurado. Não foram acionados Redeploy, migrations, seeds, reinícios ou cobranças. A operação Git usa avanço de histórico com verificação do SHA esperado, sem force push, rebase ou descarte de commits existentes.

## Preservação e continuidade

As alterações locais anteriores, incluindo arquivos novos, foram copiadas antes da seleção e inventariadas por hash. O código original, HEAD e índice locais permaneceram intactos durante a preparação. O histórico documental do PR #86 foi preservado como ancestral da atualização.

Inventários privados anteriores ao envio abrangem 29.823 arquivos em produção e 1.645 em desenvolvimento, além de apontamentos de runtime e processos. Servem à comparação posterior, sem acessar bancos de negócio. Não são exportados para o GitHub.

O diretório local continua contendo trabalho pendente de outros produtos. Não fazer reset, checkout destrutivo, limpeza ou inclusão indiscriminada desses arquivos para igualar a pasta ao remoto. A atualização do código versionado e uma implantação são operações diferentes; qualquer implantação futura exige autorização própria.
