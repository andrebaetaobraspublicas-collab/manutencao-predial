'use client';

import {
  BookOpenCheck,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  ExternalLink,
  Lightbulb,
  ListChecks,
  Search,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

type ManualStep = { title: string; description: string };
type ManualDetail = { title: string; description: string };
type ManualTopic = {
  id: string;
  category: string;
  title: string;
  summary: string;
  purpose: string;
  audience: string;
  route?: string;
  routeLabel?: string;
  keywords: string[];
  steps: ManualStep[];
  details: ManualDetail[];
  tips?: string[];
  warning?: string;
  result: string;
};

const TOPICS: ManualTopic[] = [
  {
    id: 'inicio-rapido',
    category: 'Primeiros passos',
    title: 'Início rápido e lógica do sistema',
    summary: 'Entenda a sequência recomendada de implantação e como os módulos se relacionam.',
    purpose: 'Preparar a organização para operar sem cadastros isolados ou informações duplicadas.',
    audience: 'Todos os usuários, especialmente proprietários, administradores e gestores.',
    route: '/dashboard',
    routeLabel: 'Abrir visão gerencial',
    keywords: ['começar', 'primeiro acesso', 'fluxo', 'implantação', 'ordem de serviço', 'os'],
    steps: [
      { title: 'Configure a organização', description: 'Revise usuários, papéis, especialidades, categorias, prioridades, SLA e checklists antes de iniciar a operação.' },
      { title: 'Cadastre a estrutura básica', description: 'Inclua edificações, fornecedores, fiscais e contratos. Esses registros serão oferecidos nos demais formulários.' },
      { title: 'Centralize a execução na OS', description: 'Abra a ordem de serviço para toda demanda de manutenção. Orçamentos, evidências, checklists, contratos e medições convergem para ela.' },
      { title: 'Acompanhe e feche o ciclo', description: 'Trate pendências, conclua a execução, obtenha o aceite, consolide a medição e acompanhe KPIs e relatórios.' },
    ],
    details: [
      { title: 'Regra central', description: 'A ordem de serviço é o agregado operacional do sistema. Evite controlar serviços apenas por observações de contrato, planilhas externas ou comentários avulsos.' },
      { title: 'Ordem de cadastro recomendada', description: 'Configuração operacional → edificações → fornecedores e fiscais → contratos → planos de manutenção → ordens de serviço → orçamento → medição.' },
      { title: 'Dados de demonstração', description: 'Os registros fictícios existentes servem à homologação. Identifique-os antes do uso produtivo e remova-os de forma controlada.' },
    ],
    tips: ['Use a Visão gerencial diariamente para localizar backlog, prazos vencidos e contratos que exigem atenção.', 'Abra o manual em uma segunda aba e use os atalhos de cada tópico enquanto executa o procedimento.'],
    result: 'Organização pronta para registrar demandas com rastreabilidade desde a abertura até a medição.',
  },
  {
    id: 'visao-gerencial',
    category: 'Operação',
    title: 'Visão gerencial e leitura dos indicadores',
    summary: 'Interprete backlog, SLA, mapa, contratos e recortes analíticos do painel inicial.',
    purpose: 'Transformar os dados operacionais em uma rotina objetiva de priorização.',
    audience: 'Gestores, fiscais, administradores e equipes de manutenção.',
    route: '/dashboard',
    routeLabel: 'Abrir visão gerencial',
    keywords: ['dashboard', 'painel', 'mapa', 'backlog', 'indicadores', 'sla'],
    steps: [
      { title: 'Leia os cartões superiores', description: 'Confira backlog total, novas OS, pendências, violações de SLA, fechamentos e contratos próximos do vencimento.' },
      { title: 'Examine o mapa', description: 'Use os marcadores para localizar edificações e comparar a concentração de demandas. O número do marcador representa o backlog do imóvel.' },
      { title: 'Priorize os recortes', description: 'Analise idade, edificação, fornecedor e contrato. Comece por SLA vencido, pendência expirada e serviços críticos.' },
      { title: 'Acesse a origem', description: 'Abra a lista ou o registro relacionado antes de tomar uma decisão; os cartões são resumos e não substituem o dossiê.' },
    ],
    details: [
      { title: 'Backlog', description: 'Conjunto de ordens ainda não encerradas. Uma quantidade baixa não garante qualidade: confira idade, prioridade e reaberturas.' },
      { title: 'SLA vencido', description: 'Indica que o prazo configurado foi ultrapassado. Registre a causa, a pendência e a atuação adotada, quando aplicável.' },
      { title: 'Execução contratual', description: 'Compara valor vigente, medido, pago e saldo. Divergências devem ser investigadas no contrato, nos empenhos e nas medições.' },
    ],
    tips: ['Faça uma reunião curta de backlog usando sempre os mesmos recortes.', 'Cadastros sem coordenadas confirmadas podem não aparecer corretamente no mapa.'],
    result: 'Fila de trabalho priorizada com base em prazo, criticidade e impacto contratual.',
  },
  {
    id: 'ordens-servico',
    category: 'Operação',
    title: 'Ordens de serviço: da abertura ao fechamento',
    summary: 'Registre, execute, documente, conclua e, quando necessário, reabra uma demanda.',
    purpose: 'Manter em um único dossiê tudo o que comprova a execução do serviço.',
    audience: 'Demandantes, operadores, gestores, fiscais e fornecedores autorizados.',
    route: '/ordens-servico',
    routeLabel: 'Abrir ordens de serviço',
    keywords: ['os', 'ordem', 'serviço', 'foto', 'pendência', 'checklist', 'fechamento', 'reabertura'],
    steps: [
      { title: 'Abra a OS', description: 'Informe edificação, local, título objetivo, descrição do problema, prioridade, categoria e fotos iniciais quando disponíveis.' },
      { title: 'Faça a triagem', description: 'Defina responsável, fornecedor, contrato principal, prazo e critérios operacionais. Confirme se a prioridade corresponde ao impacto real.' },
      { title: 'Registre a execução', description: 'Inclua comentários, evidências antes/durante/depois, respostas de checklist, materiais, solução e custos.' },
      { title: 'Trate impedimentos', description: 'Abra uma pendência com motivo, responsável e prazo quando a execução estiver bloqueada. Resolva-a antes da conclusão.' },
      { title: 'Conclua e obtenha aceite', description: 'Revise evidências obrigatórias, orçamento final, solução e checklist. O aceite torna a OS elegível à medição.' },
      { title: 'Reabra com justificativa', description: 'Se o problema persistir, use a reabertura e explique a causa. O histórico anterior permanece preservado.' },
    ],
    details: [
      { title: 'Fotos e documentos', description: 'Anexe somente evidências pertinentes e sem dados pessoais desnecessários. Os arquivos são privados e baixados por rota autenticada.' },
      { title: 'Comentários', description: 'Use comentários para fatos operacionais. Decisões de status, custos e prazos devem ser registradas nos campos próprios.' },
      { title: 'Checklist', description: 'Itens obrigatórios precisam ser respondidos antes do fechamento. Uma nova resposta não apaga as anteriores.' },
      { title: 'Número da OS', description: 'É gerado sequencialmente por organização e ano; utilize-o em comunicações, diários, medições e pesquisas.' },
    ],
    warning: 'Não encerre uma OS apenas para retirar o item do backlog. O fechamento exige solução comprovada e aceite compatível com o perfil do usuário.',
    result: 'Serviço encerrado com histórico, evidências, custos e responsabilidades verificáveis.',
  },
  {
    id: 'edificacoes',
    category: 'Cadastros',
    title: 'Edificações, localização, documentos e vistorias',
    summary: 'Mantenha o dossiê patrimonial e relacione o imóvel à manutenção e aos contratos.',
    purpose: 'Criar a referência territorial e documental de todas as demandas da organização.',
    audience: 'Administradores, gestores patrimoniais, responsáveis técnicos e operadores autorizados.',
    route: '/edificacoes',
    routeLabel: 'Abrir edificações',
    keywords: ['prédio', 'imóvel', 'mapa', 'endereço', 'vistoria', 'laudo', 'documento', 'foto'],
    steps: [
      { title: 'Cadastre a identificação', description: 'Informe código, nome, tipo, situação, endereço completo e características físicas relevantes.' },
      { title: 'Confirme a localização', description: 'Busque o endereço, confira ruas e referências no mapa, ajuste o marcador se necessário e confirme as coordenadas.' },
      { title: 'Organize o acervo', description: 'Classifique PDFs como laudo de inspeção ou documentação do imóvel e envie fotografias em seus campos próprios.' },
      { title: 'Registre vistorias', description: 'Informe data, tipo, responsável técnico, equipe e observações. A última vistoria é derivada do histórico.' },
      { title: 'Consulte a manutenção', description: 'Na edição da edificação, confira os planos preventivos associados, próximas execuções e OS geradas.' },
    ],
    details: [
      { title: 'Georreferenciamento', description: 'A localização somente é considerada confiável depois da confirmação. Coordenadas manuais devem ser verificadas antes de salvar.' },
      { title: 'Arquivamento', description: 'Somente administradores podem arquivar uma edificação. Antes da ação, o sistema apresenta contratos, OS e planos potencialmente afetados.' },
      { title: 'Documentos', description: 'Nomes originais são preservados para exibição; o armazenamento interno utiliza chave segura e isolada por organização.' },
    ],
    tips: ['Adote um padrão de código patrimonial curto e permanente.', 'Atualize a vistoria quando houver mudança relevante de estado, risco ou ocupação.'],
    result: 'Imóvel localizável, documentado e conectado ao seu histórico de manutenção.',
  },
  {
    id: 'fornecedores-fiscais',
    category: 'Cadastros',
    title: 'Fornecedores, consórcios e fiscais',
    summary: 'Cadastre quem executa e quem fiscaliza, com especialidades e vínculos consistentes.',
    purpose: 'Evitar digitação repetida e permitir análises por contratado e por responsável.',
    audience: 'Administradores, gestores de contratos e equipes de cadastro.',
    route: '/fornecedores',
    routeLabel: 'Abrir fornecedores',
    keywords: ['fornecedor', 'consórcio', 'cnpj', 'especialidade', 'fiscal', 'gestor'],
    steps: [
      { title: 'Cadastre especialidades', description: 'Crie previamente as categorias em Configuração operacional. Elas abastecem a seleção de áreas de atuação.' },
      { title: 'Inclua o fornecedor', description: 'Informe tipo, razão social, CNPJ/CPF, endereço, contatos, áreas de atuação e observações.' },
      { title: 'Monte o consórcio', description: 'Selecione o tipo consórcio e vincule cada empresa integrante, mantendo os dados próprios de cada participante.' },
      { title: 'Registre sanções', description: 'Inclua fundamento, período, situação e descrição, sem substituir o processo administrativo de origem.' },
      { title: 'Cadastre fiscais', description: 'Informe matrícula, formação, registro profissional, especialidade, disponibilidade e portaria de designação.' },
    ],
    details: [
      { title: 'Áreas de atuação', description: 'São relacionais e podem ser múltiplas. Se a lista estiver vazia, verifique as categorias ativas na configuração operacional.' },
      { title: 'Fornecedor x usuário', description: 'Fornecedor é uma entidade contratada; usuário é uma pessoa com credencial de acesso. Um cadastro não cria automaticamente o outro.' },
      { title: 'Fiscal x equipe do contrato', description: 'O cadastro de fiscal forma a biblioteca de profissionais. A equipe de fiscalização é a designação desse profissional em um contrato específico.' },
    ],
    result: 'Cadastros reutilizáveis e disponíveis para contratos, OS, fiscalização e relatórios.',
  },
  {
    id: 'contratos',
    category: 'Contratos',
    title: 'Contratos e dossiê de fiscalização',
    summary: 'Controle vigência, valor, equipe, ocorrências e documentos em um dossiê integrado.',
    purpose: 'Concentrar os atos da execução contratual e seus reflexos operacionais e financeiros.',
    audience: 'Gestores, fiscais, administradores, auditores e áreas financeiras.',
    route: '/contratos',
    routeLabel: 'Abrir contratos',
    keywords: ['contrato', 'aditivo', 'apostila', 'garantia', 'sanção', 'subcontratação', 'recebimento', 'diário', 'pleito'],
    steps: [
      { title: 'Cadastre o contrato-base', description: 'Informe processo de origem, objeto, fornecedor, regime, natureza, vigência, valor original, data-base e edificações abrangidas.' },
      { title: 'Abra o dossiê', description: 'Clique na linha do contrato. Use o Resumo para conferir valor atual, fim da vigência, equipe e quantidade de garantias.' },
      { title: 'Registre atos nas abas', description: 'Inclua aditivos, subcontratações, sanções, reajustes, equipe, garantias, apostilamentos, recebimentos, diários e comunicações.' },
      { title: 'Revise reflexos financeiros', description: 'O valor atual é calculado pelo valor original somado ou subtraído dos atos financeiros registrados; ele não deve ser digitado diretamente.' },
      { title: 'Edite com rastreabilidade', description: 'Use Editar na linha do registro, revise o formulário e salve. Exclusões são lógicas e sujeitas às permissões do perfil.' },
    ],
    details: [
      { title: 'Aditivo', description: 'Formaliza alteração de prazo, valor ou escopo. Informe número, assinatura, nova vigência, impacto e descrição.' },
      { title: 'Reajuste e repactuação', description: 'Registre competência, índice, percentual, valor e fundamento. A data-base do contrato orienta a análise, mas não substitui a decisão formal.' },
      { title: 'Garantia', description: 'Acompanhe modalidade, garantidor, valor, vigência, suficiência, execução, recuperação e liberação.' },
      { title: 'Diário de obra', description: 'Registre condição operacional, efetivos, serviços, materiais, equipamentos, ensaios, ocorrências e impactos.' },
      { title: 'Comunicação ou pleito', description: 'Controle protocolo, remetente, destinatário, prioridade, prazos de manifestação, pareceres e decisão.' },
    ],
    warning: 'O sistema organiza a fiscalização, mas não substitui parecer técnico, análise jurídica, competência administrativa ou documento formal exigido pela legislação.',
    result: 'Dossiê contratual coerente, pesquisável e conciliado com a execução da manutenção.',
  },
  {
    id: 'orcamentos-sinapi',
    category: 'Custos e medições',
    title: 'Orçamentos de OS e catálogos SINAPI',
    summary: 'Importe referências, pesquise itens e componha os três estágios de custo da OS.',
    purpose: 'Comparar previsão, autorização e execução sem perder a origem do preço.',
    audience: 'Orçamentistas, engenheiros, gestores, fiscais e equipes de planejamento.',
    route: '/orcamentos',
    routeLabel: 'Abrir orçamentos e SINAPI',
    keywords: ['sinapi', 'orçamento', 'insumo', 'composição', 'bdi', 'custo', 'xlsx'],
    steps: [
      { title: 'Importe o catálogo', description: 'Escolha origem, UF, competência, versão e arquivo XLSX. Confirme se a competência corresponde ao relatório recebido.' },
      { title: 'Selecione a OS e o estágio', description: 'Escolha Previsto, Aprovado ou Final executado. Cada estágio registra sua própria versão e finalidade.' },
      { title: 'Pesquise os itens', description: 'Filtre por código, descrição, tipo, unidade e faixa de custo. Marque vários itens para inclusão em conjunto.' },
      { title: 'Defina quantidades e BDI', description: 'Revise unidade, quantidade, custo unitário, origem e BDI antes de salvar o orçamento.' },
      { title: 'Feche o custo executado', description: 'O orçamento final aprovado da OS concluída pode compor a medição do contrato na competência correspondente.' },
    ],
    details: [
      { title: 'Regimes do SINAPI', description: 'Insumos e composições sintéticas oneradas e desoneradas são catálogos distintos. Escolha a referência aplicável ao orçamento.' },
      { title: 'Tabela própria', description: 'Use origem própria para serviços ou insumos de manutenção não presentes no SINAPI, mantendo descrição, unidade e custo identificáveis.' },
      { title: 'Composição', description: 'A consulta permite visualizar a referência sintética disponível. O sistema atual não importa composições analíticas do SINAPI.' },
    ],
    warning: 'Preço de referência não é preço contratado automaticamente. Revise data, localidade, regime, encargos, quantitativos, BDI e condições específicas.',
    result: 'Orçamento da OS versionado e preparado para aprovação e futura medição.',
  },
  {
    id: 'empenhos-medicoes',
    category: 'Custos e medições',
    title: 'Empenhos e medições contratuais',
    summary: 'Controle disponibilidade financeira e consolide a execução aceita no período.',
    purpose: 'Conciliar contrato, empenho, OS executada, medição, liquidação e pagamento.',
    audience: 'Gestores de contratos, fiscais, áreas orçamentárias e financeiras.',
    route: '/medicoes',
    routeLabel: 'Abrir medições',
    keywords: ['empenho', 'medição', 'liquidação', 'pagamento', 'glosa', 'competência'],
    steps: [
      { title: 'Registre o empenho', description: 'Informe contrato, número, exercício, natureza da despesa, fonte, valor e datas pertinentes.' },
      { title: 'Prepare as OS', description: 'Conclua e aceite as ordens do período, com orçamento final executado aprovado e elegibilidade de medição.' },
      { title: 'Crie ou consolide a medição', description: 'Selecione contrato, empenho e competência. Consolide os orçamentos finais ou escolha manualmente as OS elegíveis.' },
      { title: 'Revise valores e desempenho', description: 'Confira itens, glosas, bônus ou descontos associados a KPI e o valor líquido.' },
      { title: 'Avance o fluxo financeiro', description: 'Submeta, revise, aprove, liquide e pague conforme as permissões e os documentos comprobatórios.' },
    ],
    details: [
      { title: 'Competência', description: 'Representa o período da execução consolidada, e não simplesmente a data em que o usuário digitou a medição.' },
      { title: 'Glosa', description: 'Deve possuir motivo e rastreabilidade. Não altere o valor original da OS para esconder uma glosa.' },
      { title: 'Saldo', description: 'Compare valor vigente do contrato, empenhado, medido, liquidado e pago. Cada saldo responde a uma pergunta financeira diferente.' },
    ],
    result: 'Execução mensal conciliada com contrato e disponibilidade orçamentária.',
  },
  {
    id: 'planos-manutencao',
    category: 'Planejamento',
    title: 'Planos de manutenção preventiva',
    summary: 'Crie rotinas recorrentes e gere OS futuras sem duplicidade.',
    purpose: 'Converter obrigações e recomendações técnicas em trabalho programado e rastreável.',
    audience: 'Engenheiros, gestores de manutenção, responsáveis técnicos e planejadores.',
    route: '/planos-manutencao',
    routeLabel: 'Abrir planos de manutenção',
    keywords: ['plano', 'preventiva', 'recorrência', 'ativo', 'cronograma', 'automático', 'inteligente'],
    steps: [
      { title: 'Selecione a edificação', description: 'Defina o imóvel e o ativo ou sistema objeto da rotina.' },
      { title: 'Configure a recorrência', description: 'Informe frequência, próxima execução, prioridade, categoria, checklist, contrato e fornecedor quando aplicável.' },
      { title: 'Use a geração inteligente', description: 'Forneça características do imóvel e revise as sugestões explicáveis. A decisão e a adequação técnica continuam humanas.' },
      { title: 'Gere as ordens', description: 'Execute o gerador para o horizonte desejado. A chave de recorrência evita duplicar a mesma ocorrência.' },
      { title: 'Acompanhe a realização', description: 'As OS geradas seguem o fluxo operacional normal e alimentam conformidade, atraso e indicadores.' },
    ],
    details: [
      { title: 'Plano x OS', description: 'O plano define a regra recorrente; a OS representa uma ocorrência executável. Alterar o plano não apaga OS já geradas.' },
      { title: 'Checklist', description: 'Associe verificações objetivas e evidências adequadas ao risco do sistema mantido.' },
      { title: 'Responsabilidade técnica', description: 'A biblioteca inteligente é apoio ao planejamento. Normas, manuais, condições locais e laudos devem ser verificados pelo profissional competente.' },
    ],
    result: 'Calendário preventivo transformado em ordens rastreáveis e mensuráveis.',
  },
  {
    id: 'kpis-slas',
    category: 'Gestão',
    title: 'KPIs, SLAs e desempenho',
    summary: 'Configure metas, interprete tendências e vincule desempenho a decisões gerenciais.',
    purpose: 'Avaliar prazo, qualidade, recorrência, custo, satisfação e conformidade com fontes auditáveis.',
    audience: 'Gestores, fiscais, administradores, auditores e direção.',
    route: '/indicadores',
    routeLabel: 'Abrir KPIs e SLAs',
    keywords: ['kpi', 'sla', 'igd', 'meta', 'tendência', 'desempenho', 'indicador'],
    steps: [
      { title: 'Escolha a biblioteca', description: 'Selecione indicadores aplicáveis ao contrato e ao objetivo de gestão. Evite medir apenas o que é fácil.' },
      { title: 'Configure regras', description: 'Defina fórmula, fonte, periodicidade, meta, faixas, peso e eventual reflexo financeiro.' },
      { title: 'Registre os dados externos', description: 'Quando a fonte não for nativa, inclua pontos de dados com competência, valor, origem e evidência.' },
      { title: 'Calcule e interprete', description: 'Compare realizado, meta, tendência e dimensões. Investigue a origem antes de concluir sobre desempenho.' },
      { title: 'Use na medição', description: 'Quando configurado, o desempenho pode gerar bônus ou desconto auditável; a aprovação permanece no fluxo da medição.' },
    ],
    details: [
      { title: 'Fontes nativas', description: 'OS, SLA, reabertura, satisfação, contratos, planos, orçamentos e evidências podem ser calculados diretamente.' },
      { title: 'IGD', description: 'O índice geral combina indicadores ponderados. Leia também cada componente para não ocultar desempenho crítico sob uma média.' },
      { title: 'Tendência', description: 'Série curta ou dado incompleto não deve ser interpretado como previsão segura. Registre a qualidade da fonte.' },
    ],
    result: 'Desempenho acompanhado por métricas explicáveis e conectado à gestão contratual.',
  },
  {
    id: 'relatorios-notificacoes',
    category: 'Gestão',
    title: 'Relatórios e notificações',
    summary: 'Consulte documentos gerenciais e transforme alertas em ações.',
    purpose: 'Distribuir informação consistente sem perder o vínculo com os registros de origem.',
    audience: 'Gestores, fiscais, administradores e auditores.',
    route: '/relatorios',
    routeLabel: 'Abrir relatórios',
    keywords: ['relatório', 'pdf', 'csv', 'notificação', 'alerta', 'exportar'],
    steps: [
      { title: 'Defina a pergunta', description: 'Escolha o relatório conforme a decisão: backlog, contrato, prazo, financeiro, fornecedor, plano ou desempenho.' },
      { title: 'Aplique filtros', description: 'Delimite período, edificação, contrato, fornecedor, status ou competência antes de exportar.' },
      { title: 'Confira totais e origem', description: 'Valide amostras no cadastro original. Relatórios refletem a qualidade e a atualização dos dados de entrada.' },
      { title: 'Trate notificações', description: 'Abra o alerta, acesse a entidade relacionada, execute a ação e marque como lido quando estiver efetivamente tratado.' },
    ],
    details: [
      { title: 'PDF', description: 'Adequado a leitura, assinatura ou instrução processual. Confira cabeçalho, período e filtros impressos.' },
      { title: 'CSV', description: 'Adequado a análise tabular. Preserve o arquivo original e documente transformações externas.' },
      { title: 'Alerta', description: 'Notificação é um sinal de evento ou prazo; não substitui o registro da providência no módulo correspondente.' },
    ],
    result: 'Informação gerencial contextualizada e alertas convertidos em providências rastreáveis.',
  },
  {
    id: 'configuracao-operacional',
    category: 'Administração',
    title: 'Configuração operacional',
    summary: 'Padronize categorias, especialidades, SLA, calendários e checklists da organização.',
    purpose: 'Fazer o sistema refletir a política operacional antes da abertura das demandas.',
    audience: 'Proprietários, administradores e gestores autorizados.',
    route: '/configuracoes-operacionais',
    routeLabel: 'Abrir configuração operacional',
    keywords: ['configuração', 'categoria', 'especialidade', 'sla', 'calendário', 'checklist'],
    steps: [
      { title: 'Cadastre catálogos', description: 'Crie categorias, especialidades, ambientes e causas com códigos e nomes claros.' },
      { title: 'Defina políticas de SLA', description: 'Configure prazos por prioridade e categoria, calendário aplicável e condições de pausa quando previstas.' },
      { title: 'Monte checklists', description: 'Adicione itens objetivos, obrigatoriedade e critérios de evidência para abertura, execução ou fechamento.' },
      { title: 'Teste antes de ampliar', description: 'Abra uma OS de demonstração e confirme classificação, prazo calculado e bloqueios de conclusão.' },
    ],
    details: [
      { title: 'Alterações futuras', description: 'Mudanças de regra afetam novos registros conforme a implementação; a OS preserva snapshots para explicar a regra vigente na abertura.' },
      { title: 'Nomenclatura', description: 'Evite categorias duplicadas ou excessivamente específicas. Prefira uma taxonomia estável e pesquisável.' },
      { title: 'Calendário', description: 'Feriados e jornada alteram o cálculo de prazo útil. Revise o calendário a cada exercício.' },
    ],
    result: 'Operação padronizada, com prazos e evidências aplicados de maneira consistente.',
  },
  {
    id: 'usuarios-seguranca',
    category: 'Administração',
    title: 'Usuários, perfis e segurança',
    summary: 'Conceda o acesso mínimo necessário e mantenha a conta protegida.',
    purpose: 'Separar responsabilidades e reduzir risco de acesso indevido ou ação incompatível.',
    audience: 'Proprietários, administradores e todos os titulares de conta.',
    route: '/administracao',
    routeLabel: 'Abrir administração',
    keywords: ['usuário', 'senha', 'perfil', 'permissão', 'convite', 'suspender', 'segurança'],
    steps: [
      { title: 'Crie ou convide o usuário', description: 'Informe dados corretos e associe-o à organização com o papel compatível com suas atribuições.' },
      { title: 'Aplique o menor privilégio', description: 'Não use perfil de administrador para atividades comuns. Separe operação, fiscalização, gestão, auditoria e administração.' },
      { title: 'Gerencie o ciclo de acesso', description: 'Suspenda usuários afastados ou desligados e reative somente após validação. Revise acessos periodicamente.' },
      { title: 'Proteja a credencial', description: 'Use senha exclusiva, não compartilhe conta e encerre a sessão em computadores de terceiros.' },
    ],
    details: [
      { title: 'Usuário x organização', description: 'O e-mail identifica a pessoa globalmente; o papel pertence ao vínculo dela com cada organização.' },
      { title: 'Troca de senha', description: 'Administradores podem redefinir acessos conforme a política, e o próprio usuário deve manter sua credencial em Minha conta.' },
      { title: 'Auditoria', description: 'Ações relevantes registram usuário, organização, data e contexto. Nunca utilize a conta de outra pessoa.' },
    ],
    warning: 'Não envie senhas por comentários, documentos de OS ou campos de observação. Em caso de suspeita, troque a senha e suspenda sessões imediatamente.',
    result: 'Equipe com responsabilidades separadas e acessos administrados durante todo o vínculo.',
  },
  {
    id: 'solucao-problemas',
    category: 'Ajuda',
    title: 'Solução de problemas frequentes',
    summary: 'Faça verificações seguras antes de concluir que há perda de dados ou indisponibilidade.',
    purpose: 'Resolver dúvidas comuns e produzir informações úteis quando o suporte for necessário.',
    audience: 'Todos os usuários.',
    keywords: ['erro', 'não funciona', 'carregando', 'mapa', 'download', 'login', 'suporte'],
    steps: [
      { title: 'Confirme o contexto', description: 'Verifique organização, usuário, perfil, módulo, filtro aplicado e registro selecionado.' },
      { title: 'Atualize a tela', description: 'Salve o que estiver em edição, recarregue a página e repita uma única vez. Não clique várias vezes em Salvar.' },
      { title: 'Leia a mensagem', description: 'Anote o texto completo, horário, número da OS ou contrato e ação executada.' },
      { title: 'Verifique escopo e permissão', description: 'Um item pode estar arquivado, pertencer a outro filtro ou exigir perfil específico.' },
      { title: 'Registre evidência segura', description: 'Faça captura sem expor senha, token ou dado pessoal desnecessário e encaminhe ao suporte com passos para reprodução.' },
    ],
    details: [
      { title: 'Mapa sem ruas', description: 'Confirme conexão, endereço e coordenadas. Tente nova busca e verifique se o provedor de mapas não foi bloqueado pelo navegador ou pela rede.' },
      { title: 'Lista vazia', description: 'Limpe filtros, confirme a organização e verifique se o cadastro-base está ativo. Combos dependem de entidades previamente cadastradas.' },
      { title: 'Download não abre', description: 'Mantenha a sessão ativa e use o botão do próprio sistema. Downloads privados não funcionam por endereço copiado em outra sessão.' },
      { title: 'Sessão expirada', description: 'Entre novamente. Se o problema persistir, confirme se o usuário está ativo e se a senha foi alterada.' },
    ],
    tips: ['Informe sempre o endereço da tela, o horário e o identificador do registro.', 'Não tente corrigir inconsistências diretamente no banco de dados.'],
    result: 'Incidente descrito com clareza ou dúvida resolvida sem comprometer os registros.',
  },
  {
    id: 'glossario',
    category: 'Ajuda',
    title: 'Glossário essencial',
    summary: 'Consulte os termos mais usados na manutenção, nos contratos e na interface.',
    purpose: 'Criar uma linguagem comum entre demandantes, operação, fiscalização e gestão.',
    audience: 'Todos os usuários.',
    keywords: ['glossário', 'termo', 'conceito', 'backlog', 'sla', 'kpi', 'bdi', 'sinapi'],
    steps: [
      { title: 'OS', description: 'Ordem de serviço: registro central de uma demanda ou ocorrência de manutenção.' },
      { title: 'Backlog', description: 'Conjunto de ordens de serviço ainda não encerradas.' },
      { title: 'SLA', description: 'Acordo ou regra de nível de serviço que define prazos e metas de atendimento.' },
      { title: 'KPI', description: 'Indicador-chave de desempenho, calculado por fórmula, fonte, período e meta definidos.' },
      { title: 'SINAPI', description: 'Sistema Nacional de Pesquisa de Custos e Índices da Construção Civil, usado como referência de preços.' },
      { title: 'BDI', description: 'Benefícios e Despesas Indiretas aplicados ao custo direto conforme critérios do orçamento.' },
      { title: 'Medição', description: 'Consolidação da execução aceita em uma competência para análise e fluxo financeiro.' },
      { title: 'Apostilamento', description: 'Registro formal de alteração que não exige termo aditivo nas hipóteses admitidas.' },
    ],
    details: [
      { title: 'Empenho', description: 'Ato orçamentário que reserva dotação para determinada despesa.' },
      { title: 'Glosa', description: 'Valor não reconhecido ou descontado da medição, acompanhado de fundamento.' },
      { title: 'Tenant ou organização', description: 'Ambiente isolado de uma empresa ou órgão no SaaS. Seus dados não são visíveis a outra organização.' },
      { title: 'Exclusão lógica', description: 'Arquivamento do registro sem remoção física, preservando relações e auditoria.' },
    ],
    result: 'Termos interpretados de modo consistente durante o uso do sistema.',
  },
];

const STORAGE_KEY = 'gp-manual-read-topics-v1';

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function searchableText(topic: ManualTopic) {
  return normalize([
    topic.category,
    topic.title,
    topic.summary,
    topic.purpose,
    topic.audience,
    ...topic.keywords,
    ...topic.steps.flatMap((step) => [step.title, step.description]),
    ...topic.details.flatMap((detail) => [detail.title, detail.description]),
    ...(topic.tips ?? []),
    topic.warning ?? '',
    topic.result,
  ].join(' '));
}

export default function ManualPage() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Todos');
  const [expanded, setExpanded] = useState<string[]>(['inicio-rapido']);
  const [readTopics, setReadTopics] = useState<string[]>([]);
  const [progressReady, setProgressReady] = useState(false);
  const [fontSize, setFontSize] = useState<'small' | 'normal' | 'large'>('normal');

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        if (saved) setReadTopics(JSON.parse(saved) as string[]);
      } catch {
        // O manual continua funcional quando o navegador bloqueia armazenamento local.
      } finally {
        setProgressReady(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!progressReady) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(readTopics));
    } catch {
      // A marcação de leitura é um recurso auxiliar e não bloqueia o manual.
    }
  }, [progressReady, readTopics]);

  const categories = useMemo(() => ['Todos', ...Array.from(new Set(TOPICS.map((topic) => topic.category)))], []);
  const filteredTopics = useMemo(() => {
    const terms = normalize(query).split(/\s+/).filter(Boolean);
    return TOPICS.filter((topic) => {
      if (category !== 'Todos' && topic.category !== category) return false;
      const text = searchableText(topic);
      return terms.every((term) => text.includes(term));
    });
  }, [category, query]);

  const readCount = TOPICS.filter((topic) => readTopics.includes(topic.id)).length;
  const progress = Math.round((readCount / TOPICS.length) * 100);

  function toggleExpanded(id: string) {
    setExpanded((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function toggleRead(id: string) {
    setReadTopics((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function openTopic(id: string) {
    setExpanded((current) => current.includes(id) ? current : [...current, id]);
    window.requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  function clearSearch() {
    setQuery('');
    setCategory('Todos');
  }

  return <div className={`manual-page manual-font-${fontSize}`}>
    <header className="page-header manual-page-header">
      <div className="page-title">
        <div className="manual-eyebrow"><BookOpenCheck size={15} /> Central de aprendizagem</div>
        <h1>Manual do Usuário</h1>
        <p>Aprenda os fluxos do Gestão de Prédios com orientações práticas, atalhos e explicações integradas ao sistema.</p>
      </div>
      <div className="manual-font-controls" aria-label="Tamanho do texto">
        <span>Texto</span>
        <button type="button" className={fontSize === 'small' ? 'active' : ''} onClick={() => setFontSize('small')} aria-label="Texto menor">A−</button>
        <button type="button" className={fontSize === 'normal' ? 'active' : ''} onClick={() => setFontSize('normal')} aria-label="Texto normal">A</button>
        <button type="button" className={fontSize === 'large' ? 'active' : ''} onClick={() => setFontSize('large')} aria-label="Texto maior">A+</button>
      </div>
    </header>

    <section className="manual-toolbar card" aria-label="Pesquisa do manual">
      <div className="manual-search">
        <Search size={19} aria-hidden="true" />
        <label className="sr-only" htmlFor="manual-search">Pesquisar no manual</label>
        <input id="manual-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquise: contrato, fotos, SINAPI, medição, senha…" />
        {query ? <button type="button" onClick={() => setQuery('')} aria-label="Limpar texto da pesquisa"><X size={17} /></button> : null}
      </div>
      <button className="btn btn-secondary" type="button" onClick={clearSearch}>Limpar pesquisa</button>
      <button className="btn btn-secondary" type="button" onClick={() => setExpanded(filteredTopics.map((topic) => topic.id))}>Expandir resultados</button>
      <button className="btn btn-ghost" type="button" onClick={() => setExpanded([])}>Recolher</button>
    </section>

    <div className="manual-category-filter" role="group" aria-label="Filtrar assuntos">
      {categories.map((item) => <button key={item} type="button" className={category === item ? 'active' : ''} onClick={() => setCategory(item)}>{item}</button>)}
    </div>

    <section className="manual-progress card" aria-label="Progresso de leitura">
      <div className="manual-progress-icon"><ListChecks size={21} /></div>
      <div>
        <strong>{readCount} de {TOPICS.length} tópicos lidos</strong>
        <span>O progresso fica salvo somente neste navegador e não altera dados da organização.</span>
      </div>
      <div className="manual-progress-track" aria-label={`${progress}% concluído`}><span style={{ width: `${progress}%` }} /></div>
      <b>{progress}%</b>
    </section>

    <div className="manual-layout">
      <aside className="manual-index card" aria-label="Índice do manual">
        <div className="manual-index-header">
          <div><span>Índice</span><strong>{filteredTopics.length} tópico(s)</strong></div>
          <Sparkles size={18} />
        </div>
        <nav>
          {filteredTopics.map((topic, index) => <button key={topic.id} type="button" onClick={() => openTopic(topic.id)}>
            <span>{readTopics.includes(topic.id) ? <CheckCircle2 size={16} /> : <b>{index + 1}</b>}</span>
            <span><strong>{topic.title}</strong><small>{topic.category}</small></span>
          </button>)}
        </nav>
        {!filteredTopics.length ? <p>Nenhum tópico corresponde aos filtros.</p> : null}
      </aside>

      <section className="manual-content" aria-live="polite">
        {!filteredTopics.length ? <section className="manual-no-results card">
          <Search size={28} />
          <h2>Nenhum resultado encontrado</h2>
          <p>Tente uma palavra mais ampla ou remova o filtro de assunto.</p>
          <button className="btn btn-primary" type="button" onClick={clearSearch}>Ver todos os tópicos</button>
        </section> : null}

        {filteredTopics.map((topic, index) => {
          const isOpen = expanded.includes(topic.id);
          const isRead = readTopics.includes(topic.id);
          return <article className={`manual-topic card ${isRead ? 'read' : ''}`} id={topic.id} key={topic.id}>
            <div className="manual-topic-heading">
              <button className="manual-topic-toggle" type="button" onClick={() => toggleExpanded(topic.id)} aria-expanded={isOpen} aria-controls={`${topic.id}-content`}>
                <span className="manual-topic-number">{isRead ? <Check size={18} /> : index + 1}</span>
                <span><small>{topic.category}</small><strong>{topic.title}</strong><em>{topic.summary}</em></span>
                <ChevronDown className={isOpen ? 'open' : ''} size={21} />
              </button>
              <button className={`manual-read-button ${isRead ? 'active' : ''}`} type="button" onClick={() => toggleRead(topic.id)}>
                {isRead ? <CheckCircle2 size={16} /> : <Circle size={16} />}{isRead ? 'Lido' : 'Marcar como lido'}
              </button>
            </div>

            {isOpen ? <div className="manual-topic-body" id={`${topic.id}-content`}>
              <div className="manual-topic-meta">
                <div><strong>Para que serve</strong><span>{topic.purpose}</span></div>
                <div><strong>Quem utiliza</strong><span>{topic.audience}</span></div>
                {topic.route ? <Link className="btn btn-primary" href={topic.route}><ExternalLink size={15} /> {topic.routeLabel}</Link> : null}
              </div>

              <section className="manual-section">
                <h3><ListChecks size={18} /> Passo a passo</h3>
                <ol className="manual-steps">
                  {topic.steps.map((step, stepIndex) => <li key={step.title}><span>{stepIndex + 1}</span><div><strong>{step.title}</strong><p>{step.description}</p></div></li>)}
                </ol>
              </section>

              <section className="manual-section">
                <h3><BookOpenCheck size={18} /> Entenda os principais campos e regras</h3>
                <div className="manual-details-grid">
                  {topic.details.map((detail) => <div key={detail.title}><strong>{detail.title}</strong><p>{detail.description}</p></div>)}
                </div>
              </section>

              {topic.tips?.length ? <aside className="manual-callout tip"><Lightbulb size={20} /><div><strong>Dicas práticas</strong>{topic.tips.map((tip) => <p key={tip}>{tip}</p>)}</div></aside> : null}
              {topic.warning ? <aside className="manual-callout warning"><TriangleAlert size={20} /><div><strong>Atenção</strong><p>{topic.warning}</p></div></aside> : null}
              <aside className="manual-callout result"><ShieldCheck size={20} /><div><strong>Resultado esperado</strong><p>{topic.result}</p></div></aside>
            </div> : null}
          </article>;
        })}
      </section>
    </div>
  </div>;
}
