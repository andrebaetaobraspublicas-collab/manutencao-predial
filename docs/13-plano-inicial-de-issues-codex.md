# Plano inicial de issues para continuidade no Codex

A sequência abaixo transforma a fundação v0.1 no MVP comercial sem entregar uma tarefa excessivamente ampla ao agente.

## Marco A — tornar a fundação reproduzível

### GP-001 — Baseline instalável, lockfile e migração inicial

**Resultado:** repositório instala do zero, cria banco vazio e compila.

Critérios:

- `package-lock.json` versionado;
- `prisma validate` e `prisma generate` passam;
- migração `initial_schema` revisada e versionada;
- seed idempotente;
- lint, testes e builds passam;
- Docker build e health check passam;
- documentação de qualquer ajuste de versão.

### GP-002 — Testes de isolamento multi-tenant

**Resultado:** suíte tenta acessar prédio, contrato, OS, pendência e anexo de outro tenant e sempre falha.

**Estado em 1º de agosto de 2026:** iniciado. A suíte e2e foi adicionada e integrada à CI; falta registrar uma execução aprovada contra MySQL e ampliar a matriz conforme novos recursos forem implementados.

Critérios:

- dois tenants sintéticos;
- testes 404/403 conforme política;
- listagens não vazam contagem nem metadados;
- download de anexo cruzado bloqueado;
- regressão integrada ao CI.

### GP-003 — Hardening inicial da API

- request ID e logs estruturados;
- filtro global de exceções sem vazamento de stack;
- rate limiting de login/refresh/upload;
- proteção CSRF compatível com cookies;
- limite e timeout de requisição;
- headers e política de CORS revisados.

## Marco B — conta SaaS e cobrança

### GP-010 — Gestão de usuários e convites

**Estado em 2 de agosto de 2026:** implementado na v0.6.0. Permanecem para evolução a
transferência formal de propriedade e políticas comerciais de limite de usuários.

- listar membros;
- convidar usuário existente ou novo;
- papéis permitidos;
- acesso provisório com expiração;
- suspensão, reativação e revogação de sessões;
- auditoria;
- telas administrativas.

### GP-011 — Senha e e-mail

**Estado em 2 de agosto de 2026:** implementado na v0.6.0 com provedor Resend configurável.
A validação operacional do envio em produção depende da configuração de `EMAIL_FROM` e
`RESEND_API_KEY` no ambiente de hospedagem.

- alteração autenticada;
- esquecimento e redefinição com token de uso único;
- verificação de e-mail;
- templates e provedor configurável;
- invalidação de sessões após troca sensível.

### GP-012 — Entitlements e Stripe completos

- planos do seed vinculados aos Price IDs;
- Checkout e Portal testados;
- webhooks idempotentes para sucesso, falha, alteração e cancelamento;
- limites por edifícios, usuários operacionais, OS/ano e armazenamento;
- carência e modo somente leitura;
- assinatura manual para contratos corporativos/públicos.

## Marco C — operação de manutenção

### GP-020 — Geocodificação confirmada

**Estado em 2 de agosto de 2026:** implementado na v0.7.0, com confirmação vinculada à consulta do tenant, cache e limites. A produção exige provedor explicitamente configurado; o modo manual permanece disponível.

- endereço → coordenadas;
- exibir resultado e exigir confirmação;
- ajuste do marcador;
- registrar provedor, precisão e data;
- fallback manual;
- política de cache e limites.

### GP-021 — Catálogos e SLA configurável

**Estado em 2 de agosto de 2026:** implementado na v0.7.0, incluindo precedência de políticas, calendários, feriados, turnos, snapshots por OS e provisionamento para tenants novos.

- categorias, especialidades, ambientes e causas;
- prioridade e SLA por tenant/contrato/categoria;
- calendário útil, feriados e jornadas;
- alertas e cálculo testado;
- migração dos SLAs fixos atuais.

### GP-022 — Comentários, checklists e evidências

**Estado em 2 de agosto de 2026:** implementado na v0.7.0, com comentários imutáveis, menções, respostas históricas e bloqueio de conclusão conforme snapshot da categoria.

- comentários cronológicos e menções;
- checklist por categoria;
- respostas imutáveis/históricas;
- regras de evidência antes/durante/depois;
- fechamento bloqueado quando requisitos não atendidos.

### GP-023 — Notificações

**Estado em 2 de agosto de 2026:** implementado na v0.7.0 com caixa interna/e-mail, preferências, outbox transacional, retry, métricas e scanners tenant-scoped para SLA e contratos.

- eventos de OS, pendência, SLA e contrato;
- preferências do usuário;
- outbox transacional;
- e-mail e notificações internas;
- retentativa e observabilidade.

### GP-024 — Aceite, fechamento e reabertura

**Estado em 2 de agosto de 2026:** implementado na v0.7.0 com fechamento dedicado, validação de custo/medição, concorrência protegida e reabertura formal com histórico e indicador de 30 dias.

- solução executada e responsável pelo aceite;
- custo final e elegibilidade para medição;
- fechamento com critérios configuráveis;
- reabertura explícita, motivo e contador;
- indicador de reabertura em 30 dias.

## Marco D — relatórios essenciais

### GP-030 — Relatórios essenciais do MVP

- OS individual;
- backlog com todos os filtros;
- OS por fornecedor, edifício, demandante e contrato;
- espelho contratual;
- contratos a vencer;
- execução financeira;
- PDF e Excel/CSV conciliados;
- marca, filtros, paginação, data e assinatura/hash opcional.

**Estado em 2 de agosto de 2026:** implementado na v0.8.0. O backlog compartilha o mesmo
dataset em PDF/CSV e aceita filtros por edificação, fornecedor, demandante, responsável,
categoria, contrato, prioridade, período, idade, pendência e SLA. Também foram entregues
ficha individual da OS, contratos a vencer, espelho contratual e exportação financeira.
Relatórios extensos acima de 5.000 linhas permanecem candidatos a processamento assíncrono.

## Marco E — completar o desenho operacional

Os módulos deste marco passam à frente da priorização da GP-031. A decisão completa o ciclo
operacional e financeiro da OS antes do piloto formal. A GP-031 continua obrigatória antes de
usar dados reais em produção; o adiamento de prioridade não elimina staging, backup ou ensaio de
restauração.

### GP-040 — Medições e empenhos

**Resultado:** estruturas já modeladas tornam-se um fluxo mensal conciliável, da OS elegível à
medição aprovada e aos movimentos do empenho.

Critérios:

- abrir competência de medição por contrato e período, sem sobreposição indevida;
- selecionar somente OS concluídas, aceitas e elegíveis, impedindo inclusão duplicada;
- manter rastreabilidade bidirecional entre medição, itens e OS;
- suportar rascunho, submissão, glosa, correção, aprovação, liquidação e pagamento;
- registrar empenho, reforço, anulação, liquidação e pagamento em ledger auditável;
- conciliar valor contratado, medido, glosado, liquidado, pago e saldo;
- usar `Decimal` em todos os cálculos financeiros e snapshot das bases aprovadas;
- aplicar RBAC, `tenantId`, concorrência protegida e testes de isolamento entre organizações;
- entregar telas de competência, conferência, aprovação, movimentos e relatório conciliado.

### GP-041 — Orçamento e SINAPI

**Resultado:** cada OS pode possuir orçamento versionado e aprovado, composto por serviços,
insumos, produtividade, BDI e referências SINAPI importadas pelo cliente.

Critérios:

- importar base SINAPI com competência, UF, origem, versão e relatório de inconsistências;
- cadastrar composições próprias sem sobrescrever a base oficial importada;
- calcular materiais, mão de obra, equipamentos, custos indiretos, BDI e preço final com `Decimal`;
- versionar orçamento da OS e registrar elaboração, revisão, aprovação e cancelamento;
- congelar a composição aprovada usada na execução e na futura medição;
- comparar orçado, autorizado, executado, medido, glosado e pago;
- exportar orçamento e memória de cálculo em PDF e Excel/CSV reconciliados;
- impedir leitura ou reutilização cruzada de bases, composições e preços entre tenants.

### GP-042 — Planos de manutenção preventiva

**Resultado:** planos recorrentes geram OS futuras de forma automática, idempotente e sempre
subordinada ao agregado central da ordem de serviço.

Critérios:

- cadastrar plano, ativo/local, periodicidade, janela, categoria, checklist e responsáveis;
- gerar OS recorrentes por horizonte configurável, sem duplicidade em reprocessamentos;
- suportar suspensão, reprogramação, exceção e encerramento do plano com auditoria;
- respeitar calendário, SLA, contrato vigente e indisponibilidade planejada;
- vincular toda execução, evidência, custo, aceite e falha encontrada à OS gerada;
- exibir calendário preventivo, atrasos, aderência e conversão de preventiva em corretiva;
- executar gerador com retry, métricas, trava de concorrência e testes tenant-aware.

### GP-043 — KPIs, SLAs e relatórios gerenciais

**Resultado:** gestores acompanham tendência, meta, desvio e causa dos indicadores, com
drill-down até os registros operacionais que formam cada medida.

Critérios:

- versionar definição, fórmula, fonte, unidade, direção, meta e periodicidade de cada KPI;
- calcular histórico de SLA, MTTA, MTTR, backlog, reabertura, preventiva e execução financeira;
- segmentar por período, edifício, contrato, fornecedor, categoria e prioridade;
- manter a mesma base reconciliada em cards, séries, tabelas e exportações;
- permitir drill-down da medida agregada para OS, medições e contratos autorizados;
- produzir painel executivo, tendências, comparativos e caderno gerencial em PDF/CSV;
- identificar atraso ou falha de cálculo, sem publicar medida parcial como definitiva;
- garantir isolamento entre tenants também em agregações, caches e jobs assíncronos.

## Marco F — staging, backup e piloto

### GP-031 — Staging, backup e piloto

- staging isolado;
- pipeline de release;
- backup de MySQL e anexos fora do VPS;
- restauração ensaiada;
- monitoramento e alertas;
- roteiro de aceite do cliente piloto;
- registro de incidentes e feedback.

## Ordem recomendada

```text
GP-001 → GP-002 → GP-003
          ├─ GP-010 → GP-011 → GP-012
          └─ GP-020 → GP-021 → GP-022 → GP-023 → GP-024
                                      └──────────────→ GP-030
                                                       └→ GP-040 → GP-041 → GP-042 → GP-043
                                                                                    └→ GP-031
```
