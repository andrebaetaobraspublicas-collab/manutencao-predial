# Publicação aditiva do OrçaPro

O OrçaPro é integrado ao monorepo existente conforme o ADR 0007. Usa a autenticação do Gestão de Prédios, frontend em `/orcapro` e API em `/api/v1/orcapro`. Este documento descreve os gates da publicação; a implementação local não comprova uma publicação em produção.

## Entrada e sessão

- `/programas` valida a sessão e consulta o acesso ao OrçaPro antes de oferecer o botão de entrada. O Gestão de Prédios continua em `/dashboard`.
- `/login` oferece Gestão de Prédios, OrçaPro e a opção de escolher após autenticar. Sem parâmetro, o destino permanece `/dashboard`, preservando a entrada da manutenção. `?next=/orcapro`, `?next=/programas` e `?next=/dashboard` são os únicos destinos aceitos. URLs externas, esquemas, caminhos desconhecidos e variações são ignorados.
- Escolher OrçaPro consulta `GET /api/v1/orcapro/access`. Quando a API anterior responde 404, o gate responde 503 ou a conta recebe 403, o portal apresenta indisponibilidade e mantém a entrada da manutenção. Erros de rede também não liberam o acesso visualmente.
- `AppShell` acrescenta o link “Trocar programa” para `/programas`. As rotas, links e permissões da manutenção permanecem em seus caminhos atuais, inclusive `/orcamentos` e `/api/v1/budgets`.
- A sessão continua em cookies HttpOnly `gp_access` e `gp_refresh`. Nenhum token ou senha é salvo pelo portal em localStorage. Logout encerra a sessão compartilhada. A checagem visual não substitui a autorização do servidor em cada rota OrçaPro.

O portal consulta primeiro `/orcapro/access`, permitindo que o cliente existente renove o cookie de acesso quando necessário, e depois `/auth/me`. Em uma API antiga sem o endpoint OrçaPro, preserva-se o comportamento existente de `/auth/me`: sessão vencida exige login. Não houve alteração no contrato da autenticação.

## Gates antes da ativação

1. Confirmar a revisão das duas aplicações Hostinger e o estado de `/api/v1/health/ready`. Preservar as configurações, domínios, uploads privados e rotas atuais. Não criar uma nova aplicação substituindo o site existente nem trocar DNS por suposição.
2. Revisar SQL da migration aditiva e aplicar em MySQL isolado com dados sintéticos. Executar lint, geração/validação Prisma, testes de regras financeiras, autorização, isolamento entre dois tenants/usuários e builds da API e frontend.
3. Verificar também o frontend com `HOSTINGER_STATIC_EXPORT=1`. O hPanel atual publica `apps/web/out`; páginas novas devem funcionar com exportação estática. Identificadores privados são resolvidos no cliente/API e não exigem novas rotas dinâmicas do Next.js.
4. Fazer e validar backup do banco e dos anexos privados, ensaiar restauração e registrar release e responsável. Segredos permanecem no ambiente, nunca em código, documentação ou logs.
5. Publicar o módulo com gate servidor fechado. Confirmar que 404/403/503 na disponibilidade não quebram o login e as páginas de manutenção. Verificar o servidor antes de habilitar o produto; flags públicas incorporadas à build não são controles de autorização.
6. Conferir o alcance do gate antes de abrir o piloto: `ORCAPRO_ENABLED=true` libera o módulo para memberships autenticados cujo usuário não tenha `OrcaproUserAccess.enabled=false`. Ausência de registro significa habilitado; esse controle não é uma allowlist de piloto. A administração global pode desativar apenas o OrçaPro de uma conta, sem alterar `User.status`, memberships ou permissões da manutenção. `ORCAPRO_ADMIN_USER_IDS` restringe a administração global, independentemente de OWNER/ADMIN da manutenção. Se o piloto exigir uma allowlist de organizações ou contas, definir e testar esse controle antes da ativação. Nenhuma escolha do seletor concede papel global ou permite escolher tenant pelo corpo da requisição.
7. Verificar login, renovação, troca de programa, logout, projetos privados, catálogo global e orçamento da manutenção. Ativar para os demais usuários somente após esses resultados.

## Pipeline existente

O build web usa `next build --webpack`. O Linux da Hostinger observado nesta publicação não fornece GLIBC 2.29 exigida pelo SWC nativo do Next 16.3; o Next recorre ao SWC WebAssembly. Webpack admite esse fallback, enquanto Turbopack exige o binding nativo. Manter a versão corrigida do Next e verificar a build real da hospedagem; não contornar a incompatibilidade removendo atualizações de segurança.

O frontend acompanha `main` e pode ser publicado antes de a API nova estar pronta. O workflow `Promote Hostinger runtime` promove a API pela branch técnica `deploy-api` depois da CI de um push em `main` no próprio repositório. Confere que o SHA ainda é o `main` atual antes de publicar, preserva uploads e exige SHA correto e banco alcançável na readiness. CI de pull request e revisão superada não devem promover produção. Essa convivência de versões é tratada pelo portal, que considera endpoint ausente indisponibilidade.

O comando Hostinger da API inclui `prisma migrate deploy` e seed. Executá-lo contra produção é uma publicação com alteração de banco, mesmo que a mudança pareça apenas de build. Não usá-lo para verificação local. Commits em `main`, inclusive de documentação, podem acionar publicação; manter a candidata em branch de trabalho até concluir os gates.

O seed automático existente mantém a senha/papel de usuários já cadastrados, mas cria ou reconcilia dados demonstrativos e repara nomes de anexos. Ele não se limita ao catálogo OrçaPro. O novo catálogo deve ser alimentado pelo procedimento específico OrçaPro, sem ampliar o seed da manutenção nem converter seu `SinapiCatalog` em catálogo global.

A CI principal constrói o frontend padrão. A candidata também precisa do build estático usado na Hostinger; `Pilot readiness` fornece essa configuração. O gate de funcionalidade deve ser conferido no backend publicado, sem depender de flags do frontend.

## Configuração adicional da API

Manter as variáveis atuais de banco, JWT, cookies, CORS e uploads. O OrçaPro acrescenta:

- `ORCAPRO_ENABLED`: somente o texto `true` habilita o módulo; ausência ou `false` mantém 503 no acesso. Usar `false` na primeira publicação.
- `ORCAPRO_ADMIN_USER_IDS`: lista de IDs de usuários autorizados a administrar o catálogo global, separada por vírgulas. É configuração do servidor; não usar IDs enviados pelo frontend para conceder acesso.
- `CORS_ORIGINS`: deve incluir a origem HTTPS exata do frontend usado pelos usuários. O guard OrçaPro exige `Origin` dessa lista nas operações mutantes; requisições sem origem, `null` ou origem desconhecida recebem 403.

Preservar `COOKIE_SECURE=true` em HTTPS, escopo correto de `COOKIE_DOMAIN`, `NEXT_PUBLIC_API_URL` da API existente e `HOSTINGER_STATIC_EXPORT=1` no build do frontend. Nenhuma senha, segredo JWT ou lista real de administradores deve ser incluída neste documento.

## Validação local da migration

Em 02/10/2026, as 13 migrations iniciais foram aplicadas do zero em MySQL Community Server 8.4.11, numa instância independente em `127.0.0.1:3308`, schema exclusivamente sintético `gestaopredios_test`. As migrations adicionais de acesso por usuário e tamanho de código privado também foram aplicadas, totalizando 15 migrations e 16 tabelas `Orcapro*`. O executável baixado do CDN oficial apresentou assinatura Authenticode válida de Oracle America. O seed fictício da manutenção executou duas vezes com sucesso; o schema apresentou quatro CHECKs do domínio.

O primeiro ensaio encontrou incompatibilidade MySQL entre o CHECK de filho analítico e `ON UPDATE CASCADE`. O SQL e o schema foram corrigidos para `ON UPDATE RESTRICT`, e o ensaio completo foi repetido em schema vazio. Essa execução valida instalação nova local; aplicação em cópia migrada da hospedagem, backup/restauração de produção e testes funcionais continuam gates separados.

As configurações e logs do ensaio ficam fora do repositório em `C:\Orçapro\.runtime\mysql-test-instance`, com acesso restrito ao usuário Windows atual e SYSTEM. Os valores privados não fazem parte das evidências versionadas.

As suites originais `multi-tenant-isolation` e `homologation-volume` passaram contra esse banco: duas suites e 23 testes, incluindo a separação dos dados operacionais da manutenção. Esse resultado verifica a candidata local, sem substituir a homologação do ambiente hospedado. Na build da API, foram conferidos `runtime.cjs`, manifesto e os 41 módulos preservados; todos os módulos coincidiram com os hashes do manifesto.

## Rollback

Desativar o gate servidor do OrçaPro e retornar as aplicações à revisão anterior compatível. O Gestão de Prédios segue usando suas rotas e tabelas. Manter as tabelas adicionais, referências SINAPI publicadas, versões e projetos; não apagar histórico nem desfazer DDL automaticamente. Restaurar banco somente mediante o plano de restauração revisado, quando necessário.

Não modificar as tabelas `SinapiCatalog` e `SinapiCatalogItem` da manutenção para acomodar o catálogo global. O OrçaPro tem catálogo próprio global com referência × UF × regime, enquanto projetos e adaptações privadas permanecem vinculados ao usuário e tenant autenticados.

## Evidências a registrar

- SHA da candidata e da API efetivamente servida;
- resultado do build estático e testes de isolamento/financeiros;
- hash do backup e resultado do ensaio de restauração;
- resultado de login e rotas atuais com gate fechado, API anterior e API nova;
- resultado de piloto OrçaPro e escopo das contas habilitadas;
- teste de desativação do gate e retorno à versão anterior.
