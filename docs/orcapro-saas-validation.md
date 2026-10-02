# Homologação da gestão SaaS OrçaPro — 02/10/2026

Contas e preços dos testes são sintéticos. Nenhuma senha de produção foi alterada, conta real criada/excluída ou compra Stripe executada. Stripe foi simulado no transporte remoto, mantendo verificação real de assinatura raw-body pelo SDK; configuração comercial real continua necessária antes de cobrar.

- API e frontend estático Webpack compilados; 34 páginas, incluindo administração e assinatura.
- Suites HTTP originais continuam verificando manutenção, dois tenants, proprietário privado e preços SINAPI referência × UF × regime. Nova suite SaaS tem 11 cenários em MySQL real, incluindo simultaneidade, senha, exclusão recuperável, licença vencida e webhook assinado. Total: 49 testes HTTP.
- Regras de licença acrescentam oito testes aos 134 testes unitários existentes. Onze contratos do editor/bridge permanecem aprovados. Motores, catálogo e fonte original não foram modificados.
- Browser local com administrador fictício: login compartilhado, busca, cadastro (formulário sem submissão), edição de validade/justificativa (sem submissão), planos/configuração e auditoria. Corrigido overflow da grade; data de validade editável usa America/Sao_Paulo.
- Entrada direta continua no editor original após os avisos legais. Administrador vê Gestão do SaaS no topo do editor, na área de projetos e no cartão OrçaPro de Escolha seu programa. Rotas protegidas no backend; esconder botão não é o controle de permissão.

## Preservação do banco

Exportação atual phpMyAdmin antes da publicação: 132.100.223 bytes, SHA256 `D33E376B1E4F18182C848A16F389D8B7A396CD03FAC8B4703CB88DC284129E97`. Arquivo privado fora do repo, ACL usuário Windows atual e SYSTEM.

Restauração em schema local independente conferiu 94 tabelas e 495.720 preços globais. Migração aditiva aplicada; hashes SHA256 de cada linha, usando somente colunas anteriores e ordenação determinística, produziram o mesmo digest agregado antes/depois: `BE37FCBBAFD8F253B9DE1C2DC17BC4BEB37CF7FE0BD94A1553D7B0D582919657`. O campo posterior stripeCheckoutPriceId foi aplicado no schema restaurado e acrescenta apenas memória de checkout na tabela nova. Valores anteriores da manutenção e SINAPI permaneceram intactos. Gates de CI e readiness publicada são verificados separadamente; homologação local não prova disponibilidade em produção.

Rollback documentado no ADR 0008: manter histórico/tabelas; código antigo que ignora maintenanceAccess não pode autenticar vínculos novos exclusivos OrçaPro sem suspender previamente esses vínculos.
