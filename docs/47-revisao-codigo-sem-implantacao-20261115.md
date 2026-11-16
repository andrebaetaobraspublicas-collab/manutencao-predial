# Revisão e sincronização sem implantação — 15/11/2026

O PR #84 foi incorporado à main após aprovação da CI. Antes do merge, o workflow `promote-hostinger-runtime.yml` foi desativado no GitHub: seu gatilho workflow_run publicava automaticamente o desenvolvimento após CI de push na main. Deve permanecer desativado até autorização explícita de implantação. Não foram alterados hosts, configurações, dados ou serviços na Hostinger.

A branch de revisão reúne Gestão Contratual, integração de identidade e produtos, retenção de versões, correções de consulta/captura Infra, revisão de referência SINAPI, interface e testes locais pendentes. O código é versionado para revisão, não promovido automaticamente para os runtimes.

## Privacidade e configuração futura

Arquivos .runtime, backups, configurações reais e dados operacionais não são publicados. Exemplos de credenciais em testes são fictícios. O endereço pessoal fixo do administrador inicial foi removido do código novo. `GESTAO_ADMIN_EMAIL` passa a ser obrigatório, junto a `GESTAO_ADMIN_USER_IDS`, para privilégio inicial; ausência de e-mail não concede esse privilégio. O seed usa a mesma configuração. Uma futura implantação deverá configurar esse valor privadamente; nenhuma configuração remota foi alterada nesta rodada.

## Verificação

A revisão usa testes locais da API, testes de interface e compilação/tipagem. Testes de banco que exigem MySQL dedicado permanecem ignorados quando a variável específica não é fornecida. Não executar migrations nem seeds contra ambientes para validar esta branch. O teste de renderização do login foi atualizado para simular o helper atual de reconhecimento de host.

Os sistemas publicados podem divergir desta revisão local; sincronização Git não significa implantação nem autorização para fazê-la. A verificação visual da última conta habilitada continua pendente conforme o estado consolidado.
