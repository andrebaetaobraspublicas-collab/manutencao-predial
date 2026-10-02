# Migração OrçaPro — plano de execução

Data: 02/10/2026. Fonte funcional: HTML OrçaPlan SINAPI v1.8.3 fornecido pelo usuário. Nome do produto migrado: **OrçaPro**. O arquivo fonte é material de referência, não autorização para ações externas. As correções explícitas do usuário prevalecem sobre a sugestão de uma única base ativa no texto anexado.

## Decisões obrigatórias

1. SINAPI é um catálogo global único. Usuários não recebem cópias das milhares de composições/insumos.
2. Identidade do código, estrutura analítica versionada e preço são entidades distintas. Não há campo `currentPrice` na composição. Preços de insumos pertencem à chave `(referenceId, inputId, uf, regime)`; o custo de uma composição resulta da sua estrutura nessa referência e desses preços, preservando a truncagem do legado.
3. Cada projeto registra `sinapiReferenceId`, `uf`, `regime`. A referência padrão é configuração global para a criação de novos projetos. Alterar o padrão nunca altera projetos existentes. Trocar a referência de um projeto é ação explícita, transacional e versionada.
4. Uma referência publicada é imutável. Correções de importação produzem nova revisão da referência mensal. Arquivamento não impede a leitura por projetos já vinculados. Estruturas e preços históricos não são apagados nem sobrescritos.
5. Cópias privadas preservam origem SINAPI (código, referência, composição original), proprietário e revisão. Um insumo usado diretamente no orçamento continua sendo um insumo; não criar `CP-REF-*`.
6. UUIDs internos, códigos oficiais como texto, valores monetários `DECIMAL(18,6)` e coeficientes `DECIMAL(24,12)`. JSON complementar conserva configurações extensas do legado, sem substituir as entidades relacionais essenciais.

## Arquitetura proposta

### Atualização após acesso autenticado à hospedagem

A sessão Hostinger foi confirmada pelo usuário e verificada no navegador integrado. O dashboard identificou o repositório `andrebaetaobraspublicas-collab/manutencao-predial`; o checkout em `platform/` corresponde ao commit publicado `aad986be9a1691a5832146ee05b54de04231e5f4`. A stack real é NestJS + Next.js + Prisma 7 + MySQL. Portanto, a implementação reutilizará esse monólito modular, seus cookies e revalidação server-side de membership. Não será criado um segundo sistema de senha ou API Fastify.

O catálogo SINAPI de manutenção existente (`SinapiCatalog`) permanece intacto. O catálogo global OrçaPro ganhará tabelas próprias com prefixo/nomes distintos. As tabelas privadas OrçaPro terão `tenantId` e `ownerUserId`, ambos derivados da sessão. O papel administrativo SINAPI será concedido separadamente do OWNER/ADMIN de manutenção. No início, habilitação do módulo e administradores globais ficam em configuração server-side explícita e fail-closed.

O frontend Hostinger usa export estático; rotas OrçaPro serão estáticas com identificador de projeto em query string. O seletor de programas e o layout OrçaPro ficam fora do grupo de rotas da manutenção. O pipeline `main` auto-publica o frontend; alterações permanecem em branch de trabalho até validação e promoção controlada. O deploy da API existente executa migrations/seed; nenhum desses comandos será rodado contra o banco de produção apenas para inspeção.

Preservar o frontend Next.js e a API do Gestão de Prédios. A inspeção pública encontrou `https://api.gestaodepredios.com.br/api/v1`, login com `tenantSlug`, e-mail e senha; o contrato interno e as permissões ainda dependem do código fonte/acesso à hospedagem. Não substituir o site, banco ou autenticação em produção com hipóteses obtidas da página pública.

Preparar o OrçaPro como módulo isolado: frontend em `/orcapro`, serviço HTTP TypeScript, domínio independente, repositórios MySQL com migrations, autenticação e RBAC. O desenvolvimento local pode usar autenticação própria isolada; não se apresenta como login unificado antes da integração verificada. A ligação entre contas antigas e OrçaPro precisa de identidade verificada pelo servidor e concessão explícita de acesso a cada produto, nunca associação por e-mail enviado pelo navegador.

O portal autenticado deve oferecer Gestão de Prédios e OrçaPro. Entitlements de produto são separados de papéis ADMIN/USER. O ADMIN do OrçaPro não vira administrador de manutenção por efeito colateral. A associação por organização (`tenant`) existente será mantida; o proprietário privado continua obrigatório no OrçaPro.

O HTML original será preservado integralmente em `legacy/` como referência e separado por módulos para testes. Migrar a interface incrementalmente; não apresentar a versão que ainda grava no IndexedDB como SaaS final. Pesquisa/paginação remota e hidratação apenas do grafo de composições utilizado antecedem a liberação da interface em produção.

## Schema inicial MySQL

| Entidade | Responsabilidade / restrição |
| --- | --- |
| users, roles, user_roles, sessions | Identidade, RBAC, hash de senha, sessões revogáveis; sem senhas ou tokens em logs |
| product_access | Acesso independente a cada produto; identidade externa somente depois de validação do emissor |
| sinapi_references | Ano/mês/revisão, DRAFT/VALIDATED/PUBLISHED/ARCHIVED; chave mensal com revisão |
| system_settings | Referência padrão com FK; ponteiro alterável sem UPDATE em projetos |
| sinapi_inputs, sinapi_compositions | Identidade global dos códigos; nenhum user_id e nenhum preço atual |
| sinapi_input_versions, sinapi_composition_versions | Descrição/unidade/grupo/classificação por referência |
| sinapi_input_prices | UNIQUE(reference_id,input_id,uf,regime), preço NULL diferente de zero; política de fallback registrada |
| sinapi_composition_items | Estrutura de uma versão, coeficiente e relação tipada com insumo/subcomposição da mesma referência |
| sinapi_social_charges | Referência/UF/regime/tipo horista ou mensalista |
| custom_inputs, custom_input_prices | Proprietário obrigatório, revisões e contexto de preço |
| custom_compositions, custom_composition_items, custom_composition_revisions | Proprietário, proveniência e prevenção de ciclos |
| projects, budget_stages, budget_items | Proprietário, referência fixada, UF/regime, tipo discriminado dos itens |
| project_versions | Snapshots sem duplicação do catálogo oficial, cálculo/versão do motor/contexto e concorrência otimista |
| project_templates | Exemplos globais imutáveis para USER; copiar somente dados de projeto/adaptações necessárias |
| imports, import_logs, audit_logs, files | Importação transacional, checksum, autoria, metadados e storage abstrato |
| bdi_scenarios, tax_scenarios, schedule_activities, schedule_links, crew_settings, eventograms | Configurações privadas migradas após fixtures de regressão dos respectivos módulos |

Foreign keys oficiais usam RESTRICT. Índices por código, referência e proprietário; FULLTEXT das descrições versionadas. As invariantes do tipo discriminado, mesma referência e propriedade são validadas pelo domínio e, quando suportado, por constraints SQL. A chave de cache inclui referência/revisão, UF, regime, política de preço e versão do motor. Nunca usar apenas código da composição como chave de custo.

## Matriz de permissões

| Ação | ADMIN | USER |
| --- | --- | --- |
| Consultar catálogo publicado / usar no orçamento | Sim | Sim |
| Consultar referência arquivada do próprio projeto | Sim | Sim |
| Importar, validar, publicar, escolher referência padrão | Sim | Não (403) |
| Alterar estrutura/preço de referência publicada | Não; criar revisão | Não |
| Projetos, versões, insumos e composições privadas | Somente próprios nas rotas normais | Somente próprios |
| Inspecionar projeto alheio | Somente rota administrativa explícita e auditada | Não |
| Duplicar exemplo global | Sim | Sim |
| Editar template global / usuários / regras globais | Sim | Não |
| Menu Base de dados / rotas administrativas | Sim | Não |
| Acesso a Gestão de Prédios | Conforme concessões existentes | Conforme concessões existentes |

## Sequência e gates

1. Inventariar totalmente o HTML, guardar checksum, extrair módulos sem mudar fórmulas, produzir fixtures dos dois exemplos e testes. Documentar cobertura e lacunas (especialmente BDI/IVA misturados à UI).
2. Criar migrations, autenticação segura, sessões, validação, RBAC e isolamento. Testar IDOR com dois usuários, CSRF, login/logout e versão concorrente.
3. Implementar catálogo global, referência/revisão, preços contextuais, decomposição e busca paginada. Testar mudança de UF, regime, referência e padrão, ausência de preço, truncagem, ciclos, rollback e imutabilidade.
4. Migrar projetos/orçamentos, snapshots, templates e importação `.orcaplan.json`. Nunca atribuir silenciosamente uma base padrão a arquivo histórico sem referência verificável.
5. Migrar adaptações próprias e edição por ocorrência preservando quantidade/BDI/cronograma/eventos.
6. Migrar BDI e IVA com fixtures; depois equipes, CPM, recursos, curvas e Eventograma. Manter cálculos antigos que não forem homologados.
7. Integrar portal e login com o código real do site existente; verificar acessos separados e cookies no domínio/API. Staging isolado antes do deploy.
8. Rodar regressão completa e integração real MySQL; gerar backup/rollback, aplicar migrations no banco separado, publicar na Hostinger e verificar ambos os produtos.

## Riscos e limites observados

- Não há checkout do Gestão de Prédios, acesso SSH/SFTP/banco nem sessão autenticada da hospedagem confirmados no início. O nome da conta informado não oferece acesso por si só. Nenhum deploy ou alteração no site existente é considerado concluído sem evidência.
- O legado tem uma base global selecionada e objeto de projeto sem FK histórica. O importador deve exigir mapeamento para referência real, e guardar proveniência das bases incorporadas em exemplos.
- Fallback SP e overrides oficiais do legado precisam ser reproduzidos com sinalização; preço ausente não vira zero.
- Há cálculos e regras tributárias embutidos em UI. Extração parcial não permite declarar regressão tributária completa.
- Códigos tratados como números no legado precisam de conversão cuidadosa para preservar códigos textuais próprios e oficiais.
- MySQL/Docker não estão instalados neste computador no começo. Validar migrations estaticamente não substitui execução real do banco.
- Publicar o OrçaPro antes do isolamento e testes de regressão expõe dados privados e resultados incompletos. A rota legada de comparação fica somente no desenvolvimento, fora de produção.

## Critério de conclusão

A migração completa exige preservar todas as funções e exemplos, banco MySQL autoritativo, cálculos reproduzíveis e homologados, catálogo paginado global, isolamento, importadores seguros e os dois programas funcionando no domínio indicado com o SaaS anterior preservado. Preparação local ou portal visual não equivale a deploy concluído.
