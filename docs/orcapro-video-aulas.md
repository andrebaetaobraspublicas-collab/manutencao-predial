# Vídeo-aulas do OrçaPro

O menu **Vídeo-aulas** na área Meus orçamentos abre a biblioteca de treinamento.
A rota direta é `/orcapro/video-aulas/`; usa a sessão e o controle de acesso já
existentes do OrçaPro. A mesma navegação permite retornar aos projetos e ao catálogo.

No editor, **Manual e Vídeos → Vídeos tutoriais** oferece um segundo acesso à
mesma biblioteca, ao lado de **Teste seu entendimento**. A rota incorporada
`/orcapro/video-aulas/incorporado/` verifica o acesso OrçaPro e reutiliza
`VideoLessons`, sem duplicar catálogo, player ou downloads. O quadro ajusta sua
altura ao conteúdo, validando a origem e a janela das mensagens de redimensionamento.
O orçamento e o progresso de leitura do manual permanecem independentes dos vídeos.

As sete aulas disponibilizadas na pasta fornecida pelo proprietário em 15/10/2026
estão ordenadas de 01 a 07. Cada cartão oferece **Assistir**, que abre um único
player incorporado, e **Baixar**, que encaminha ao download do Google Drive.
O player também oferece um link para assistir diretamente no Drive, caso a
incorporação esteja indisponível. Arquivos grandes podem exigir confirmação do Google.

Fonte: https://drive.google.com/drive/folders/18V6DGPtssCl-rzh0gzBNQLf8PhIAb84i?usp=sharing

Os identificadores públicos, números das aulas e tamanhos estão em
`apps/web/src/app/orcapro/video-lessons.tsx`. Novas aulas devem ser acrescentadas
nessa relação; o botão da pasta sempre leva à coleção atualizada no Drive.
Não há sincronização automática, credenciais Google, cópia dos vídeos para a
hospedagem nem armazenamento adicional no banco de dados. As permissões e a
disponibilidade dos arquivos continuam sendo administradas pelo proprietário no Drive.

A implementação é somente de frontend, compatível com exportação estática.
Publicação solicitada exclusivamente em `www.gestaodepredios.com.br`;
produção comercial não é promovida neste trabalho. Rollback: retornar ao frontend
anterior, sem migrations ou alteração de usuários e orçamentos.
