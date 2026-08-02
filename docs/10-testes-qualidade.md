# Estratégia de testes e qualidade

## 1. Pirâmide de testes

### Unitários

Cobrem regras puras e rápidas:

- máquina de estados da OS;
- cálculo de SLA;
- faixas de envelhecimento;
- saldos de contrato/empenho;
- fórmula e classificação de KPI;
- limites de plano;
- normalização de identificadores.

### Integração

Executados contra MySQL de teste:

- transações e sequências;
- consultas e índices do backlog;
- criação/alteração com relações;
- idempotência de webhook;
- migrações;
- geração de medição;
- isolamento multi-tenant.

### API/e2e

- registro, login, refresh e logout;
- RBAC e autorização por objeto;
- fluxo completo da OS;
- upload/download;
- billing simulado;
- relatórios;
- códigos de erro e validação.

### Interface/e2e

- login;
- emissão de OS;
- filtro do backlog;
- pendência e transição;
- anexo;
- fechamento;
- cadastro de edificação/fornecedor/contrato;
- responsividade e estados de erro.

## 2. Testes críticos de tenancy

Para cada recurso relevante:

1. criar Tenant A e Tenant B;
2. autenticar usuário A;
3. tentar listar, consultar, alterar, excluir, baixar e exportar recurso B;
4. esperar 404/403 sem revelar existência;
5. repetir para filtros, relações, relatórios e jobs.

Cobrir pelo menos:

- edificações;
- fornecedores;
- contratos;
- OS;
- pendências;
- anexos;
- medições;
- empenhos;
- KPIs;
- auditoria;
- assinatura/entitlement.

## 3. Banco e migrações

Pipeline deve validar:

- `prisma validate`;
- `prisma generate`;
- banco limpo → todas as migrações;
- snapshot antigo de teste → migração atual;
- seed sintético;
- consulta de smoke;
- ausência de `db push` na produção.

Migração com tabela grande exige análise de lock e estratégia de expansão/contração.

## 4. Qualidade do frontend

Cada tela deve possuir:

- carregamento;
- vazio;
- erro recuperável;
- sucesso/feedback;
- prevenção de envio duplicado;
- teclado e foco visível;
- rótulos de formulário;
- tabela responsiva ou alternativa móvel;
- datas, moeda e timezone corretos;
- confirmação para ação destrutiva.

## 5. Segurança automatizada

- análise de dependências;
- secret scanning;
- lint e TypeScript estrito;
- testes de autorização;
- teste de upload inválido e polyglot básico;
- rate limit em endpoints sensíveis;
- verificação de webhook inválido;
- cabeçalhos e cookies em produção;
- SAST quando integrado ao repositório.

## 6. Performance

Cenário de referência para testes:

- 100 tenants;
- 500 edificações por tenant de grande porte;
- 500 mil OS no tenant de carga;
- 100 usuários concorrentes no recorte inicial;
- anexos não carregados nas listagens;
- relatórios com paginação ou processamento dedicado.

Consultas a observar:

- backlog por status e idade;
- fornecedor/edificação/demandante;
- SLA vencido;
- contratos a vencer;
- dashboard;
- detalhe da OS.

Usar `EXPLAIN`, medir p95/p99 e verificar planos após mudança de índice.

## 7. Dados de teste

- somente dados sintéticos;
- fábricas determinísticas;
- cenários com acentos e textos longos;
- limites monetários e de data;
- dois ou mais tenants;
- datas no início/fim de mês e horário de verão quando relevante;
- arquivos pequenos válidos e inválidos.

## 8. CI mínima

```text
checkout
→ npm ci
→ prisma validate/generate
→ prisma migrate deploy em MySQL de teste
→ lint
→ unit tests
→ integration/e2e multiempresa
→ build API
→ build Web
→ imagem Docker
```

Não publicar se uma etapa obrigatória falhar.

## 9. Definition of Done de qualidade

- testes do caminho feliz e principais falhas;
- cobertura da regra, não apenas da linha;
- isolamento por tenant;
- logs e auditoria;
- documentação;
- sem alerta crítico conhecido de segurança;
- build reproduzível;
- smoke test no ambiente de staging.
