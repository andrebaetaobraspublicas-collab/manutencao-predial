# Gestão Contratual — preparação reproduzível, sem implantação

Referência: 21/11/2026. Complementa a [sincronização do código publicado](54-sincronizacao-gestao-producao-20261121.md) e a comparação integral posterior. Esta entrega prepara arquivos no GitHub; não declara uma nova publicação em desenvolvimento ou produção.

## Escopo

Adicionada uma [receita exclusiva](../scripts/gestao-production/README.md), sem alterar fontes de negócio, schema, migrations, workflows, dependências gerais ou os demais produtos. A base é `e02f725ddf2459461f4dc03cfc7e4ea2180fe5b2`, preservando as correções recentes de medições, aditivos, reajustes, eventograma, constituição/preços, desconto linear e manuais.

- Pacote e lock da API contratual separados, derivados da produção auditada; não modificam o lock do monorepo.
- Inicializador explícito de `main-gestao.js`, com configuração privada externa e identificação do commit pelo manifesto.
- Preflight offline para requisitos administrativos, domínio, bancos distintos, armazenamento privado e flags exclusivas.
- Parâmetros de compilação web e seleção das rotas contratuais/autenticação, com recursos RSC, marca, cabeçalhos e redirecionamentos.
- Geração local de artefatos, hashes, verificação de integridade e testes de empacotamento.
- Referência sanitizada da auditoria e orientação de baseline, sem operações de escrita em banco.

## Pendências que permanecem fora do GitHub

O reconhecimento de administrador exige **e-mail e ID simultaneamente**. A configuração auditada não contém `GESTAO_ADMIN_EMAIL`; ela deverá ser preenchida privadamente e conferida antes de qualquer ativação deste pacote. Os quatro módulos continuam usando configuração, sem reintrodução de identidade pessoal no repositório público. Não basta possuir o ID configurado para satisfazer esses quatro predicados administrativos.

O runtime auditado continua `gestao-source-prices-production-20261121`, com manual/interface `gestao-manual-corrections-production-20261121`. Seu marcador `RELEASE_SHA` antigo e o vínculo de bibliotecas com a release de 15/11 permanecem inalterados. O novo procedimento permite substituí-los futuramente por um pacote identificado e independente, mas não realiza a substituição.

As estruturas do banco conferidas já existem. A ausência de histórico formal de migrações não autoriza reaplicar scripts. Não há migração ou seed nesta entrega. A integridade apurada na comparação (30 contratos, 309 ações, 13 arquivos privados e 9 anexos) é uma observação datada, não uma quantidade a impor sobre atividade futura.

## Entrega e validação

Preparação em checkout isolado a partir da revisão atual do GitHub, mantendo intacta a pasta de trabalho anterior e seus arquivos pendentes. A entrega usa uma branch de preparação e PR em rascunho, com `[skip ci]`. Não atualiza `main`/`deploy-api`, não modifica configurações de Actions/Hostinger e não habilita auto-merge. Não reutilizar uma futura aprovação deste PR como autorização automática de implantação.

Testes e resultados finais são registrados no PR. Os testes de configuração/empacotamento usam diretórios e identidades fictícios, sem conexão com serviços, envio de e-mail, cobrança ou edição de contratos. A validação da dependência no Windows não substitui o pacote Linux. O manual operacional distingue explicitamente o que foi preparado do que ainda depende de autorização de implantação.
