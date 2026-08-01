# Continuidade do desenvolvimento no Codex

## 1. Objetivo

Permitir que o desenvolvimento iniciado no ChatGPT continue no Codex sem perda de requisitos, decisões ou regras de negócio. O repositório, e não o histórico do chat, deve ser a fonte de verdade.

## 2. Pacote de contexto obrigatório

Antes de iniciar uma tarefa, o agente deve ler:

1. `AGENTS.md`;
2. `docs/00-especificacao-do-produto.md`;
3. o documento funcional do módulo envolvido;
4. `docs/adr/` relacionado;
5. schema Prisma e testes do domínio afetado;
6. issue ou solicitação com critérios de aceite.

Não fornecer ao Codex apenas “implemente o próximo módulo”. Cada tarefa precisa de escopo fechado.

## 3. Estrutura recomendada de issue

```markdown
# Título
[MVP] Convite de usuário com acesso provisório

## Problema
Administradores precisam conceder acesso por prazo definido sem compartilhar credenciais.

## Resultado esperado
Convite por e-mail, aceite com criação/associação de conta e expiração automática.

## Regras de negócio
- tenant vem da sessão do administrador;
- papéis permitidos conforme matriz;
- expiresAt opcional e futuro;
- convite não aceito pode ser revogado;
- e-mail já existente pode receber novo membership;
- nenhuma conta pode acessar tenant não autorizado.

## API/UI
Descrever endpoints, estados de tela e mensagens.

## Critérios de aceite
- [ ] testes unitários
- [ ] teste de isolamento multi-tenant
- [ ] documentação e Swagger
- [ ] auditoria
- [ ] migração revisada

## Fora do escopo
SSO e SCIM.
```

## 4. Prompt-base para o Codex

```text
Trabalhe no repositório Gestão de Prédios.

Leia AGENTS.md e os documentos indicados na issue antes de alterar código.
Implemente somente o escopo da issue <ID/TÍTULO>.
Preserve Node.js/TypeScript, NestJS, Next.js, MySQL/Prisma, monólito modular e isolamento por tenant.
A ordem de serviço é o agregado central.

Antes de codificar:
1. resuma a regra que será implementada;
2. identifique arquivos e riscos;
3. proponha testes.

Depois:
1. implemente em pequenos commits lógicos;
2. execute lint, testes, geração Prisma e builds;
3. mostre mudanças de schema e SQL;
4. atualize Swagger, docs e changelog;
5. liste limitações verificadas, sem inventar resultados.

Não introduza dependência, serviço externo, microserviço ou alteração incompatível sem ADR.
Nunca aceite tenantId do cliente como fonte de autorização.
```

## 5. Definition of Ready

Uma tarefa está pronta para implementação quando contém:

- usuário/persona;
- problema e resultado;
- regras de negócio;
- entradas e saídas;
- estados de erro;
- permissões;
- impacto multi-tenant;
- impacto em auditoria e LGPD;
- critérios de aceite verificáveis;
- itens explicitamente fora do escopo;
- mock ou descrição de UI quando necessário.

## 6. Definition of Done

- código compila;
- lint e testes passam;
- testes de domínio e isolamento adicionados;
- migração versionada e revisada;
- autorização no servidor;
- entradas validadas;
- ação crítica auditada;
- logs não expõem segredo/dado sensível;
- Swagger e documentação atualizados;
- interface contém loading, vazio, erro e sucesso;
- acessibilidade básica verificada;
- changelog atualizado;
- nenhum TODO crítico oculto.

## 7. Estratégia de branches e commits

Sugestão:

```text
main                 produção estável
feat/<issue>-<slug>  funcionalidade
fix/<issue>-<slug>   correção
chore/<slug>         infraestrutura/documentação
```

Commits pequenos e descritivos:

```text
feat(work-orders): add explicit reopen command
fix(tenancy): scope attachment download by tenant
migration(kpi): add baseline period fields
```

## 8. Como dividir o MVP

Evitar um único pedido “implemente o MVP”. Sequência recomendada:

1. CI e validação completa da fundação;
2. usuários, convites e recuperação de senha;
3. entitlement e Stripe;
4. geocodificação;
5. catálogo de categorias e SLA;
6. comentários/checklists/evidências da OS;
7. notificações;
8. fechamento e reabertura;
9. relatórios do MVP;
10. hardening, auditoria, backup e staging.

Cada etapa deve produzir software utilizável e testes.

## 9. Decisões que exigem ADR

- trocar MySQL ou Prisma;
- separar microserviço;
- adotar fila/broker;
- mudar estratégia multi-tenant;
- trocar cookies por outro modelo de sessão;
- introduzir armazenamento externo;
- alterar máquina de estados da OS de modo incompatível;
- adotar motor de workflow;
- expor API pública;
- adicionar processamento de IA com dados dos clientes.

## 10. Migrações

O Codex deve:

- editar o schema;
- gerar migração com nome claro;
- apresentar o SQL;
- indicar bloqueios e necessidade de backfill;
- evitar remoção imediata de coluna usada;
- testar em banco limpo e banco migrado;
- atualizar seed.

Nunca usar `prisma db push` como substituto de migração versionada em produção.

## 11. Segurança no uso de agentes

- não enviar `.env`, dados reais, dumps ou anexos de clientes ao agente;
- usar dados sintéticos;
- revisar toda alteração de autenticação, billing e autorização;
- não aceitar conclusão baseada apenas em descrição do agente;
- exigir saída de comandos e diffs;
- manter segredos no ambiente e rotacioná-los se expostos.

## 12. Registro de contexto entre sessões

Ao finalizar cada tarefa, atualizar:

- issue;
- `CHANGELOG.md`;
- ADR, se aplicável;
- documentação funcional;
- testes;
- comentário de handoff com decisões, arquivos, comandos e pendências.

Modelo de handoff:

```markdown
## Entregue
...

## Decisões
...

## Migrações/configuração
...

## Testes executados
...

## Riscos ou pendências
...

## Próxima issue recomendada
...
```
