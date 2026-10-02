# ADR 0007 — OrçaPro como produto adicional com catálogo SINAPI global

- Status: aceito para a migração solicitada pelo proprietário em 02/10/2026
- Contexto: integrar um segundo programa no domínio existente, preservando o SaaS de manutenção e os cálculos do HTML OrçaPlan.

O OrçaPro é um programa de orçamento de obras, independente do fluxo de OS de manutenção. Sua inclusão é explicitamente solicitada pelo proprietário. Mantemos NestJS/Next.js/MySQL/Prisma e a autenticação existente. Rotas de manutenção e seu catálogo SINAPI não mudam. O OrçaPro usa `/orcapro` e `/api/v1/orcapro`, tabelas adicionais e gate server-side de ativação.

SINAPI oficial é global: versões de referência, descrições, analíticos e preços não pertencem a tenants ou usuários. O preço é contextual por referência, UF e regime. Cada projeto privado pertence ao usuário e tenant autenticados e fixa a referência. A configuração padrão só governa projetos novos; referências publicadas são imutáveis e suas correções geram revisão. Nenhum preço único é mantido na composição.

OWNER/ADMIN do Gestão de Prédios não concedem administração global SINAPI. A concessão global OrçaPro é independente e conferida pelo servidor. Todas as rotas privadas filtram tenant e proprietário, inclusive exportação, versões e composições próprias. Cópias de exemplos/adaptações nunca duplicam o catálogo oficial.

Extração dos módulos legados conserva suas fórmulas e fixtures dos dois exemplos. Componentes ainda sem regressão comprovada não podem ser anunciados como migrados. Dinheiro usa DECIMAL no MySQL e cálculo exato em centavos/escalas, conservando truncagem e fallback sinalizado do original.

O frontend atual usa export estático na Hostinger: manter rotas estáticas, identificadores em query string e chamadas à API com cookies. A publicação se dá após testes e migrations verificadas; voltar ao commit anterior com o módulo desativado é o rollback operacional, sem apagar tabelas oficiais/históricas.
