# Recuperação da interface de desenvolvimento — 16/11/2026

## Causa confirmada

O merge do PR #84 (`b1b567a`) disparou a integração Git nativa da Hostinger, independente do GitHub Actions. O log de implantação registra a publicação da `main` em 16/11/2026 às 02:38 UTC (15/11 às 23:38 em Brasília). Essa revisão ainda não continha a Gestão Contratual. A substituição do frontend removeu sua rota e seus acessos no login e no seletor de programas.

Desativar somente `promote-hostinger-runtime.yml` não impediu esse segundo mecanismo. A afirmação anterior de que a sincronização não alterou o ambiente estava incorreta quanto ao frontend de desenvolvimento.

## Recuperação autorizada

Foi preservada uma cópia integral da interface anterior em diretório privado de recuperação no servidor, com manifesto de hashes. A prévia do PR #85 (`bbf964a`) forneceu as rotas de Gestão Contratual, login e programas, seus arquivos estáticos e monitor de sessão.

A operação copiou 94 arquivos e conferiu que 295 arquivos existentes permaneceram inalterados. Arquivos estáticos de mesmo nome só foram reutilizados após comparação de hashes. O destino e a configuração do runtime da API foram conferidos antes e depois, sem alteração. Não houve migrations, seeds, alterações em bancos, reinício da API nem operação em produção.

O navegador confirmou novamente o card da Gestão Contratual e a abertura do aplicativo com menus e planilha contratual existente. Essa recuperação não equivale a uma nova homologação de todos os cálculos ou a implantação da API do PR #85.

## Prevenção

O workflow de promoção do GitHub continua desativado. Após acesso à conta responsável pelo desenvolvimento, foi desativada também a publicação automática nativa da Hostinger, exclusivamente no frontend gestaodepredios.com.br. O painel confirmou: “Auto-deployment is off. Changes from Git are not deployed automatically.” Não foi acionado Redeploy. As configurações de API e produção não foram alteradas.

Antes de qualquer sincronização futura, conferir separadamente os workflows GitHub Actions, a integração Git nativa da Hostinger (incluindo prévias de PR), a branch observada e o destino de cada publicação. Uma publicação autorizada deve registrar artefato, ambiente, backup e validação. Credenciais, dados de clientes, cópias e manifestos privados não integram o repositório.
