# Especificação do produto

## 1. Identificação

- **Produto:** Gestão de Prédios
- **Domínio de produção:** `www.gestaodepredios.com.br`
- **Categoria:** SaaS multiempresa de gestão de manutenção predial e contratos
- **Idioma inicial:** português do Brasil
- **Moeda e fuso padrão:** BRL e `America/Sao_Paulo`

## 2. Visão

O Gestão de Prédios deve ser a fonte única de informação operacional, contratual e gerencial para portfólios de imóveis. A ordem de serviço é o agregado central: toda demanda relevante deve poder ser rastreada desde a abertura até o fechamento, com edificação, demandante, fornecedor, contrato, pendências, prazos, custos, evidências e avaliação do usuário.

## 3. Princípios do produto

1. **A OS é o centro:** não criar módulos desconectados do fluxo operacional.
2. **Rastreabilidade:** mudanças de status, documentos, custos e aprovações devem deixar histórico.
3. **Visão analítica:** qualquer backlog deve ser segmentável por edificação, fornecedor, contrato, demandante, prioridade, idade e SLA.
4. **Uma organização não vê outra:** isolamento multi-tenant obrigatório.
5. **Módulos reais, não cenográficos:** itens ainda não implementados devem aparecer como roadmap, e não como telas falsas.
6. **Configuração antes de customização:** regras de SLA, status, indicadores e relatórios devem evoluir para parâmetros por tenant.
7. **Responsabilidade humana:** recomendações automáticas não substituem a validação de fiscais, gestores ou responsáveis técnicos.

## 4. Personas

| Persona | Objetivo principal | Ações típicas |
|---|---|---|
| Proprietário do tenant | Administrar a assinatura e a organização | planos, usuários, limites e segurança |
| Administrador | Configurar e supervisionar o sistema | perfis, cadastros, indicadores e auditoria |
| Gestor de contratos | Controlar prazo, saldo e alterações contratuais | contratos, aditivos, ajustes, prorrogações e medições |
| Fiscal de contrato | Verificar execução e conformidade | OS, evidências, medições, penalidades e terceirizados |
| Operador de manutenção | Planejar e executar serviços | triagem, atribuição, execução, checklists e anexos |
| Demandante | Solicitar e acompanhar atendimento | abrir OS, fornecer informações e avaliar atendimento |
| Auditor/consulta | Examinar trilhas e relatórios | leitura, exportação e auditoria sem alteração operacional |

## 5. Escopo funcional consolidado

### 5.1 SaaS e usuários

- organizações isoladas por `tenant_id`;
- cadastro do tenant e do proprietário;
- perfis e permissões por organização;
- convites, acessos provisórios, suspensão e encerramento de acesso;
- alteração e recuperação de senha;
- assinatura, trial, upgrade, downgrade, inadimplência e cancelamento por Stripe;
- trilha de auditoria das ações críticas.

### 5.2 Edificações

- identificação, endereço, características físicas, gestor e situação;
- latitude e longitude;
- geocodificação de endereço com confirmação pelo usuário;
- mapa do portfólio com backlog de cada imóvel;
- equipamentos e ativos vinculados ao imóvel em versões posteriores.

### 5.3 Fornecedores

- dados cadastrais e contatos;
- áreas de atuação;
- contratos, OS, desempenho e penalidades;
- documentos de habilitação e vigências em versão posterior.

### 5.4 Contratos

- cadastro, objeto, tipo, vigência, valores, fornecedor, gestor e fiscal;
- edificações abrangidas;
- aditivos, prorrogações, subcontratações, reajustes, repactuações e reequilíbrios;
- empenhos e movimentos financeiros;
- medições consolidadas a partir das OS;
- penalidades;
- espelho contratual e relatórios de prazo, saldo e execução.

### 5.5 Planos de manutenção

- planos preventivos, preditivos, de inspeção e de obrigação legal;
- periodicidade, ativo, checklist, contrato e prioridade padrão;
- geração programada de OS;
- controle de manutenção prevista, realizada, atrasada e dispensada.

### 5.6 Ordens de serviço

Requisitos mínimos:

- numeração sequencial por tenant e ano;
- edificação e demandante obrigatórios;
- fornecedor e um ou vários contratos opcionais, com indicação do principal;
- origem, prioridade, local, descrição, responsável e prazos;
- estado controlado por máquina de transição;
- pendência com motivo, responsável, prazo e resolução;
- anexos privados: fotos antes/durante/depois, nota fiscal PDF, laudos, cotações e documentos;
- orçamento e itens de serviço;
- histórico cronológico;
- custos estimado, aprovado e final;
- avaliação de satisfação após conclusão;
- consolidação em medição contratual.

### 5.7 Orçamentos e SINAPI

- orçamento associado à OS;
- referência de UF e mês;
- pesquisa e importação de insumos, composições e serviços;
- quantidades, custos unitários, BDI e total;
- exportação em Excel e PDF;
- controle da origem e da versão dos dados, sem tratar informação externa como permanente.

### 5.8 Fiscalização de mão de obra terceirizada

- empregados e postos vinculados ao contrato;
- folha, salários, benefícios, férias e encargos;
- documentos mensais e validações;
- EPI, treinamentos, exames e segurança do trabalho;
- pendências administrativas, glosas e evidências;
- proteção reforçada para dados pessoais e acesso restrito.

### 5.9 KPIs, SLAs e sustentabilidade

- catálogo padrão e indicadores configuráveis;
- metas, faixas de alerta, periodicidade e dimensões;
- satisfação, backlog, prazo, recorrência, confiabilidade, custos, contrato, segurança e sustentabilidade;
- linha de base para consumo de energia e água;
- explicitação da fórmula e da origem de cada medição.

### 5.10 Relatórios

- ordem de serviço individual;
- backlog aberto, pendente, vencido e por faixa de idade;
- OS por fornecedor, edifício, demandante, contrato e prioridade;
- fornecedores e penalidades;
- espelho do contrato;
- contratos a vencer;
- execução financeira, empenhos, medições e saldo;
- planos preventivos e conformidade;
- KPIs, SLAs, satisfação e sustentabilidade;
- exportação profissional em PDF e, quando tabular, Excel/CSV.

## 6. Requisitos não funcionais

| Tema | Requisito inicial |
|---|---|
| Segurança | cookies HttpOnly, senhas com hash forte, RBAC, validação de entrada e trilha de auditoria |
| Isolamento | toda consulta de domínio deve filtrar `tenant_id`; identificadores externos não autorizam acesso |
| Disponibilidade | execução em processos reiniciáveis, health check e backup testado |
| Desempenho | paginação em listas; índices nas dimensões do backlog; relatórios pesados assíncronos somente quando houver infraestrutura para fila |
| Acessibilidade | navegação por teclado, foco visível, semântica e contraste adequados |
| Observabilidade | logs estruturados com correlação, métricas técnicas e registro de falhas de integrações |
| Privacidade | minimização, retenção configurável, controle de download e atendimento aos direitos dos titulares |
| Evolução | módulos desacoplados internamente, ADRs e migrações versionadas |

## 7. Fora do escopo imediato

- microserviços sem necessidade comprovada;
- aplicativo nativo separado antes da validação do PWA;
- BIM, IoT ou inteligência preditiva no MVP;
- um menu genérico de “integrações futuras”;
- automação de decisões técnicas, sanções ou aprovações sem responsável humano.

## 8. Métrica norteadora

**Percentual de ordens de serviço resolvidas dentro do SLA, sem reabertura em 30 dias e com avaliação satisfatória.**

Essa métrica combina prazo, qualidade e percepção do usuário, evitando otimização exclusiva pelo número de fechamentos.
