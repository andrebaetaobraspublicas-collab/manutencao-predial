# Rollback OrçaPro

Migration aditiva: nenhuma tabela ou registro da manutenção é alterado. Antes de publicar, aplicar em MySQL 8 limpo e cópia do schema migrado, validar checks/FKs e executar os testes de isolamento.

Rollback operacional: `ORCAPRO_ENABLED=false`, retornar os artefatos da aplicação à versão anterior e preservar as tabelas `Orcapro*`. Não remover referências históricas nem projetos. Nenhum seed OrçaPro faz parte do seed automático da manutenção.

Em banco de desenvolvimento vazio, a remoção das tabelas adicionais pode ser feita em ordem inversa das foreign keys. Esse procedimento não é autorizado para produção. Os índices FULLTEXT usam a collation já escolhida pelo banco; testes de pesquisa precisam verificar acentos na instalação alvo.
