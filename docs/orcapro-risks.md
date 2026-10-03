# OrçaPro — Riscos e contingências

O menu abaixo de Reforma Tributária cria análises privadas por orçamento, com Monte Carlo, histograma, curva acumulada, tornado, eventos de risco e aplicação da parcela Risco ao BDI principal. Usa fontes, tabelas, botões, cores e temas da interface existente. Não altera o programa de manutenção nem o catálogo global SINAPI.

## Motor e cálculo

O motor deriva de `C:\SistemaOrcamentoObras\saas\js\riscosEngine.js`, cujo SHA-256 original é `0f4776e997b0325d4da38392396f49f8bf413c76b59734dc2ce66d437f920a83`. A cópia instalada é `apps/api/src/modules/orcapro/risks/assets/engine.cjs`, versão de integração `orcapro-risk-1.0.0`. A única alteração interna padroniza Bernoulli em porcentagens: 0,5 significa 0,5%, e 1 significa 1%, em consonância com o VME. O adaptador também canoniza os extremos de uma distribuição fixa para seu valor provável, inclusive zero. Nenhum arquivo do sistema de origem nem do OrçaPlan original foi modificado.

- Serviços: variação percentual do custo direto de cada linha, selecionados por classe A, A+B ou orçamento completo. Classes ABC usam os custos diretos reais, sem BDI. A linha que cruza o limite fica na classe anterior; a primeira linha nunca desaparece da classe A.
- Todas as linhas permanecem na simulação. As não selecionadas ou excluídas ficam fixas, mantendo a base de cálculo e o denominador do orçamento completo. Não há extrapolação de A para o restante.
- Eventos: ocorrência Bernoulli e impacto monetário em reais. Serviços e eventos atribuídos à Administração ficam excluídos. Quantitativos em preço unitário exigem justificativa explícita. O tornado usa os mesmos filtros da simulação.
- Distribuições: uniforme, triangular, PERT beta, normal truncada, lognormal e fixa. Lognormal usa média e desvio aritméticos; mínimo e máximo são cenários do tornado, não limites de truncamento dessa distribuição. As variáveis são independentes, sem matriz de correlação.
- Contingência = max(0, custo do percentil escolhido − custo direto). O resultado é arredondado em centavos com Decimal antes de calcular a taxa. Monte Carlo utiliza Float64 para amostragem estatística; não substitui os cálculos financeiros autoritativos do orçamento. Valores monetários que excedem a precisão segura são recusados.
- A fotografia preserva custos unitários com frações de centavo, como o motor original, inclusive resíduos de conversão binária. Somente os totais de linha precisam ser centavos inteiros. Não arredonda o unitário antes de multiplicar a quantidade. Preços ausentes e valores inválidos geram mensagens distintas que identificam até cinco serviços.
- VME é a soma dos valores monetários esperados. RMS é a **raiz da média dos quadrados dos VME** incluídos, como no motor efetivamente executado na origem. É auxiliar e não tem nível de confiança; não é apresentado como P80, nem como raiz da soma dos quadrados.

O tornado mostra cenários extremos e ordena o maior impacto absoluto, conforme o motor de origem. Não é uma estimativa de correlação estatística. Parâmetros iniciais são hipóteses editáveis e precisam ser revistos pelo responsável pelo orçamento.

## Persistência e reprodução

`OrcaproProject.data.risks = {v:1, analyses: [...]}` aproveita os snapshots imutáveis existentes de `OrcaproProjectVersion`, sem alteração de schema. Cada análise armazena ID, nome, data UTC, versão do motor, versão de origem, referência × UF × regime, linhas/custos/quantidades, SHA-256 do contexto, premissas, semente, iterações, resumo e memória das aplicações ao BDI. Trata-se de fotografia das linhas do orçamento, nunca de cópia do catálogo SINAPI completo.

O servidor reconstrói a versão de origem usando a referência histórica e verifica o hash antes de executar a análise. Uma análise antiga pode ser reproduzida após mudança do orçamento. Aplicação ao BDI exige que o contexto atual ainda corresponda à fotografia; mudanças em custos, quantidades ou referência exigem nova análise. Alterar premissas invalida o resultado anterior, que continua no histórico de versões.

O campo `risks` é gerenciado pelas rotas específicas; o PUT geral de orçamento não aceita sua adulteração. Restauração de versão histórica preserva as análises daquela versão. Clonagem/importação como novo orçamento remove análises vinculadas a versões do orçamento original; crie uma nova fotografia. O arquivo exportado e o histórico original continuam preservados.

## BDI

A prévia e a aplicação reexecutam o modelo no servidor; não confiam em taxa ou resultado enviados pelo navegador. Usa a fórmula existente para Paramétrico, Exato ou Simples Nacional, os demais parâmetros do menu BDI e seu arredondamento. Substitui a parcela Risco por padrão; soma exige confirmação expressa de parcelas distintas. Não soma a taxa de risco diretamente ao BDI final.

Confirmação requer justificativa. A mesma transação guarda nova versão, configuração anterior completa, risco anterior/novo, BDI anterior/novo, preço anterior/novo e autoria/auditoria. O BDI diferenciado permanece separado. Relatório HTML imprimível e CSV são downloads locais do resultado salvo, sem armazenamento público.

## Segurança e limites

Rotas passam por autenticação, habilitação/licença OrçaPro, Origin, UUID, tenant e proprietário do orçamento. Ser administrador global não dá acesso a orçamento operacional de outro proprietário. Toda mutação exige `expectedVersion`. Auditoria: `risk.create`, `risk.configure`, `risk.simulate`, `risk.bdi.apply`, além do snapshot normal do projeto.

Limites: 1–1.000 linhas com custos preenchidos; 20 análises por orçamento; 100 eventos; 1.000–100.000 iterações; 10 milhões de sorteios por execução; 100 aplicações por análise. Worker dedicado com 96 MiB e prazo de 30 segundos; quatro execuções simultâneas por processo e uma por usuário. Workers não executam arquivos de usuários. Não há exclusão física de análises salvas.

## Verificação e rollback

Testes unitários cobrem determinismo, probabilidades pequenas, base completa com escopo A/AB, exclusões, zero fixo, eventos, RMS, Decimal, fingerprint e limites. Integração HTTP com MySQL isolado cobre tenant/proprietário, Origin, conflito de versão, rejeição de adulteração, três métodos BDI, dupla contagem, auditoria e reprodução histórica.

Rollback: republicar a versão anterior de frontend e API. Não há migration nem mudança em tabelas existentes; os documentos versionados continuam preservados. A versão anterior ignora o novo campo JSON. Não apagar snapshots ou auditorias no rollback.
