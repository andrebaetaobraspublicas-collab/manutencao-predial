# v0.14.0 — Governança operacional e dados demonstrativos

## Resultado funcional

Esta entrega corrige o vínculo de áreas de atuação dos fornecedores: a interface e a API usam
exclusivamente os itens ativos do catálogo `SPECIALTY` da organização. O campo aceita múltiplas
especialidades e os vínculos permanecem isolados por `tenantId`.

Fornecedores e contratos agora podem ser editados e arquivados diretamente nas respectivas
listas. Ordens de serviço, empenhos, medições, ativos e planos preventivos também ganharam ações
de edição e exclusão lógica nos pontos em que a regra de negócio permite. A exclusão nunca remove
fisicamente o histórico de produção: ela registra auditoria e usa `deletedAt`, cancelamento ou
inativação. Empenhos liquidados/pagos e medições aprovadas/liquidadas/pagas exigem estorno formal.

Administradores podem criar uma conta ativa diretamente, escolher papel e validade, redefinir a
senha, suspender, reativar e revogar sessões. A redefinição administrativa invalida as sessões
ativas. Para evitar que um administrador de uma organização comprometa acesso de outra, a troca
direta de senha é recusada se a mesma conta tiver vínculo ativo com outro tenant.

## Relatórios

Os PDFs de backlog, ficha de OS, contratos a vencer e espelho contratual receberam:

- cabeçalho institucional, data/hora, organização e identificação do recorte;
- cards de síntese e indicadores reconciliados;
- seções visuais, tabelas com melhor hierarquia e rodapé paginado;
- conteúdo adicional sobre SLA, pendências, evidências, orçamento, medições e empenhos;
- metadados do documento e manutenção do hash de integridade.

Os CSVs continuam usando o mesmo conjunto de dados e filtros dos PDFs, com proteção contra
injeção de fórmulas e escopo da organização autenticada.

## Massa demonstrativa

O seed cumulativo passa a preparar um portfólio coerente para homologação, sem apagar dados:

- três edificações e seis fornecedores, incluindo especialidades variadas;
- três contratos e doze ordens de serviço em diferentes estados e prioridades;
- comentários, pendências, checklists e orçamentos finais executados;
- ativos e planos preventivos;
- empenhos, movimentos, medição, KPIs, alertas e notificação.

Tabelas de segurança, auditoria, sessões, outbox e fatos imutáveis não recebem registros
artificiais indiscriminados. Elas são preenchidas somente pelos fluxos correspondentes para não
produzir evidências falsas.

## Banco e rollback

A migration adiciona `MaintenancePlan.deletedAt` e seu índice de consulta. O rollback operacional
preferido é voltar ao binário anterior e manter a coluna, que será ignorada. A remoção física está
documentada no arquivo `ROLLBACK.md` da migration e não deve ser aplicada enquanto houver planos
arquivados que precisem ser restaurados ou auditados.

