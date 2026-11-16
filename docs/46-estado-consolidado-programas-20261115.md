# Estado consolidado dos programas — 15/11/2026

> Atualização de 16/11: foi identificada publicação automática nativa da Hostinger após o merge de documentação, com regressão e posterior recuperação da interface de desenvolvimento. Consulte o [registro do incidente](48-incidente-interface-dev-20261116.md) antes de sincronizar ou publicar.

Este documento é o ponto de entrada para a rodada encerrada em 15/11/2026. Registra implementação e verificações realizadas; não substitui homologação de todos os cenários possíveis. Uma alteração documental não autoriza implantação, mas seu push pode acionar integrações externas; conferir os gatilhos antes de sincronizar.

## Produtos e ambientes

| Produto | Finalidade | Produção |
|---|---|---|
| OrçaPro | Orçamentos SINAPI, BDI, equipes, produtividade, cronograma, recursos e curva S | sistema.orcaproobras.com.br |
| OrçaPro Infraestrutura | Orçamentos SICRO e planejamento de infraestrutura | orcaproinfra.com.br |
| OrçaPro Gestão Contratual | Aditivos, reajustes, medições, pagamentos e acompanhamento contratual | orcaprogestaocontratual.com.br |
| Gestão de Prédios | Manutenção e ordens de serviço; não integra a oferta comercial dos três produtos | Desenvolvimento |

O desenvolvimento compartilhado usa gestaodepredios.com.br. A Gestão Contratual possui banco próprio em cada ambiente. Em produção possui também API e identidade próprias; a integração com os orçamentadores consulta dados autorizados sem gravar nas origens. Não copiar catálogos SINAPI/SICRO para o banco contratual.

## Entregas consolidadas

- SINAPI: atualização da referência para outubro de 2026 e revisão das árvores. Atualizar a referência padrão não atualiza automaticamente orçamentos existentes. O orçamento demonstrativo explicitamente solicitado recebeu revisão específica; preços históricos preservados são identificados como cotações.
- Interface da Gestão Contratual alinhada ao OrçaPro, com navegação lateral, planilhas analíticas e acesso pelo seletor de programas. Gestão de Prédios não aparece no seletor comercial de produção.
- Contratos por preço unitário medem itens da planilha; contratos globais medem eventos e exigem os respectivos critérios de aceite. Aditivos globais e reajustes repercutem no eventograma.
- Aditivos conservam acréscimos, supressões, novos serviços e quantitativos original/vigente. O paradigma e o desconto são explícitos; a parcela compensatória pode gerar retenção ou devolução em movimentos rastreáveis.
- Reajustes por índice, cesta e regras por item, além de reequilíbrio, preservam a referência temporal e os preços históricos de medições.
- Importação de medições passa por prévia e vínculo com itens/eventos. Exportações Excel/PDF e fluxos de aprovação/pagamento foram exercitados nos exemplos. Pagamento registrado no módulo não representa transferência bancária.
- Acompanhamento do Cronograma compara linha de base original, reprogramado e executado: curva S, Gantt, desvios, equipes e recursos. Revisões após aditivos não sobrescrevem a linha de base.
- Administração SaaS: acesso a contas existentes, cadastro, licença, sessões, auditoria e manual interativo. Gestor, fiscal e leitor são papéis contratuais, distintos de administrador SaaS.
- Produção: assinatura mensal de R$ 299 e anual de R$ 2.990, sem combo, condicionada à assinatura ativa do OrçaPro ou Infra. Desenvolvimento usa cobrança de teste. Webhook, clientes e dados contratuais são próprios.

## Última operação de acesso no desenvolvimento

Uma conta existente não possuía perfil de acesso na Gestão Contratual e pertencia a uma organização diferente da dos exemplos. O bloqueio ao cadastro duplicado era esperado: reutiliza-se a identidade, sem recriar usuário ou alterar sua senha.

Foi habilitada licença manual ativa no desenvolvimento. Com autorização expressa, foram criadas 11 cópias na organização destinatária, com proprietário/gestor, 169 movimentos históricos, três anexos e três importações. Não foi aberto acesso entre organizações. A reconstituição dos históricos conferiu os resumos financeiros das cópias e preservou os contratos originais.

Validação pela API: acesso habilitado, criação permitida, listagem e abertura dos 11 contratos, papel MANAGER e permissões de gerenciamento, medição, aprovação e pagamento. A conferência visual final com a sessão da conta destinatária permanece pendente; não deve ser declarada concluída. Nenhuma alteração em produção ocorreu nessa operação. Identidades, IDs e manifestos privados não integram este documento.

## Leitura técnica e operação

- [Modelo de dados](02-modelo-de-dados.md)
- [Contrato da API](04-contrato-api.md)
- [Banco independente e evolução em desenvolvimento](adr/0010-gestao-contratual-banco-independente.md)
- [Produção isolada e verificações](adr/0011-gestao-contratual-producao-isolada.md)

Os ADRs preservam histórico: restrições de entregas antigas não descrevem necessariamente a versão atual. Para produção, prevalece a decisão posterior do ADR 0011. Exemplos e testes não substituem conferência humana do paradigma, condições contratuais e documentos de suporte.

Backups, dumps, credenciais, arquivos de configuração reais, anexos de clientes e manifestos com identidades ficam fora do Git. Publicações devem selecionar arquivos explicitamente, nunca adicionar toda a pasta de trabalho. Alterações de documentação não autorizam migrations, reinícios ou implantação.

## Estado do repositório

Esta consolidação versiona documentação. Há código local da rodada ainda não versionado; portanto, a documentação de entregas em execução não constitui garantia de que o GitHub reproduz integralmente os runtimes publicados. O versionamento do código e a reconciliação de artefatos exigem uma entrega separada, com revisão e testes próprios. Nenhum código pendente foi incluído silenciosamente neste fechamento documental.

Atualização de versionamento: consulte a [revisão de código sem implantação](47-revisao-codigo-sem-implantacao-20261115.md). O código pendente está sendo consolidado em branch própria, sem promoção aos ambientes.
