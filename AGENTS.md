# AGENTS.md — instruções permanentes para ChatGPT/Codex

## Missão do produto

O Gestão de Prédios é um SaaS B2B de manutenção predial. A **ordem de serviço é o agregado central**: contratos, fornecedores, edificações, orçamento, medição, documentos, SLAs, satisfação e indicadores devem convergir para a OS.

## Regras invioláveis

1. **Multi-tenancy:** nenhuma leitura, alteração ou exclusão de dado operacional pode ocorrer sem `tenantId` obtido do token autenticado. Nunca aceitar `tenantId` livre no corpo da requisição.
2. **OS central:** não criar fluxos paralelos de manutenção que ignorem a OS. Plano preventivo gera OS; medição consolida OS; orçamento pertence à OS; anexos e pendências ficam na OS.
3. **Rastreabilidade:** mudanças de status, custos, prazos, responsáveis e documentos relevantes devem gerar histórico/auditoria.
4. **Sem exclusão física em produção:** entidades de negócio usam `deletedAt` ou status. Exclusão física somente para dados efêmeros e mediante regra documentada.
5. **Arquivos privados:** fotos, PDFs e notas fiscais nunca ficam em pasta pública. Download sempre passa por autorização e validação do tenant.
6. **Dinheiro:** usar `Decimal` no banco. Não usar `number` de ponto flutuante para cálculos financeiros críticos.
7. **Datas:** armazenar em UTC; apresentar na zona do tenant, inicialmente `America/Sao_Paulo`.
8. **Stripe:** webhooks são idempotentes e têm assinatura validada antes de qualquer mutação.
9. **Migration first:** toda alteração de schema precisa de migration, seed compatível e atualização de `docs/02-modelo-de-dados.md`.
10. **Contrato da API:** manter Swagger atualizado e evitar breaking changes fora de versão principal.

## Sequência de leitura antes de codificar

1. `docs/00-especificacao-do-produto.md`
2. `docs/01-arquitetura-tecnica.md`
3. `docs/02-modelo-de-dados.md`
4. `docs/03-regras-ordens-de-servico.md`
5. `docs/04-contrato-api.md`
6. `docs/05-roadmap.md`
7. ADRs relevantes em `docs/adr/`

## Definition of Done

- Critérios de aceitação demonstráveis.
- Teste unitário das regras e teste de integração de isolamento entre tenants.
- Sem consulta operacional sem `tenantId`.
- Swagger e documentação atualizados.
- Migration reversível ou plano de rollback documentado.
- Lint, testes e build concluídos.
- Sem segredos no repositório.
