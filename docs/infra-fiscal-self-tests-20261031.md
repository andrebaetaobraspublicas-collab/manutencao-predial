# Infraestrutura: premissas e verificações locais

Escopo da publicação: somente o OrçaPro Infraestrutura do desenvolvimento,
em www.gestaodepredios.com.br. Não há migração de banco nem alteração de preços,
usuários, orçamentos, SMTP ou produção.

A opção e a explicação da recuperação progressiva apareciam duas vezes porque
o transformador visual era chamado pelo motor e novamente pelo empacotamento.
A transformação agora normaliza suas próprias inserções antes de reaplicá-las.
O módulo já gerado também foi corrigido.

Os 38 resultados negativos do relatório anexado não demonstravam 38 defeitos
de cálculo. O adaptador filtrava o catálogo SICRO pela matriz de códigos SINAPI
e executava a suíte histórica SINAPI sobre o subconjunto vazio. A suíte exigia
27 UFs simultâneas, procurava composições como 89470 e comparava o catálogo com
4.876 registros de uma matriz histórica. Uma referência SICRO carrega a UF
selecionada e usa outros códigos. A comparação não era aplicável.

O botão de testes do Infraestrutura agora executa verificações próprias:

- Integridade da UF/data-base e presença dos insumos da referência ativa.
- Todos os custos publicados da referência carregada, com uma base isolada,
  sem DMT nem substituições de preço do projeto.
- Cenários numéricos isolados: doze exercícios, novas alíquotas, transição,
  anexos, combustíveis, depreciação progressiva em cada ano e parâmetros manuais.
- Conciliação em centavos entre serviços, ABC, IBS/CBS e série anual do orçamento.
- Diagnóstico explícito de crédito parcial: pendência cadastral não equivale a
  erro de software e continua identificada na memória tributária.
- Verificação de que os testes não modificaram o projeto nem o catálogo.

Os testes automatizados provocam erros reais de crédito e de custo publicado
e confirmam que a suíte os detecta. Também verificam que a transformação visual
é idempotente e que existe somente uma opção e uma explicação na interface.
As verificações do SINAPI permanecem independentes e não foram substituídas.

Comando: `node --test apps/infraestrutura/tests/fiscal-self-tests.test.cjs`.
