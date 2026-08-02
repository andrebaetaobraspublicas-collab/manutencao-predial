# Estado verificável da implementação — v0.11.0

Data de referência: **2 de agosto de 2026**.

## 1. Como interpretar este repositório

A fundação separa três níveis de maturidade:

- **Implementado:** há rota/serviço/interface funcional no código inicial;
- **Modelado:** o schema e a documentação já reservam a estrutura, mas o fluxo de aplicação ainda não está concluído;
- **Planejado:** requisito especificado no roadmap, sem simulação de funcionalidade pronta.

Essa classificação deve ser preservada no frontend e na comunicação comercial.

## 2. Implementado na fundação v0.1

| Área | Entrega atual |
|---|---|
| Monorepo | npm workspaces com API NestJS e frontend Next.js |
| SaaS | tenant, proprietário, trial inicial, membership, login, JWT curto, refresh rotativo e logout |
| Autorização | RBAC inicial e filtragem por tenant; demandante limitado às próprias OS |
| Edificações | cadastro, edição, arquivamento, coordenadas e visualização no mapa quando disponíveis |
| Fornecedores | cadastro, edição, áreas de atuação e contadores |
| Contratos | cadastro, edição, fornecedor, edificações, gestor/fiscal, valores e vigência |
| OS | emissão sequencial, listagem, filtros, detalhe, máquina de estados, pendências, histórico e custos básicos |
| Backlog | totais, atraso de SLA, faixas de idade e dimensões por fornecedor, imóvel e demandante |
| Evidências | upload/download privado de JPG, PNG, WebP e PDF, validação de assinatura e SHA-256 |
| Satisfação | nota, NPS score e comentário pelo demandante após conclusão |
| Dashboard | mapa, backlog, contratos ativos, execução financeira básica, satisfação e OS antigas |
| Relatório | primeiro PDF gerencial do backlog |
| Billing | Checkout, Portal e processamento inicial de webhooks Stripe |
| Operação | Dockerfiles, Compose de referência, Nginx, health check e instruções Hostinger |
| Continuidade | AGENTS.md, ADRs, contrato de API, roadmap, critérios de qualidade e handoff Codex |
| Conta SaaS v0.6 | lista de membros, convites de uso único, papéis, acesso provisório, suspensão, revogação de sessões, alteração/recuperação de senha e verificação de e-mail |
| Geocodificação v0.7 | consulta de endereço, cache, limites, confirmação do resultado, ajuste do marcador, metadados e fallback manual |
| Operação v0.7 | catálogos, checklists históricos, comentários/menções, evidências e critérios configuráveis de conclusão |
| SLA v0.7 | políticas por tenant/contrato/categoria, calendário corrido/útil, feriados, turnos, snapshots e alertas |
| Notificações v0.7 | caixa interna, preferências, e-mail, outbox transacional, retry, métricas e scanner de SLA/contratos |
| Fechamento v0.7 | solução, aceite, custo final, elegibilidade de medição e reabertura formal auditada |
| Relatórios v0.8 | backlog PDF/CSV reconciliado, ficha de OS, contratos a vencer, espelho contratual, financeiro, filtros e hash SHA-256 |
| Financeiro v0.9 | medições com glosa/workflow/versão otimista e empenhos com ledger de saldos |
| Orçamento v0.9 | catálogo SINAPI por competência/UF, composição Decimal, BDI, revisões e aprovação |
| Preventiva v0.9 | ativos, planos e reserva idempotente plano/data antes da geração de OS |
| KPIs v0.9 | sete indicadores centrais, versão de fórmula, tendência, painel e PDF/CSV |
| GP-031 v0.9 | health live/ready, workflow da candidata, backup/restore e roteiro de aceite |
| GP-044 v0.10 | painel de piloto, nove cenários, critérios automáticos, decisões auditáveis, aceite bloqueante e PDF/CSV |
| Aperfeiçoamento operacional v0.11 | mapa com estilo rotulado e fallback; fornecedores com categorias, endereço, consórcios e sanções; dossiê contratual; importador XLSX SINAPI e tabelas próprias |

## 3. Modelado, mas ainda sem fluxo completo

- planos SaaS, subscriptions e eventos de cobrança mais amplos;
- auditoria genérica para todas as entidades.

Essas tabelas não equivalem a módulos concluídos. Elas reduzem retrabalho de modelagem, mas cada fluxo precisa de API, autorização, interface, testes, relatórios e critérios de aceite próprios.

## 4. Não implementado nesta versão

- transferência formal da propriedade do tenant;
- alteração de endereço de e-mail com reconfirmação;
- MFA;
- aplicação efetiva dos limites comerciais de cada plano;
- gestão de mão de obra terceirizada;
- relatórios assíncronos para volumes superiores a 5.000 linhas;
- observabilidade e backup operados em produção;
- antimalware para anexos;
- CSRF token adicional, rate limiting e hardening final;
- suíte completa de testes de integração/e2e.

Os fluxos v0.9 são funcionais, mas ainda devem ganhar orçamento em Excel/PDF detalhado,
calendário visual preventivo, drill-down gerencial completo e jobs
agendados externos. O gerador preventivo desta entrega é disparado por endpoint protegido.

## 5. Validações executadas neste ambiente

Foram executadas verificações estáticas que não dependem do download de pacotes:

- leitura e validação sintática de todos os JSON;
- leitura dos arquivos YAML do Compose e do GitHub Actions;
- varredura sintática de **84 arquivos TypeScript/TSX** pelo compilador TypeScript;
- verificação de imports relativos existentes, excetuado o client Prisma que é gerado;
- revisão dos caminhos de runtime, migração e volumes dos Dockerfiles;
- revisão manual das invariantes centrais da OS, do isolamento por tenant e do acesso a anexos.

Em **1º de agosto de 2026**, a baseline também foi executada em ambiente com acesso ao npm:

- instalação limpa e geração de `package-lock.json`;
- `prisma validate` e `prisma generate` aprovados;
- migração `20260801195500_initial_schema` gerada e versionada;
- lint da API e do frontend aprovado;
- três testes unitários aprovados;
- builds NestJS e Next.js de produção aprovados;
- auditoria npm sem vulnerabilidades conhecidas.

Na v0.7.0, `prisma validate`, geração do client, lint da API e **59 testes unitários em 14 suítes** foram aprovados. A migration `20260802210000_operational_core` foi revisada com backfill, substituição segura de índice e rollback documentado. A aplicação da migration em MySQL limpo e os testes e2e continuam dependentes do ambiente de staging.

Na v0.8.0, os builds de produção, o lint da API/frontend e **63 testes unitários em 16 suítes**
foram aprovados. A suíte passou a cobrir os novos filtros tenant-aware, a reconciliação dos
relatórios e a degradação segura do canal de e-mail. Esta versão não exige nova migration de banco.

Na continuação da Fase A foram adicionados o smoke test público e uma suíte e2e de isolamento entre organizações. A suíte cobre edificações, fornecedores, contratos, OS, pendências e anexos; compilou localmente e foi integrada à CI, mas sua execução local depende de MySQL.

Na v0.9.0, o schema Prisma e a API foram ampliados de forma aditiva para GP-040 a GP-043.
`prisma validate`, lint de API/frontend, **68 testes unitários em 18 suítes** e os builds de
produção NestJS/Next.js foram aprovados localmente. A migration em MySQL vazio e a matriz e2e
ampliada permanecem gates da CI por não haver Docker/MySQL local; o smoke da revisão publicada
deve ser registrado após o auto-deploy.

Na v0.10.0, o GP-044 foi validado por lint, builds NestJS/Next.js e **74 testes unitários em 20
suítes**. A suíte e2e passou a verificar o isolamento das decisões do piloto e o bloqueio do aceite
prematuro; sua execução com MySQL limpo permanece gate obrigatório da CI antes da promoção.

Na v0.11.0, o importador foi validado diretamente com o XLSX SINAPI 04/2026 anexado. Para MG,
foram reconhecidos 4.304 insumos em cada regime e 10.378 composições sintéticas em cada regime,
totalizando 29.364 itens. As abas analíticas foram deliberadamente ignoradas. Lint e builds de
API/frontend foram aprovados; migration MySQL e e2e permanecem gates obrigatórios da CI.

## 6. Validações de infraestrutura que permanecem obrigatórias

Ainda **não foram afirmados como concluídos** nesta máquina, por ausência de Docker/MySQL local:

- build das imagens Docker;
- aplicação das migrações e seed em banco local limpo;
- execução local da suíte e2e multiempresa.

Sequência obrigatória no VPS/staging:

```bash
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d mysql
docker compose -f docker-compose.prod.yml run --rm api npm run prisma:deploy -w @gestaopredios/api
docker compose -f docker-compose.prod.yml run --rm api npm run prisma:seed -w @gestaopredios/api
docker compose -f docker-compose.prod.yml up -d
```

O diagnóstico histórico do incidente de publicação está em `docs/14-diagnostico-fase-a.md`. O estado público deve ser verificado novamente por smoke test em cada deploy; resultados antigos não comprovam a disponibilidade da nova versão.

A v0.8.0 foi publicada na Hostinger em **2 de agosto de 2026** e promovida para `main` pelo commit
de merge `d298c168`. API e frontend foram recriados como Web Apps conectados ao repositório
`andrebaetaobraspublicas-collab/manutencao-predial`, com auto-deploy da branch `main`. A API
respondeu `200 OK` em `/api/v1/health`; a central de relatórios foi reaberta no domínio público com
sessão administrativa e dados reais da organização. A configuração reproduzível está em
`docs/07-deploy-hostinger.md`.

## 7. Bloqueadores antes de produção

1. concluir itens de conta e segurança do MVP;
2. gerar, revisar e testar a migração inicial;
3. implementar testes multi-tenant e de autorização por objeto;
4. validar Stripe em modo teste e depois em produção;
5. provisionar os dois slots isolados de staging no Hostinger;
6. executar e registrar o primeiro backup e a restauração cronometrada de banco e anexos;
7. configurar HTTPS, monitoramento, logs, rate limiting e alertas;
8. realizar teste funcional completo com cliente piloto;
9. revisar LGPD, termos, privacidade e retenção;
10. executar revisão de segurança independente antes de armazenar documentos reais sensíveis.
