# v0.20.0 — GP-045 Homologação automatizada e refinamento analítico

## Objetivo

A v0.20.0 transforma a homologação em um gate reproduzível antes de cada promoção ao Hostinger.
Os testes usam MySQL 8.4 efêmero no GitHub Actions; portanto, concorrência, exclusões e massas de
carga não afetam o banco público utilizado no piloto.

## Matriz automatizada

| Camada | Evidência obrigatória |
|---|---|
| Saúde e segurança | readiness, autenticação, autorização, Helmet e validação estrita de DTOs |
| Multiempresa | leitura, alteração, anexos, contratos, SINAPI, finanças, KPIs e piloto isolados por organização |
| Cadastros | edifícios, fornecedores, fiscais e registros contratuais com criação, edição e exclusão lógica |
| Dossiê contratual | ajustes, subcontratações, sanções, equipe, garantias, apostilas, recebimentos, diários e comunicações |
| Arquivos | nome UTF-8, assinatura, integridade binária, download privado e exclusão |
| Operação | ciclo de OS, orçamento final, fechamento, medição, liquidação e pagamento |
| Integridade financeira | teto contratual, transferência de empenho, concorrência, medição e conciliação |
| Preventiva | geração recorrente idempotente, sem duplicação de OS |
| Volume | 10.000 OS, 1.000 contratos, 10.000 medições e 15.000 itens SINAPI |
| Desempenho | pesquisa de OS/SINAPI abaixo de 5 s e painel conciliado abaixo de 15 s no executor de CI |

## Correção analítica

A edição de um empenho agora bloqueia os contratos de origem e destino em ordem determinística.
Quando o empenho é transferido, o valor integral proposto é confrontado com o teto do contrato de
destino. Isso fecha a possibilidade de mover um empenho para um contrato já comprometido acima do
seu valor vigente e evita corrida entre duas emissões simultâneas.

## Evidências do pipeline

O workflow `CI` produz o artefato `gp-045-homologation-<SHA>` por 30 dias, contendo:

- resultado JSON dos testes unitários;
- resultado JSON da suíte de integração, concorrência e volume;
- auditoria de dependências;
- relatório Markdown consolidado, também publicado no resumo do GitHub Actions.

O workflow `Promote Hostinger runtime` somente inicia quando a CI de `main` termina com sucesso.
O módulo **Piloto e homologação** exibe a release do gate automático que protege a versão publicada.

## Risco de dependência controlado

Em 23/08/2026, o Prisma 7.9.1 (versão mais recente compatível) ainda depende de
`deepmerge-ts` 7.1.5, afetado por `GHSA-ggr8-5vv4-36mx`. A dependência é usada pela ferramenta de
configuração/build do Prisma e não recebe objetos de usuários em execução. O gate rejeita qualquer
outra vulnerabilidade alta/crítica e a exceção expira em **31/10/2026**, exigindo nova revisão.
