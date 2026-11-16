# Revisão e sincronização sem implantação — 15/11/2026

> Correção apurada em 16/11: a integração Git nativa da Hostinger publicou automaticamente o frontend de desenvolvimento após o merge, apesar de o workflow do GitHub estar desativado. Portanto, a afirmação abaixo de ausência de alteração na Hostinger não se confirmou para essa interface. Consulte o [incidente e recuperação](48-incidente-interface-dev-20261116.md).

O PR #84 foi incorporado à main após aprovação da CI. Antes do merge, o workflow `promote-hostinger-runtime.yml` foi desativado no GitHub: seu gatilho workflow_run publicava automaticamente o desenvolvimento após CI de push na main. Deve permanecer desativado até autorização explícita de implantação. Não foram alterados hosts, configurações, dados ou serviços na Hostinger.

A branch de revisão reúne Gestão Contratual, integração de identidade e produtos, retenção de versões, correções de consulta/captura Infra, revisão de referência SINAPI, interface e testes locais pendentes. O código é versionado para revisão, não promovido automaticamente para os runtimes.

## Privacidade e configuração futura

Arquivos .runtime, backups, configurações reais e dados operacionais não são publicados. Exemplos de credenciais em testes são fictícios. O endereço pessoal fixo do administrador inicial foi removido do código novo. `GESTAO_ADMIN_EMAIL` passa a ser obrigatório, junto a `GESTAO_ADMIN_USER_IDS`, para privilégio inicial; ausência de e-mail não concede esse privilégio. O seed usa a mesma configuração. Uma futura implantação deverá configurar esse valor privadamente; nenhuma configuração remota foi alterada nesta rodada.

## Verificação

A revisão usa testes locais da API, testes de interface e compilação/tipagem. Testes de banco que exigem MySQL dedicado permanecem ignorados quando a variável específica não é fornecida. Não executar migrations nem seeds contra ambientes para validar esta branch. O teste de renderização do login foi atualizado para simular o helper atual de reconhecimento de host.

Os sistemas publicados podem divergir desta revisão local; sincronização Git não significa implantação nem autorização para fazê-la. A verificação visual da última conta habilitada continua pendente conforme o estado consolidado.

Resultados locais: 78 suítes da API e 519 testes aprovados, 5 suítes/32 testes ignorados por requisitos específicos; teste adicional de configuração administrativa aprovado. Tipagem API e build API/web aprovados. Lint do código-fonte web (`eslint src`) passou; lint irrestrito inclui artefatos públicos gerados e falhou (54 erros), limitação registrada sem suprimir regras. Testes frontend/Infra: 55 passaram na primeira rodada, e o único teste com mock desatualizado foi corrigido e passou com os demais 11 testes do mesmo arquivo. O artefato gerado do editor foi regenerado com localhost, removendo o endpoint de produção fixado por um build anterior.
