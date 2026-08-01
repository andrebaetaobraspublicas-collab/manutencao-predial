# Segurança, LGPD e auditoria

Este documento é orientação técnica inicial e deve ser revisado por profissionais jurídicos e de segurança antes do lançamento.

## 1. Classificação de dados

| Classe | Exemplos | Controle |
|---|---|---|
| Público | página institucional e preços públicos | integridade e disponibilidade |
| Interno | cadastros genéricos, KPIs agregados | autenticação e tenant |
| Confidencial | contratos, notas fiscais, custos, penalidades | RBAC, download auditado e retenção |
| Pessoal | nome, e-mail, telefone, avaliações | finalidade, minimização e direitos do titular |
| Pessoal restrito | folha, férias, benefícios, saúde/segurança de terceirizados | acesso mínimo, criptografia e retenção específica |
| Segredo | senha, tokens, chaves Stripe, credenciais do banco | cofre/variáveis, mascaramento e rotação |

## 2. Controles obrigatórios antes da produção

- HTTPS integral;
- segredo JWT aleatório e rotacionável;
- hash de senha forte;
- refresh token rotativo e revogável;
- rate limiting de login, recuperação e endpoints caros;
- verificação de e-mail;
- recuperação de senha com token único, curto e em hash;
- política de senha e bloqueio contra abuso;
- proteção CSRF compatível com cookies e arquitetura de subdomínios;
- headers de segurança e CSP testada;
- validação de upload e antimalware;
- logs estruturados sem segredos;
- backups criptografados e restauração testada;
- atualizações de dependências e análise de vulnerabilidade;
- testes de autorização e multi-tenancy.

## 3. Isolamento por tenant

A principal ameaça de um SaaS multi-tenant é o acesso horizontal entre clientes. Regras:

- tenant deriva da sessão;
- toda busca por ID inclui tenant;
- downloads validam tenant, entidade e vínculo;
- relatórios e jobs carregam tenant explícito de contexto confiável;
- caches incluem tenant na chave;
- nomes de arquivo e URLs não constituem autorização;
- testes criam dois tenants e tentam cruzar todos os recursos.

## 4. RBAC inicial

| Papel | Síntese |
|---|---|
| OWNER | assinatura, organização e todos os controles |
| ADMIN | administração interna, sem propriedade comercial exclusiva |
| MANAGER | gestão operacional e cadastros |
| CONTRACT_MANAGER | contratos, valores, prazos e medições |
| CONTRACT_INSPECTOR | fiscalização, evidências, aceite e pendências |
| OPERATOR | execução de manutenção e atualização de OS |
| REQUESTER | abertura, acompanhamento e avaliação das próprias/permitidas |
| AUDITOR | leitura e exportação, sem alteração |

O MVP deve substituir verificações genéricas por matriz de capacidade granular e autorização por objeto.

## 5. Uploads

- lista positiva de extensão e MIME;
- validar assinatura do arquivo, não apenas cabeçalho enviado;
- nome físico aleatório;
- limite por arquivo, tenant e plano;
- armazenamento não executável;
- varredura antimalware antes de disponibilizar;
- PDF tratado como conteúdo potencialmente ativo;
- metadados de imagem avaliados para privacidade;
- download com `Content-Disposition` seguro;
- hash e auditoria.

## 6. Stripe

- não armazenar número de cartão;
- usar páginas/elementos do provedor;
- verificar assinatura do webhook com corpo bruto;
- processar eventos idempotentemente;
- registrar falhas sem guardar segredo;
- entitlement atualizado por evento confiável;
- reconciliar periodicamente assinatura local e Stripe;
- separar chaves teste e produção.

## 7. LGPD por design

- documentar finalidades e bases aplicáveis por operação;
- coletar somente dados necessários;
- informar controlador, operador e suboperadores conforme o contrato;
- permitir correção, exportação e eliminação quando juridicamente cabíveis;
- definir retenção por categoria;
- anonimizar dados para analytics e testes;
- registrar compartilhamentos e incidentes;
- avaliar relatório de impacto para módulos de terceirizados e analytics avançado;
- contratos devem disciplinar hospedagem, backups, suporte e suboperadores.

## 8. Auditoria

Eventos mínimos:

- login, logout, falha e recuperação;
- convite, papel, suspensão e acesso provisório;
- criação/alteração/exclusão lógica;
- mudança de status de OS, contrato e medição;
- download e exportação;
- reajuste, penalidade, empenho e pagamento;
- billing e mudança de plano;
- alteração de configuração de SLA/KPI.

Log de auditoria deve ser append-only pela aplicação comum, ter horário UTC, ator, tenant, entidade e resumo de antes/depois. Dados sensíveis devem ser minimizados.

## 9. Retenção sugerida para definição contratual

Não fixar períodos universais sem análise jurídica. O sistema deve suportar políticas por categoria e tenant, incluindo retenção legal de documentos contratuais e descarte de sessões, logs técnicos e anexos transitórios.

## 10. Resposta a incidentes

Plano mínimo:

1. detectar e classificar;
2. conter e preservar evidência;
3. rotacionar credenciais;
4. avaliar dados e titulares afetados;
5. comunicar responsáveis e autoridades quando aplicável;
6. recuperar serviço;
7. registrar causa, impacto e ações;
8. testar correções.
