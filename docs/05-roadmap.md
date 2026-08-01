# Roadmap por versões

O roadmap usa entregas verticais: cada versão deve acrescentar fluxo utilizável, testes e documentação, e não apenas tabelas ou menus.

## 0. Fundação técnica — v0.1 (esta entrega)

### Incluído

- monorepo Node.js/TypeScript;
- API NestJS e frontend Next.js;
- MySQL/Prisma e schema amplo;
- tenant, usuário proprietário, login, refresh rotativo e RBAC inicial;
- edificações, fornecedores e contratos;
- emissão, listagem, filtros, detalhe, transições e pendências de OS;
- fotos e PDFs privados associados à OS;
- dashboard inicial com mapa, backlog e execução contratual;
- relatório PDF inicial de backlog;
- esqueleto Stripe;
- seed de demonstração;
- Docker/Hostinger e documentação para Codex.

### Limite

É uma base de engenharia. Ainda não deve ser tratada como produto comercial pronto sem concluir segurança, testes, recuperação de senha, gestão integral de usuários, backups e operação de produção.

---

## MVP comercial — v1.0

### Objetivo

Permitir que um cliente piloto administre imóveis e contratos, receba demandas, controle o backlog e feche OS com evidência, SLA e relatórios confiáveis.

### Épicos

#### 1. Conta SaaS pronta para produção

- onboarding de tenant;
- convite, aceite, alteração e recuperação de senha;
- usuários administrativos, operacionais, demandantes e auditores;
- acesso provisório com expiração;
- suspensão e revogação de sessões;
- MFA opcional para administradores;
- limites do plano aplicados no servidor;
- Stripe Checkout, Portal e webhooks idempotentes;
- trial e bloqueio gradual por inadimplência.

#### 2. Edificações e georreferenciamento

- geocodificação pelo endereço;
- confirmação/ajuste do ponto no mapa;
- agrupamento de marcadores;
- importação inicial por planilha;
- gestor e contatos do imóvel.

#### 3. OS operacional completa

- categorias, especialidades, causas e ambientes;
- configuração de SLA por prioridade e calendário;
- triagem, atribuição, execução, aceite e fechamento;
- comentários, menções e histórico;
- checklist por categoria;
- evidência obrigatória configurável;
- reabertura controlada;
- notificações por e-mail e dentro do sistema;
- visão Kanban e tabela;
- pesquisa e filtros persistentes;
- exportação dos filtros em PDF/Excel.

#### 4. Contratos essenciais

- contrato, imóveis, fiscal, gestor e fornecedor;
- aditivos e prorrogações;
- reajustes e repactuações como registro;
- alertas de vencimento;
- espelho contratual em PDF;
- saldo com base em valor atual e medições registradas.

#### 5. Relatórios e gestão

- OS individual profissional;
- backlog analítico;
- OS por fornecedor, edifício, demandante e contrato;
- contratos a vencer;
- espelho e execução financeira;
- catálogo básico de KPIs operacionais, SLA e satisfação;
- agendamento simples de envio somente após e-mail estar robusto.

#### 6. Produção e confiabilidade

- armazenamento persistente e backup;
- logs estruturados e monitoramento;
- CI com lint, testes, build e migração validada;
- testes de isolamento entre tenants;
- política de privacidade, termos e registros de consentimento quando aplicável;
- plano de resposta a incidentes.

### Critérios de saída do MVP

- fluxo completo de OS testado do pedido ao fechamento;
- nenhum acesso cruzado em suíte multi-tenant;
- restauração de backup comprovada;
- cobrança em modo produção validada;
- relatórios principais conciliados com dados da tela;
- cliente piloto conclui ciclo mensal sem planilha paralela para backlog.

---

## Versão 2.0 — gestão contratual e manutenção planejada

### Objetivo

Transformar o produto em plataforma integrada de operação, planejamento e medição contratual.

### Épicos

- ativos e equipamentos por edificação;
- planos preventivos, preditivos, legais e checklists;
- geração idempotente de OS recorrentes;
- calendário de manutenção e conformidade;
- orçamento por OS, composições, BDI e importação de base SINAPI do usuário;
- exportação Excel do orçamento;
- consolidação mensal de OS em medições;
- workflow de submissão, glosa, aprovação e pagamento;
- empenhos, reforços, anulações, liquidações e pagamentos;
- subcontratações;
- penalidades por fornecedor/contrato;
- reajustes, repactuações e reequilíbrios com histórico documental;
- desempenho de fornecedores;
- PWA responsivo com captura de fotos e funcionamento degradado em campo;
- relatórios financeiros, preventivos e de conformidade.

### Critérios de saída

- manutenção preventiva gera e fecha OS sem duplicidade;
- medição pode ser rastreada até cada OS e vice-versa;
- saldo de contrato e empenho é conciliável;
- importação/exportação possui validação e relatório de erros;
- fornecedor é comparável por SLA, reincidência, qualidade e custo.

---

## Versão 3.0 — fiscalização administrativa e inteligência gerencial

### Objetivo

Atender operações complexas e contratos de mão de obra, com sustentabilidade, previsibilidade e governança corporativa/pública.

### Épicos

- postos, empregados terceirizados e alocações;
- folha, benefícios, férias, encargos e documentos mensais;
- EPI, treinamentos, exames e segurança do trabalho;
- pendências de fiscalização, glosas e matriz de conformidade;
- acesso reforçado e retenção específica para dados trabalhistas;
- leituras e baselines de energia e água por imóvel;
- KPIs amplos e construtor de indicadores;
- redução de falhas corretivas atribuíveis à manutenção preventiva;
- MTBF, MTTR, disponibilidade e criticidade de ativos;
- benchmarking entre imóveis e fornecedores;
- projeção de backlog, capacidade e risco de violação de SLA;
- detecção de recorrência e anomalias, sempre explicável e sujeita à decisão humana;
- workflows configuráveis de aprovação;
- relatórios executivos e caderno gerencial do contrato.

### Critérios de saída

- evidência administrativa mensal íntegra e auditável;
- indicadores apresentam fórmula, fonte e linha de base;
- previsões exibem incerteza e não alteram decisões automaticamente;
- segregação de acesso protege dados pessoais de terceirizados;
- portfólio corporativo é analisável por tenant, unidade, imóvel, contrato e fornecedor.

---

## Política de priorização

Cada item é classificado por:

1. risco jurídico/segurança;
2. impacto no fluxo central da OS;
3. valor para cliente pagante;
4. dependências técnicas;
5. esforço e custo operacional;
6. evidência de uso.

Um novo módulo não entra no roadmap apenas por ser tecnicamente possível. Deve existir problema, usuário, resultado esperado e critério de aceite.
