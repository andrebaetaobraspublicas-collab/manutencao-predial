# Correção do teste da administração Infra — 16/11/2026

A CI do PR #85 interrompeu a etapa `Dependency security gate` no teste de navegação da administração do Infra. O carregador isolado do teste não declarava o módulo `system-bulletins-panel`, importado pela página. A falha ocorria antes das verificações de navegação.

O teste agora simula o componente e o hook de disponibilidade, sem carregar serviços nem enviar comunicados. Foi acrescentado o cenário `?tab=bulletins`, mantendo os casos de catálogo, alias SICRO, privacidade, auditoria e destino padrão seguro. Nenhum código de aplicação foi alterado.

A execução no GitHub confirmou a aprovação dessa etapa (incluindo auditoria de dependências) e do lint, mas revelou um caminho Windows fixo no teste de cota de arquivos contratuais. No Linux, o caminho não era absoluto e provocava uma exceção de configuração antes da regra de cota. A fixture passou a usar `path.join(tmpdir(), 'contract-files-test')`; a validação de armazenamento da aplicação e as asserções de bloqueio de cota permanecem intactas.

Validação local: 21 testes relacionados aprovados; conjunto de testes da etapa da CI anteriormente interrompida com 52 aprovados e um ignorado por exigir permissões/symlinks Linux. Essa execução local não inclui a consulta `npm audit` nem representa aprovação da CI completa. A promoção automática do GitHub permanece desativada e a publicação nativa do frontend de desenvolvimento foi desligada conforme o registro do incidente. A sincronização desta correção não autoriza implantação, migrations ou reinícios.
