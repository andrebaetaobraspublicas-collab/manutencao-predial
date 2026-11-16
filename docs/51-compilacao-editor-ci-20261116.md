# Compilação do editor e CI — 16/11/2026

A falha `Unexpected token '<'` era causada pela delimitação do JavaScript no teste `sanitize-derived-html.spec.mjs`. O teste procurava o último fechamento de script antes do módulo de revisão. Com os scripts fiscais independentes nessa posição, o trecho incluía tags HTML entre blocos válidos de JavaScript.

O teste agora delimita o script principal pelo próprio fechamento e compila todos os blocos inline separadamente. Também exige que os módulos de revisão, riscos, manual e ponte com a nuvem sejam scripts independentes, fora dos templates de relatórios, preservando as verificações de ordem e sanitização existentes. Nenhum código do aplicativo foi alterado.

Passaram localmente os 34 testes da mesma etapa usada pela CI: ponte, sanitização, riscos, manual e preços de insumos compartilhados.

A [CI 43801374048](https://github.com/andrebaetaobraspublicas-collab/manutencao-predial/actions/runs/43801374048), referente ao commit `b13ba59`, terminou com resultado **success**. Passaram segurança, lint, testes da API, importação SICRO, motor e ponte do Infra, integração e volume, build, exportação estática e todos os testes do editor OrçaPro. A evidência de homologação foi anexada à execução. Este resultado encerra também a pendência registrada no documento 50.

CI significa Integração Contínua: verificações automáticas de segurança, testes e compilação. Neste repositório a publicação é separada dessas verificações. A promoção automática `promote-hostinger-runtime.yml` foi conferida como `disabled_manually` antes da sincronização; a publicação Git nativa do frontend de desenvolvimento permanece desligada conforme o registro do incidente. Nenhuma publicação, alteração de banco, API ou configuração de desenvolvimento ou produção integra esta correção.
