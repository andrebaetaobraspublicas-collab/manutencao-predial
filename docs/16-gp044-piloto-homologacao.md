# GP-044 — Piloto operacional e homologação

Data de referência: **2 de agosto de 2026**. Release: **v0.10.0**.

## 1. Objetivo e limite do ciclo

O GP-044 transforma o roteiro operacional em uma homologação rastreável dentro do próprio
sistema. O responsável acompanha critérios objetivos, registra o parecer e a evidência de cada
cenário e emite o aceite final sem manter uma planilha paralela.

O staging, item 3 do plano anterior, está fora deste ciclo por decisão expressa do proprietário.
O domínio público e seu banco serão usados temporariamente para testes com dados sintéticos, pois
ainda não existem dados úteis de produção. Essa exceção não autoriza dados pessoais sensíveis nem
uso comercial e deve ser encerrada antes da entrada dos primeiros usuários reais.

## 2. Cenários de homologação

| Código | Cenário | Critério automático mínimo |
|---|---|---|
| `MASTER_DATA` | Base cadastral | equipe, prédio, fornecedor, contrato, categoria e SLA ativos |
| `WORK_ORDER_CYCLE` | Ciclo completo da OS | OS fechada com aceite, solução, custo, comentário, checklist e anexo |
| `FINANCIAL_RECONCILIATION` | Medição e empenho | empenho ativo e medição paga com item de OS |
| `BUDGET_SINAPI` | Orçamento/SINAPI | catálogo com itens e orçamento aprovado positivo |
| `PREVENTIVE_MAINTENANCE` | Preventiva | plano ativo e geração concluída com OS |
| `KPI_REPORTS` | KPIs e relatórios | ao menos uma medição de KPI calculada |
| `ACCESS_SECURITY` | Acessos e arquivos | ao menos dois papéis ativos; conferência humana complementar |
| `BACKUP_RECOVERY` | Backup e restauração | validação exclusivamente humana com hash/referência |
| `USER_ACCEPTANCE` | Aceite de usuários | validação exclusivamente humana com referência do aceite |

Uma checagem automática aprovada não substitui o parecer. O responsável deve executar o roteiro,
conferir o resultado e registrar `PASSED`, `PENDING`, `BLOCKED` ou `FAILED`, com justificativa e
uma referência auditável como número de OS, relatório, chamado ou hash.

## 3. Fluxo e autorização

1. Abrir **Piloto e homologação** no menu gerencial.
2. Corrigir os cenários cuja verificação automática esteja pendente.
3. Selecionar cada cenário, abrir o módulo relacionado e executar a conferência humana.
4. Registrar decisão, parecer e referência de evidência.
5. Exportar PDF/CSV para conferência e reunião de aceite.
6. Aprovar ou rejeitar o piloto formalmente.

`OWNER`, `ADMIN` e `MANAGER` podem registrar decisões e aceite. `CONTRACT_MANAGER`,
`CONTRACT_INSPECTOR` e `AUDITOR` consultam e exportam. Todas as consultas e gravações são
filtradas pelo `tenantId` da sessão.

## 4. Regras de aceite

- o aceite `APPROVED` é bloqueado se existir checagem automática `PENDING`;
- todos os nove cenários devem possuir decisão humana `PASSED`;
- rejeição formal pode ser registrada a qualquer momento com justificativa;
- uma aprovação anterior é exibida como `REGRESSION_DETECTED` se os dados deixarem de satisfazer
  os critérios automáticos;
- novas decisões não apagam as anteriores: a interface mostra a mais recente e a auditoria
  preserva toda a sequência;
- CSV e PDF são derivados da mesma visão e cada exportação registra o ator e a data.

## 5. Persistência e implantação

O GP-044 não cria tabela nova. Decisões usam `AuditLog` com `entityType = PilotHomologation` e o
código do cenário; o aceite usa `PilotAcceptance`. Por isso não há migration nem seed na v0.10.0.
O deploy segue `main` → CI → promoção automática da API pela branch técnica `deploy-api` →
verificação pública do SHA e do banco na rota de readiness.

## 6. Evidências mínimas do ciclo

- relatório PDF e CSV da matriz final;
- referências das OS, medições, empenhos, orçamentos, planos e KPIs usados;
- prova de perfis distintos e acesso privado;
- hash do backup e resultado da restauração já ensaiada;
- saída do smoke público e SHA da release;
- nome/data do responsável e parecer final.

Nunca registrar senha, cookie, token, segredo ou documento pessoal no campo de evidência.

## 7. Incidentes, rollback e encerramento

Falhas devem ser registradas como `FAILED` ou `BLOCKED`, contendo impacto, evidência e referência
do chamado. A correção exige novo teste e nova decisão append-only. Como não há alteração de
schema, o rollback técnico consiste em reverter a release; os registros de auditoria permanecem.

O piloto termina somente com aceite formal aprovado e sem regressão. Depois disso, antes de dados
reais, devem ser retomados os gates adiados: staging isolado, política operacional de backups,
monitoramento/alertas, hardening e revisão de LGPD e segurança.
