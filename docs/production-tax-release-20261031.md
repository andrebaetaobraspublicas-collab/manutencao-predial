# Publicação tributária e testes internos — produção, 31/10/2026

Autorização: promover as últimas implementações do desenvolvimento nos dois
produtos. Código de origem: commit `34051c1`, com as alterações tributárias de
`5f75e7c`, correções SICRO de `b889806` e testes SINAPI de `5c3663c`/`34051c1`.

Destinos: sistema.orcaproobras.com.br / api.orcaproobras.com.br e
orcaproinfra.com.br / api.orcaproinfra.com.br. A página comercial
orcaproobras.com.br, o desenvolvimento, DNS, SMTP e planos Stripe não foram
modificados.

## Alterações promovidas

- Novos padrões CBS/IBS anuais, doze exercícios e parâmetros de BDI com redutor
  governamental padrão de 44,2%, preservando as configurações próprias salvas.
- Recuperação progressiva da depreciação e CBS específica dos combustíveis,
  incluindo a hipótese B15 de R$ 0,320975/L, conforme cenário solicitado.
- Correção da opção/explicação duplicada do Infraestrutura e testes próprios SICRO.
- Regressão histórica isolada do SINAPI, verificações atuais e avisos de recursos
  ausentes, com contagem separada de verificações não executadas.

## Operação e proteção dos dados

Backups consistentes dos três bancos foram criados antes da ativação, com
hashes dos registros de todas as tabelas. Os bancos não foram importados,
substituídos nem migrados. Nenhum usuário, projeto, versão, licença, assinatura
ou comunicado foi criado, alterado ou excluído pela publicação.

As APIs foram clonadas para novas versões privadas mantendo os dependentes e a
configuração existentes. No OrçaPro, somente sete arquivos de assets do motor
e dos testes foram substituídos; a integridade dos demais módulos foi conferida
contra o manifesto. No Infraestrutura, apenas o runtime do motor foi substituído.
As configurações foram comparadas por SHA-256 antes e depois.

No frontend, somente `orcapro-legacy` e `infraestrutura-editor`, nos respectivos
domínios, foram atualizados. Os builds usam as APIs de produção correspondentes.
Páginas de login, cadastro, administração e conteúdo comercial foram mantidas.
Assets anteriores com nome por hash foram retidos para abas já abertas.

Os backups, pacotes, hashes, versões anteriores e relatórios operacionais ficam
na pasta privada `production-tax-release-20261031` da conta de produção.

## Validação

- 30 testes automatizados aprovados antes da publicação.
- OrçaPro publicado: 154 verificações do motor aprovadas em contexto isolado,
  incluindo as 124 regressões históricas, com fixture pública validada por SHA-256.
- Infraestrutura publicado: 37 verificações aprovadas e 6.619/6.619 custos oficiais
  conferidos. Uma única opção e uma única explicação da depreciação progressiva.
- APIs prontas e editores públicos conferidos; configuração de produção preservada.
- Comparação posterior dos três bancos: todas as tabelas permaneceram idênticas
  aos snapshots anteriores, incluindo usuários, projetos, versões e assinaturas.

Os testes em produção usam dados de exemplo em memória. Não acessam nem salvam
orçamentos reais e não enviam e-mails.

## Retorno

Antes de haver cenários versão 8 salvos pelos usuários, é possível restaurar os
links das versões anteriores e os diretórios estáticos guardados, sem restaurar
bancos. Após uso da versão 8, preferir uma correção que mantenha a leitura desse
formato; não reverter cegamente para um motor antigo que desconheça o cenário.
Nunca restaurar um backup antigo sobre dados novos para reverter apenas código.
