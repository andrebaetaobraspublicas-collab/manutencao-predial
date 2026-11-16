# Perfil de build comercial do Infraestrutura

Para `orcaproinfra.com.br`, usar `NEXT_PUBLIC_ORCAPRO_ONLY=false` e `NEXT_PUBLIC_API_URL=https://api.orcaproinfra.com.br/api/v1`. Se `VITE_API_BASE` ou `NEXT_PUBLIC_API_BASE` estiverem definidos, devem apontar para a mesma API.

O perfil exclusivo do OrçaPro (`NEXT_PUBLIC_ORCAPRO_ONLY=true`) bloqueia o iframe SICRO e pula a geração do bundle Infraestrutura. O build agora rejeita essa combinação na produção do Infraestrutura e rejeita origens divergentes, antes de alterar os arquivos do editor.

Para hotfix do bundle SICRO, preservar o wrapper funcional e substituir apenas `infraestrutura-editor`, com backup reversível. Nenhuma importação de dados, migration ou seed é necessária para essa correção de publicação.
