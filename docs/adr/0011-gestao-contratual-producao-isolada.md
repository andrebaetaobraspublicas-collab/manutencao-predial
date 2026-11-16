# ADR 0011 — Gestão Contratual em produção isolada

Data: 15/11/2026. Situação: aprovada pelo responsável do produto e implantada.

## Contexto e decisão

A Gestão Contratual passa a operar em `https://www.orcaprogestaocontratual.com.br`, com API em `https://api.orcaprogestaocontratual.com.br`. A autorização de implantação não abrange alterações operacionais, migrations ou reinícios do OrçaPro e do OrçaPro Infraestrutura existentes. Em 15/11/2026 foi autorizada especificamente a atualização da rota `/programas/` desses dois frontends, para retirar Gestão de Prédios e acrescentar Gestão Contratual.

O ponto de entrada `main-gestao.ts` usa `GestaoAppModule`, separado do `AppModule` compartilhado. A configuração `GESTAO_STANDALONE=true` exige o host de produção autorizado e o banco próprio `<conta-hostinger>_gestao_live`. Identidade, sessões, licenças, contratos, movimentações, auditoria, anexos privados e eventos de cobrança ficam nessa instalação. Nenhum controlador operacional dos outros produtos é registrado.

## Integração e identidade

`GcSourceIdentity` relaciona usuário/tenant local ao usuário/tenant de cada origem. No primeiro acesso, a API verifica senha e assinatura ativa de uma origem antes de criar a identidade local. Assinatura em teste não satisfaz o requisito comercial. Senhas e sessões posteriores são independentes; nenhuma alteração local escreve na origem.

Os adaptadores `ContractSources` usam clientes Prisma que recusam operações de escrita e SQL com transação `READ ONLY`. As conexões de origem têm pools pequenos. Orçamentos são capturados por versão/hash, com verificação de propriedade. A fotografia comprimida é imutável e compartilhada entre contratos que usam a mesma origem, evitando copiar os catálogos globais. O administrador configurado pode consultar seus exemplos sem comprar uma licença adicional.

## Comercial e cobrança

Plano mensal de R$ 299 e anual de R$ 2.990, sem combo. Checkout e licença operacional exigem assinatura ativa do OrçaPro **ou** do Infra. Não há cadastro público avulso em produção: a rota de cadastro é recusada pela API e a interface direciona ao acesso com conta existente.

Produto Stripe de produção próprio, dois preços recorrentes em BRL e portal próprio. Um cliente Stripe exclusivo por identidade local evita operar assinaturas dos outros produtos. O webhook possui segredo independente, valida assinatura e ambiente, ignora clientes desconhecidos, restringe preços ao produto e registra eventos idempotentes. Não se alteram preços, webhooks ou configurações dos produtos existentes.

Identificadores de implantação (não são credenciais): produto `<identificador-configurado>`; preços mensal `<identificador-configurado>` e anual `<identificador-configurado>`; webhook `<identificador-configurado>`; portal `<identificador-configurado>`.

O WordPress comercial recebe somente o plugin isolado `deploy/marketing/orcapro-gestao-comercial.php`. Ele acrescenta o quadro abaixo dos planos existentes e o acesso no menu, sem modificar os combos. Os botões vão ao login e à escolha autenticada de plano, não a um link de pagamento que dispense a verificação de elegibilidade.

## Dados, capacidade e operação

A migração 006 cria o vínculo de identidade no banco próprio. A primeira instalação inicializa o schema de identidade e as migrations contratuais em banco vazio; o procedimento recusa banco não vazio. As tabelas dos módulos não carregados permanecem vazias. Foram criadas três fotografias demonstrativas privadas pela interface: edifício de quatro pavimentos por preço unitário/global (282 serviços, 85 registros de eventos) e rodovia SICRO (64 serviços positivos). Essas três capturas iniciais foram preservadas na importação integral dos exemplos, descrita abaixo.

Anexos ficam fora de `public_html`, com autorização por tenant e cota inicial de 100 MiB por organização. A leitura de informações de capacidade é estimativa de dados e índices; arquivos, backups e espaço físico são controles distintos. O banco novo ocupava aproximadamente 8,75 MiB após as três capturas. O aumento de contratação deve ser acompanhado pelo painel de capacidade e pela hospedagem.

A recuperação de senha usa SMTP com TLS validado e configuração privada da nova aplicação. A credencial existente do remetente foi copiada sem alterar a conta SMTP ou as configurações dos outros sistemas. A verificação de conexão não envia mensagens.

## Validação

### Importação integral de exemplos e troca de programa — 15/11/2026

Por solicitação expressa, os 21 contratos de demonstração/QA do banco de desenvolvimento foram copiados para o banco próprio de produção: 12 ativos e 9 já arquivados. Foram preservados 217 movimentos, 76 auditorias administrativas, 8 anexos e 7 importações confirmadas, com suas fotografias, datas, versões, planilhas e referências entre operações. O replay dos 21 contratos com o motor instalado em produção produziu o mesmo hash de estado e os mesmos totais do desenvolvimento. Os serviços da API também conferiram planilhas, anexos e cronogramas dos 12 ativos. As três capturas originais de produção permanecem intactas.

Todos os registros importados são marcados como demonstração e pertencem à organização administrativa local de André Baeta. IDs dos contratos e movimentos são preservados; o namespace de cenário `DEV_IMPORT_<id>` impede colisões com capturas novas. As fotografias repetidas são reaproveitadas por produto/projeto/versão/hash. Anexos têm integridade SHA-256 conferida e são armazenados privadamente, com reaproveitamento de conteúdo. A auditoria `example.imported` registra o hash do lote, origem, proprietário e atores históricos. Os membros de teste são preservados como proveniência, sem conceder acessos. Não são importados usuários, senhas, licenças, clientes Stripe ou configurações de desenvolvimento.

O lote é idempotente: uma repetição reconhece os registros já importados e não reescreve históricos. O backup anterior é `hbuilds/backups/before-examples-20261115.sql.gz`, na API exclusiva. Manifesto e verificações ficam em `hbuilds/staging/access-examples-20261115`, fora da área pública. O rollback operacional é arquivar somente os IDs do manifesto, com auditoria, sem excluir fisicamente contratos ou restaurar um dump por cima de atividade posterior. Após a cópia, o banco tinha cerca de 15,6 MiB de dados e índices; os arquivos privados deste lote somavam aproximadamente 299 KiB.

A navegação de produção agora lista OrçaPro, Infra e Gestão Contratual. Gestão de Prédios continua restrito aos hosts de desenvolvimento. Os links entre domínios não transportam tokens: cada produto valida sua própria sessão. Nos frontends de origem, só `/programas/` e novos arquivos estáticos imutáveis foram publicados; 394 arquivos existentes do OrçaPro e 503 do Infra foram conferidos como preservados. As personalizações de cor existentes foram reutilizadas, sem sobrescrever CSS compartilhado. Backups da rota e manifestos anteriores ficam em `.deployment-backups/access-examples-20261115` em cada domínio. Nenhuma API de origem foi reiniciada.

As telas `/programas/` foram conferidas com as sessões reais existentes nos três domínios, incluindo os links administrativos locais. A conta fictícia criada exclusivamente no banco da Gestão Contratual, sem vínculo de assinatura de origem, teve os contratos e o checkout mensal/anual bloqueados pela interface; uma tentativa direta de checkout também recebeu 403 antes de criar cliente Stripe. A conta foi suspensa e suas sessões revogadas após o teste, preservando a auditoria. O acesso administrativo de André foi conferido, mas sua isenção não substitui a validação comercial com uma conta comum assinante.

Em seguida, duas contas comuns fornecidas pelo usuário concluíram o primeiro login pela interface: uma vinculada exclusivamente ao OrçaPro e outra exclusivamente ao Infra. A auditoria local confirmou a replicação de identidade com `sourceWrites:false`. A primeira abriu o checkout LIVE mensal de R$ 299; a segunda, o anual de R$ 2.990. Nenhum dado de cartão ou autorização de pagamento foi enviado. Ambos os checkouts foram expirados ao terminar; a consulta Stripe confirmou `expired`, `unpaid`, assinatura nula e ausência de PaymentIntents e assinaturas para os dois novos clientes exclusivos da Gestão Contratual. O acesso aos contratos permaneceu bloqueado enquanto não havia licença do novo produto. Os acessos, licenças e orçamentos das origens foram preservados.

Na comparação posterior, os hashes de projetos, assinaturas, acessos e vínculos das origens permaneceram iguais; o registro `User` do administrador apresentou datas recentes de login/atualização durante a navegação concorrente. Não se reverte metadado de autenticação nem atividade do usuário para forçar igualdade de snapshots. Configurações e runtimes das duas APIs permaneceram iguais. A nova integração utiliza somente leitura nas origens. A validação em produção não incluiu confirmação de pagamento ou ativação de assinatura paga, conforme a restrição expressa de não cobrar.

Builds da API/web e TypeScript aprovados. A execução geral da API teve 518 testes aprovados e um timeout de hashing; a repetição focada das suítes SaaS/produção passou nos 30 casos. A integração local verificou identidades independentes, bloqueio de origem não assinante, isolamento de sessão/senha e ausência de escrita nas origens.

Na implantação, foram conferidos login real administrativo, captura dos dois produtos pela interface, totais dos 628 serviços das três cópias, cronograma de origem, planos ativos, bloqueio de acesso anônimo/cadastro avulso, assinatura inválida de webhook, rejeição de modo TEST e repetição de eventos de clientes alheios. Os eventos de diagnóstico não criaram licença ou registro financeiro. A conferência visual identificou e corrigiu o link de retorno ao orçamento, que precisa usar o domínio da origem em produção, e a formatação dos valores dos planos.

Os dois Checkouts LIVE abriram no navegador com R$ 299/mês e R$ 2.990/ano. As sessões de diagnóstico não receberam e-mail, cartão ou dados de cliente; foram expiradas após a conferência e não criaram cliente ou assinatura. Não houve cobrança real nem ativação de assinatura paga durante a validação. A primeira contratação real deve seguir o Checkout normal e será habilitada pelo webhook assinado; os fluxos financeiros completos já haviam sido exercitados no ambiente de teste.

A conferência final preservou os hashes das configurações e os runtimes dos dois produtos existentes, além dos 30 orçamentos OrçaPro e do exemplo original da rodovia. Uma cópia de trabalho da rodovia apresentou versões e restaurações concorrentes registradas no próprio Infra durante a implantação; ela não foi usada nas capturas nem recebeu escrita desta tarefa. Não se restaurou esse projeto, para preservar a atividade concorrente. Ambos os serviços existentes responderam HTTP 200. Os dois webhooks anteriores permaneceram ativos com suas versões e seis eventos cada.

## Publicação e rollback

### Conferência pela interface em cópias de produção — 15/11/2026

Foram criadas quatro cópias privadas, identificadas como `QA Produção`, dos cenários unitário analítico, global, rodovia SICRO e reprogramação unitária. Fotografias e arquivos privados existentes foram reutilizados; contratos e ações receberam novos IDs, com remapeamento das referências internas e auditoria `qa.copy`. O replay antes das operações conferiu valores e históricos integrais; hashes de escopo das revisões foram recalculados para os novos IDs dos aditivos. Backup privado das linhas originais e manifestos em `hbuilds/staging/ui-examples-20261115`.

Com a sessão administrativa real, foram conferidas planilhas de aditivos, reajustes, medições, retenções/restituições, curva S, Gantt, recursos e revisões. Na cópia unitária, aprovou-se o BM06 e registrou-se pagamento fictício de R$ 112.973,17. O BM04 rejeitou R$ 187.627,89, um centavo acima do saldo, sem gravar ação; depois recebeu pagamento parcial fictício de R$ 10.000,00. Na cópia global, um reajuste de 5% foi aplicado a 71 eventos (valorização R$ 3.512.097,42); dez eventos geraram medição de R$ 320.274,22, aprovada com aceite explícito e quitada ficticiamente. A medição histórica anterior manteve o bruto original. Na rodovia, o novo aditivo alterou 30 serviços, com acréscimos de R$ 174.027,91, supressões de R$ 59.851,76 e conciliação explícita de R$ -0,01; total final R$ 35.286.514,57. Os dois boletins e pagamentos históricos da rodovia permaneceram iguais.

O cenário de cronograma preservou o término original em 04/08/2027, a revisão em 26/11/2027 e o término informado em 20/11/2027. O filtro mostrou dois serviços com desvios de 10 e 44 dias frente à revisão. A alternância para a linha de base original retirou os indicadores da revisão sem modificar registros. O cronograma da rodovia apresentou os 64 serviços e recursos da fotografia SICRO, distinguindo ausência de apontamento físico de medição financeira.

Corrigido no frontend exclusivo: a recarga após uma ação agora mantém o boletim afetado/selecionado, evitando trocar para o último boletim cancelado. A criação de uma nova medição continua abrindo o novo rascunho. Regressão funcional cobre aprovação e pagamento de boletim anterior; 38 testes de frontend, lint do arquivo alterado e build passaram. A infraestrutura de teste foi atualizada para o helper de host e o componente de vínculo de origem já existentes. Reteste publicado confirmou a seleção do BM04 após pagamento e o saldo de R$ 177.627,88.

Conferência final por serviço e SHA-256 confirmou contratos, ações e anexos originais intactos. Os lançamentos novos ocorreram exclusivamente nas cópias do banco próprio. Nenhuma chamada Stripe, conexão aos bancos de origem ou reinício de API foi necessário. Configurações e runtimes de OrçaPro e Infra conferidos sem alteração. Backup do frontend em `.deployment-backups/access-examples-20261115-ui-qa`; 149 arquivos fora das rotas publicadas foram preservados. Para retirar os ensaios, arquivar somente os quatro IDs do manifesto com auditoria; não restaurar um dump sobre atividade posterior.

Runtime próprio: `api.orcaprogestaocontratual.com.br/hbuilds/versions/gestao-production-20261115/nodejs`. Configuração privada em `hbuilds/config/.env`; arquivos em `hbuilds/private-files`. Somente processos com nome **e diretório de trabalho** dentro desse domínio podem ser reiniciados. Não executar scripts de deploy globais ou reiniciar processos por usuário.

Backup inicial da página e referência ao runtime anterior em `orcaprogestaocontratual.com.br/.deployment-backups/20261115`. Para rollback, restaurar somente o ponteiro e páginas desse domínio; preservar banco, arquivos e auditoria. Não reexecutar a inicialização nem apagar tabelas. A migração 006 é aditiva e pode permanecer sem uso.

Cópia privada do banco após a implantação em `api.orcaprogestaocontratual.com.br/hbuilds/backups/launch-20261115.sql.gz`, obtida por transação consistente, sem bloqueio das tabelas. As páginas finais foram verificadas por SHA-256 (125 arquivos) antes da liberação.

Para retirar a oferta comercial, mover apenas `orcapro-gestao-comercial.php` para diretório privado e atualizar o cache da página inicial. Caso seja necessário suspender recebimento de eventos, desativar somente o webhook novo, preservando registros e segredos; não excluir o produto, os preços ou assinaturas existentes. Não executar rollback de bancos ou aplicações de origem.
