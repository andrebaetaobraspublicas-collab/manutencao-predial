# Compilação do editor e CI — 16/11/2026

A falha `Unexpected token '<'` era causada pela delimitação do JavaScript no teste `sanitize-derived-html.spec.mjs`. O teste procurava o último fechamento de script antes do módulo de revisão. Com os scripts fiscais independentes nessa posição, o trecho incluía tags HTML entre blocos válidos de JavaScript.

O teste agora delimita o script principal pelo próprio fechamento e compila todos os blocos inline separadamente. Também exige que os módulos de revisão, riscos, manual e ponte com a nuvem sejam scripts independentes, fora dos templates de relatórios, preservando as verificações de ordem e sanitização existentes. Nenhum código do aplicativo foi alterado.

Passaram localmente os 34 testes da mesma etapa usada pela CI: ponte, sanitização, riscos, manual e preços de insumos compartilhados. A execução completa no GitHub será registrada após seu resultado final.

CI significa Integração Contínua: verificações automáticas de segurança, testes e compilação. Neste repositório a publicação é separada dessas verificações. A promoção automática `promote-hostinger-runtime.yml` foi conferida como `disabled_manually` antes da sincronização; a publicação Git nativa do frontend de desenvolvimento permanece desligada conforme o registro do incidente. Nenhuma publicação, alteração de banco, API ou configuração de desenvolvimento ou produção integra esta correção.
