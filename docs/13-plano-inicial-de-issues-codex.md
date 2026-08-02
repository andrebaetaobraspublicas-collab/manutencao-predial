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

- listar membros;
- convidar usuário existente ou novo;
- papéis permitidos;
- acesso provisório com expiração;
- suspensão, reativação e revogação de sessões;
- auditoria;
- telas administrativas.

### GP-011 — Senha e e-mail

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

- endereço → coordenadas;
- exibir resultado e exigir confirmação;
- ajuste do marcador;
- registrar provedor, precisão e data;
- fallback manual;
- política de cache e limites.

### GP-021 — Catálogos e SLA configurável

- categorias, especialidades, ambientes e causas;
- prioridade e SLA por tenant/contrato/categoria;
- calendário útil, feriados e jornadas;
- alertas e cálculo testado;
- migração dos SLAs fixos atuais.

### GP-022 — Comentários, checklists e evidências

- comentários cronológicos e menções;
- checklist por categoria;
- respostas imutáveis/históricas;
- regras de evidência antes/durante/depois;
- fechamento bloqueado quando requisitos não atendidos.

### GP-023 — Notificações

- eventos de OS, pendência, SLA e contrato;
- preferências do usuário;
- outbox transacional;
- e-mail e notificações internas;
- retentativa e observabilidade.

### GP-024 — Aceite, fechamento e reabertura

- solução executada e responsável pelo aceite;
- custo final e elegibilidade para medição;
- fechamento com critérios configuráveis;
- reabertura explícita, motivo e contador;
- indicador de reabertura em 30 dias.

## Marco D — relatórios e piloto

### GP-030 — Relatórios essenciais do MVP

- OS individual;
- backlog com todos os filtros;
- OS por fornecedor, edifício, demandante e contrato;
- espelho contratual;
- contratos a vencer;
- execução financeira;
- PDF e Excel/CSV conciliados;
- marca, filtros, paginação, data e assinatura/hash opcional.

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
                                      └──────────────→ GP-030 → GP-031
```
