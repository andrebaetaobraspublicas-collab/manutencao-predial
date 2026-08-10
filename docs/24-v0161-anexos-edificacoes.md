# v0.16.1 — Anexos e vistorias de edificações

Correção de manutenção publicada para o dossiê de edificações:

- recupera nomes UTF-8 que chegam pelo multipart interpretados como Windows-1252/Latin-1;
- normaliza nomes em NFC e corrige registros existentes durante o seed idempotente;
- separa a validação da nova vistoria da validação do formulário principal da edificação;
- baixa anexos por requisição autenticada, com renovação de sessão e mensagem de erro na própria tela;
- usa armazenamento persistente no Hostinger e migra anexos legados antes da troca do build;
- aplica a mesma normalização e raiz persistente aos anexos de contratos e ordens de serviço.

## Verificação

- teste unitário da recuperação de nomes e da resolução do diretório persistente;
- TypeScript e ESLint dos workspaces;
- builds de produção da API e do frontend;
- CI com migrações e seed executado duas vezes para comprovar idempotência;
- smoke test e download autenticado em produção após o deploy.
