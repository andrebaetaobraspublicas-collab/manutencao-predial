# -*- coding: utf-8 -*-
"""
Gerador de DADOS DE TESTE para o Sistema de Manutenção Predial.

Popula TODAS as tabelas com um conjunto coerente e interligado:
prédios reais, tipos de serviço, usuários, prestadores (casando com os tipos),
contratos de manutenção predial com todos os sub-módulos (aditivos, medições,
garantias, riscos, etc.) e ordens de serviço vinculadas.

ATENÇÃO: este script APAGA os dados atuais e recria do zero, para que o
conjunto fique 100% consistente. Pode ser executado quantas vezes quiser.

Uso:  python seed_dados_teste.py
"""
import sqlite3
from datetime import datetime, timedelta
from werkzeug.security import generate_password_hash

DB = 'database.db'
HOJE = datetime.now()


def d(dias):
    """Data ISO (YYYY-MM-DD) deslocada em N dias a partir de hoje."""
    return (HOJE + timedelta(days=dias)).strftime('%Y-%m-%d')


def dt(dias, hora=9):
    """Timestamp 'YYYY-MM-DD HH:MM:SS' deslocado em N dias (formato do app)."""
    return (HOJE + timedelta(days=dias)).replace(hour=hora, minute=0, second=0, microsecond=0).strftime('%Y-%m-%d %H:%M:%S')


conn = sqlite3.connect(DB)
conn.execute('PRAGMA foreign_keys = OFF')
cur = conn.cursor()

# ---------- Limpeza ----------
TABELAS = [
    'prestador_documentos', 'edificacao_anexos', 'edificacao_demandas',
    'contrato_fiscais', 'contrato_documentos', 'contrato_recebimentos', 'contrato_penalidades', 'contrato_riscos',
    'contrato_cronograma', 'contrato_reajustes', 'contrato_garantias', 'contrato_medicoes',
    'contrato_subcontratacoes', 'contrato_empenhos', 'contrato_apostilamentos',
    'contrato_prorrogacoes', 'contrato_aditivos', 'contratos',
    'ordens_servico', 'planos_manutencao', 'prestadores_servico', 'usuarios',
    'tipos_servico', 'edificacoes',
]
for t in TABELAS:
    cur.execute(f'DELETE FROM {t}')
    try:
        cur.execute("DELETE FROM sqlite_sequence WHERE name=?", (t,))
    except sqlite3.OperationalError:
        pass

# ---------- Edificações ----------
# nome, tipo, endereco, bairro, cidade, uf, area_construida, num_pavimentos, ano, situacao, responsavel
edificacoes = [
    ('Sede Administrativa', 'Administrativa', 'Av. Central, 1000', 'Centro', 'Brasília', 'DF', 3200.0, 5, 1998, 'Em uso', 'João Pereira'),
    ('Anexo I - Secretaria de Obras', 'Administrativa', 'Rua das Acácias, 200', 'Centro', 'Brasília', 'DF', 1500.0, 3, 2005, 'Em uso', 'Maria Lima'),
    ('Anexo II - Almoxarifado Central', 'Almoxarifado/Depósito', 'Rua das Indústrias, 50', 'Setor Industrial', 'Brasília', 'DF', 2200.0, 1, 2010, 'Em uso', 'Carlos Souza'),
    ('Centro de Saúde Municipal', 'Saúde', 'Av. da Saúde, 350', 'Vila Nova', 'Brasília', 'DF', 1800.0, 2, 2012, 'Em uso', 'Ana Costa'),
    ('Escola Municipal Dom Pedro II', 'Escolar', 'Rua da Escola, 75', 'Jardim', 'Brasília', 'DF', 2600.0, 2, 2001, 'Em reforma', 'Paulo Reis'),
    ('Garagem e Pátio de Veículos', 'Garagem/Pátio', 'Rod. BR-000, km 5', 'Zona Rural', 'Brasília', 'DF', 5000.0, 1, 2015, 'Em uso', 'Roberto Dias'),
]
cur.executemany('INSERT INTO edificacoes (nome, tipo_edificacao, endereco, bairro, cidade, uf, area_construida, num_pavimentos, ano_construcao, situacao, responsavel_local) VALUES (?,?,?,?,?,?,?,?,?,?,?)', edificacoes)

# ---------- Tipos de Serviço ----------
tipos = [
    ('Elétrica', 'Manutenção de instalações e quadros elétricos'),
    ('Hidráulica', 'Reparos hidrossanitários e prediais'),
    ('Civil/Alvenaria', 'Reparos estruturais, alvenaria e revestimentos'),
    ('Pintura', 'Pintura interna e externa'),
    ('Climatização (HVAC)', 'Manutenção de ar-condicionado e climatização'),
    ('Elevadores', 'Conservação e manutenção de elevadores'),
    ('Combate a Incêndio', 'Extintores, hidrantes e sistemas de prevenção'),
    ('Limpeza Técnica', 'Limpeza de fachadas, caixas d\'água e reservatórios'),
    ('Jardinagem', 'Conservação de áreas verdes'),
    ('Marcenaria', 'Reparos em mobiliário e esquadrias de madeira'),
]
cur.executemany('INSERT INTO tipos_servico (nome, descricao) VALUES (?,?)', tipos)

# ---------- Usuários ----------
# Garante a coluna de senha (caso o app ainda não tenha rodado a migração)
try:
    cur.execute('SELECT senha_hash FROM usuarios LIMIT 1')
except sqlite3.OperationalError:
    cur.execute('ALTER TABLE usuarios ADD COLUMN senha_hash TEXT')

# nome, email, perfil, senha
usuarios = [
    ('André Baeta', 'andre.baeta@orgao.gov', 'Administrador', 'admin123'),
    ('Maria Souza', 'maria.souza@orgao.gov', 'Gestor', 'senha123'),
    ('Carlos Andrade', 'carlos.andrade@orgao.gov', 'Executor', 'senha123'),
    ('Fernanda Lima', 'fernanda.lima@orgao.gov', 'Solicitante', 'senha123'),
    ('João Pereira', 'joao.pereira@orgao.gov', 'Solicitante', 'senha123'),
    ('Ana Costa', 'ana.costa@orgao.gov', 'Gestor', 'senha123'),
]
cur.executemany('INSERT INTO usuarios (nome, email, perfil, senha_hash) VALUES (?,?,?,?)',
                [(n, e, p, generate_password_hash(s)) for (n, e, p, s) in usuarios])

# ---------- Prestadores de Serviço ----------
# nome_empresa, contato, telefone, email, tipos, cnpj, porte, cidade, uf, situacao, responsavel_tecnico
prestadores = [
    ('Construrepara Engenharia Ltda', 'Marcos Vinícius', '(61) 99999-0003', 'obras@construrepara.com', 'Civil/Alvenaria,Pintura,Marcenaria', '12.345.678/0001-90', 'EPP', 'Brasília', 'DF', 'Ativo', 'Eng. Marcos Vinícius'),
    ('ElétricaTotal Manutenção Ltda', 'Roberto Nunes', '(61) 99999-0001', 'contato@eletricatotal.com', 'Elétrica,Climatização (HVAC)', '23.456.789/0001-01', 'ME', 'Brasília', 'DF', 'Ativo', 'Eng. Roberto Nunes'),
    ('HidroMax Serviços Prediais', 'Sandra Mota', '(61) 99999-0002', 'sac@hidromax.com', 'Hidráulica,Combate a Incêndio', '34.567.890/0001-12', 'ME', 'Brasília', 'DF', 'Ativo', 'Eng. Sandra Mota'),
    ('ClimaFrio Manutenção Ltda', 'Júlia Ferraz', '(61) 99999-0004', 'clima@climafrio.com', 'Climatização (HVAC)', '45.678.901/0001-23', 'EPP', 'Brasília', 'DF', 'Ativo', 'Téc. Júlia Ferraz'),
    ('Eleva Elevadores S.A.', 'Pedro Tavares', '(61) 99999-0005', 'eleva@eleva.com', 'Elevadores', '56.789.012/0001-34', 'Demais', 'Goiânia', 'GO', 'Ativo', 'Eng. Pedro Tavares'),
    ('LimpaVerde Facilities', 'Cláudia Reis', '(61) 99999-0006', 'contato@limpaverde.com', 'Limpeza Técnica,Jardinagem', '67.890.123/0001-45', 'ME', 'Brasília', 'DF', 'Suspenso', 'Cláudia Reis'),
]
cur.executemany('INSERT INTO prestadores_servico (nome_empresa, contato, telefone, email, tipos_servico_atendidos, cnpj, porte, cidade, uf, situacao, responsavel_tecnico) VALUES (?,?,?,?,?,?,?,?,?,?,?)', prestadores)

# ---------- Contratos ----------
# (numero, processo, modalidade, objeto, contratada, cnpj, prestador_id, valor,
#  data_inicio, data_termino, fonte_recursos, gestor, fiscal, situacao, observacoes)
contratos = [
    ('001/2026', '23456.000111/2026-10', 'Pregão Eletrônico',
     'Serviços continuados de manutenção predial preventiva e corretiva da Sede e Anexos',
     'Construrepara Engenharia Ltda', '12.345.678/0001-90', 1, 1200000.00,
     d(-156), d(194), 'Recursos Próprios', 'Maria Souza', 'Carlos Andrade', 'Em execução',
     'Contrato principal de manutenção predial.'),
    ('002/2026', '23456.000222/2026-55', 'Pregão Eletrônico',
     'Manutenção preventiva e corretiva dos sistemas de climatização (HVAC)',
     'ClimaFrio Manutenção Ltda', '23.456.789/0001-01', 4, 480000.00,
     d(-140), d(41), 'Recursos Próprios', 'André Baeta', 'Carlos Andrade', 'Em execução',
     'Vigência próxima do fim — avaliar prorrogação.'),
    ('003/2025', '23456.000333/2025-22', 'Pregão Eletrônico',
     'Conservação e manutenção de elevadores das unidades administrativas',
     'Eleva Elevadores S.A.', '34.567.890/0001-12', 5, 360000.00,
     d(-320), d(51), 'Convênio', 'Maria Souza', 'Fernanda Lima', 'Em execução',
     'Contrato com reajuste por IPCA aplicado.'),
    ('004/2024', '23456.000444/2024-08', 'Dispensa de Licitação',
     'Reforma e adequação das instalações elétricas do Anexo I',
     'ElétricaTotal Manutenção Ltda', '45.678.901/0001-23', 2, 250000.00,
     d(-600), d(-180), 'Recursos Próprios', 'André Baeta', 'Carlos Andrade', 'Encerrado',
     'Objeto recebido definitivamente.'),
]
for c in contratos:
    cur.execute('''INSERT INTO contratos
        (numero, processo, modalidade, objeto, contratada, cnpj, prestador_id, valor,
         data_inicio, data_termino, fonte_recursos, gestor, fiscal, situacao, observacoes)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)''', c)

# IDs dos contratos (na ordem inserida: 1..4)
C1, C2, C3, C4 = 1, 2, 3, 4

# ---------- Aditivos ----------
aditivos = [
    (C1, '1º TA', 'Acréscimo', d(-40), 180000.00, 0, None, "art. 125, Lei 14.133/2021", 'Acréscimo de serviços de pintura em fachada.'),
    (C1, '2º TA', 'Supressão', d(-15), 0, 30000.00, None, "art. 125, Lei 14.133/2021", 'Supressão de itens não executados.'),
    (C3, '1º TA', 'Prorrogação de prazo', d(-10), 0, 0, d(51), "art. 107, Lei 14.133/2021", 'Prorrogação de vigência por 6 meses.'),
]
cur.executemany('''INSERT INTO contrato_aditivos
    (contrato_id, numero, tipo, data_assinatura, valor_acrescido, valor_suprimido, nova_vigencia_fim, fundamentacao, justificativa)
    VALUES (?,?,?,?,?,?,?,?,?)''', aditivos)

# ---------- Prorrogações ----------
prorrogacoes = [
    (C3, '1º Termo de Prorrogação', d(-10), d(-139), d(51), 190, "art. 107, Lei 14.133/2021", 'Continuidade do serviço essencial.'),
]
cur.executemany('''INSERT INTO contrato_prorrogacoes
    (contrato_id, numero, data_assinatura, vigencia_anterior, nova_vigencia, dias, fundamentacao, justificativa)
    VALUES (?,?,?,?,?,?,?,?)''', prorrogacoes)

# ---------- Apostilamentos ----------
apostilamentos = [
    (C1, 'Apostila 01', 'Atualização monetária', d(-30), 'IPCA', 3.85, 1200000.00, 1246200.00, 'Atualização do valor por índice acumulado.'),
]
cur.executemany('''INSERT INTO contrato_apostilamentos
    (contrato_id, numero, tipo, data, indice, percentual, valor_anterior, valor_novo, justificativa)
    VALUES (?,?,?,?,?,?,?,?,?)''', apostilamentos)

# ---------- Empenhos ----------
empenhos = [
    (C1, '2026NE000101', '2026', '3.3.90.39 - Serviços PJ', 'Recursos Próprios', d(-150), 700000.00, 420000.00, 380000.00, 'Empenho inicial.'),
    (C1, '2026NE000150', '2026', '3.3.90.39 - Serviços PJ', 'Recursos Próprios', d(-40), 350000.00, 120000.00, 90000.00, 'Reforço de empenho.'),
    (C2, '2026NE000210', '2026', '3.3.90.39 - Serviços PJ', 'Recursos Próprios', d(-130), 480000.00, 300000.00, 280000.00, ''),
    (C3, '2025NE000333', '2025', '3.3.90.39 - Serviços PJ', 'Convênio', d(-300), 360000.00, 300000.00, 300000.00, ''),
]
cur.executemany('''INSERT INTO contrato_empenhos
    (contrato_id, numero, exercicio, natureza_despesa, fonte_recursos, data, valor_empenhado, valor_liquidado, valor_pago, observacoes)
    VALUES (?,?,?,?,?,?,?,?,?,?)''', empenhos)

# ---------- Subcontratações ----------
subcontratacoes = [
    (C1, 'Pinturas Rápidas ME', '56.789.012/0001-34', 'Eng. Lucas Brito', 'Execução de pintura de fachada', 15.0, 180000.00, d(-35), 30.0, 'Subcontratação autorizada.'),
]
cur.executemany('''INSERT INTO contrato_subcontratacoes
    (contrato_id, empresa, cnpj, responsavel_tecnico, objeto, percentual, valor, data_autorizacao, limite_permitido, observacoes)
    VALUES (?,?,?,?,?,?,?,?,?,?)''', subcontratacoes)

# ---------- Medições ----------
medicoes = [
    (C1, '1', d(-150), d(-120), d(-118), 12.0, 145000.00, 'Carlos Andrade', 'Mobilização e serviços iniciais.'),
    (C1, '2', d(-119), d(-89), d(-87), 22.0, 268000.00, 'Carlos Andrade', ''),
    (C1, '3', d(-88), d(-58), d(-56), 18.0, 216000.00, 'Carlos Andrade', ''),
    (C2, '1', d(-130), d(-100), d(-98), 30.0, 144000.00, 'Carlos Andrade', 'Manutenção preventiva trimestral.'),
]
cur.executemany('''INSERT INTO contrato_medicoes
    (contrato_id, numero, periodo_inicio, periodo_fim, data, percentual_fisico, valor, fiscal, observacoes)
    VALUES (?,?,?,?,?,?,?,?,?)''', medicoes)

# ---------- Garantias ----------
garantias = [
    (C1, 'Seguro-garantia', 'AP-2026-0001', 'Seguradora Aliança', 60000.00, 5.0, d(-156), d(209), 'Vigente', ''),
    (C2, 'Fiança bancária', 'FB-2026-0044', 'Banco Nacional', 24000.00, 5.0, d(-140), d(20), 'A renovar', 'Vence junto com o contrato.'),
    (C3, 'Caução em dinheiro', 'GUIA-553', 'Tesouro', 18000.00, 5.0, d(-320), d(-15), 'Vencida', 'Necessária renovação imediata.'),
]
cur.executemany('''INSERT INTO contrato_garantias
    (contrato_id, tipo, numero_apolice, instituicao, valor, percentual, data_inicio, data_validade, situacao, observacoes)
    VALUES (?,?,?,?,?,?,?,?,?,?)''', garantias)

# ---------- Reajustes / Repactuações / Revisões ----------
reajustes = [
    (C3, 'Reajuste', 'IPCA', 4.50, 360000.00, 376200.00, d(-12), "art. 135, Lei 14.133/2021", 'Reajuste anual pelo IPCA acumulado.'),
]
cur.executemany('''INSERT INTO contrato_reajustes
    (contrato_id, tipo, indice, percentual, valor_anterior, valor_novo, data, fundamentacao, justificativa)
    VALUES (?,?,?,?,?,?,?,?,?)''', reajustes)

# ---------- Cronograma Físico-Financeiro ----------
cronograma = [
    (C1, 'Etapa 1', 'Mobilização e serviços preliminares', 'Jan-Mar/2026', 30.0, 360000.00, 30.0, 360000.00, 'Concluída.'),
    (C1, 'Etapa 2', 'Execução de manutenções corretivas', 'Abr-Jun/2026', 35.0, 420000.00, 22.0, 264000.00, 'Em andamento.'),
    (C1, 'Etapa 3', 'Manutenções preventivas e finalização', 'Jul-Dez/2026', 35.0, 420000.00, 0.0, 0.0, 'A iniciar.'),
]
cur.executemany('''INSERT INTO contrato_cronograma
    (contrato_id, etapa, descricao, periodo_previsto, percentual_previsto, valor_previsto, percentual_realizado, valor_realizado, observacoes)
    VALUES (?,?,?,?,?,?,?,?,?)''', cronograma)

# ---------- Riscos ----------
riscos = [
    (C1, 'Atraso na entrega de materiais críticos', 'Prazo/Cronograma', 'Alta', 'Alto', 'Alto', 'Antecipar compras e manter fornecedores alternativos.', 'Carlos Andrade', 'Em monitoramento'),
    (C1, 'Variação de preços de insumos', 'Financeiro/Orçamentário', 'Média', 'Médio', 'Médio', 'Acompanhar índices e prever reajuste contratual.', 'Maria Souza', 'Identificado'),
    (C2, 'Indisponibilidade de peças de reposição HVAC', 'Operacional', 'Média', 'Alto', 'Alto', 'Manter estoque mínimo de peças críticas.', 'André Baeta', 'Identificado'),
]
cur.executemany('''INSERT INTO contrato_riscos
    (contrato_id, descricao, categoria, probabilidade, impacto, nivel, resposta, responsavel, status)
    VALUES (?,?,?,?,?,?,?,?,?)''', riscos)

# ---------- Penalidades ----------
penalidades = [
    (C2, 'Advertência', d(-60), 'PA-2026/077', 0, "art. 156, I, Lei 14.133/2021", 'Aplicada', 'Atraso pontual no atendimento de chamado.'),
    (C3, 'Multa', d(-25), 'PA-2026/091', 5400.00, "art. 156, II, Lei 14.133/2021", 'Em recurso', 'Descumprimento de prazo de medição.'),
]
cur.executemany('''INSERT INTO contrato_penalidades
    (contrato_id, tipo, data, processo, valor_multa, fundamentacao, situacao, observacoes)
    VALUES (?,?,?,?,?,?,?,?)''', penalidades)

# ---------- Recebimentos ----------
recebimentos = [
    (C4, 'Recebimento provisório', 'TRP-004/2024', d(-200), 'Comissão de Fiscalização', 'Homologado', 'Sem ressalvas.'),
    (C4, 'Recebimento definitivo', 'TRD-004/2025', d(-175), 'Comissão de Fiscalização', 'Homologado', 'Objeto recebido em conformidade.'),
    (C1, 'Recebimento provisório', 'TRP-001/2026', d(-56), 'Carlos Andrade', 'Com ressalvas', 'Pendências menores de pintura.'),
]
cur.executemany('''INSERT INTO contrato_recebimentos
    (contrato_id, tipo, numero_termo, data, responsavel, situacao, observacoes)
    VALUES (?,?,?,?,?,?,?)''', recebimentos)

# ---------- Documentos (metadados; sem arquivo físico) ----------
documentos = [
    (C1, 'Contrato assinado', 'Contrato 001/2026 assinado e publicado', d(-156), None, 'Disponível no processo eletrônico.'),
    (C1, 'Termo aditivo', '1º Termo Aditivo (acréscimo)', d(-40), None, ''),
    (C2, 'Garantia/Apólice', 'Fiança bancária FB-2026-0044', d(-140), None, ''),
]
cur.executemany('''INSERT INTO contrato_documentos
    (contrato_id, tipo, descricao, data, arquivo, observacoes)
    VALUES (?,?,?,?,?,?)''', documentos)

# ---------- Ordens de Serviço ----------
# (unidade, tipo, prestador, descricao, prioridade, status, dias_solic, dias_conclusao|None, contrato_id|None)
os_rows = [
    ('Sede Administrativa', 'Elétrica', 'ElétricaTotal Manutenção Ltda', 'Disjuntor geral do 3º andar desarmando intermitentemente', 'Alta', 'Finalizada', -45, 3, C1),
    ('Sede Administrativa', 'Hidráulica', 'HidroMax Serviços Prediais', 'Vazamento na tubulação do banheiro do térreo', 'Média', 'Finalizada', -40, 2, C1),
    ('Anexo I - Secretaria de Obras', 'Pintura', 'Construrepara Engenharia Ltda', 'Repintura da fachada principal', 'Baixa', 'Em Andamento', -20, None, C1),
    ('Centro de Saúde Municipal', 'Climatização (HVAC)', 'ClimaFrio Manutenção Ltda', 'Ar-condicionado da recepção sem refrigerar', 'Alta', 'Finalizada', -30, 1, C2),
    ('Centro de Saúde Municipal', 'Climatização (HVAC)', 'ClimaFrio Manutenção Ltda', 'Limpeza preventiva dos splits do bloco B', 'Média', 'Aberta', -3, None, C2),
    ('Sede Administrativa', 'Elevadores', 'Eleva Elevadores S.A.', 'Elevador social parando fora de nível', 'Crítica', 'Em Andamento', -5, None, C3),
    ('Anexo II - Almoxarifado Central', 'Civil/Alvenaria', 'Construrepara Engenharia Ltda', 'Infiltração no teto do depósito', 'Alta', 'Aberta', -2, None, C1),
    ('Escola Municipal Dom Pedro II', 'Hidráulica', 'HidroMax Serviços Prediais', 'Entupimento na rede de esgoto do pátio', 'Alta', 'Finalizada', -25, 4, None),
    ('Escola Municipal Dom Pedro II', 'Pintura', 'Construrepara Engenharia Ltda', 'Pintura das salas de aula', 'Baixa', 'Aberta', -1, None, None),
    ('Garagem e Pátio de Veículos', 'Elétrica', 'ElétricaTotal Manutenção Ltda', 'Troca de luminárias queimadas do pátio', 'Média', 'Finalizada', -18, 2, None),
    ('Sede Administrativa', 'Combate a Incêndio', 'HidroMax Serviços Prediais', 'Recarga de extintores vencidos', 'Média', 'Finalizada', -60, 5, None),
    ('Anexo I - Secretaria de Obras', 'Marcenaria', 'Construrepara Engenharia Ltda', 'Reparo em portas e armários danificados', 'Baixa', 'Cancelada', -50, None, C1),
    ('Centro de Saúde Municipal', 'Limpeza Técnica', 'LimpaVerde Facilities', 'Limpeza e higienização da caixa d\'água', 'Alta', 'Finalizada', -35, 1, None),
    ('Sede Administrativa', 'Jardinagem', 'LimpaVerde Facilities', 'Poda de árvores da área externa', 'Baixa', 'Aberta', -4, None, None),
    ('Anexo II - Almoxarifado Central', 'Elétrica', 'ElétricaTotal Manutenção Ltda', 'Instalação de novos pontos de tomada', 'Média', 'Em Andamento', -8, None, C1),
    ('Escola Municipal Dom Pedro II', 'Climatização (HVAC)', 'ClimaFrio Manutenção Ltda', 'Manutenção dos ventiladores de teto', 'Baixa', 'Finalizada', -22, 3, C2),
    ('Garagem e Pátio de Veículos', 'Civil/Alvenaria', 'Construrepara Engenharia Ltda', 'Recuperação do piso do pátio de manobras', 'Média', 'Aberta', -6, None, None),
    ('Sede Administrativa', 'Hidráulica', 'HidroMax Serviços Prediais', 'Substituição de registros do barrilete', 'Alta', 'Em Andamento', -7, None, C1),
]
for (uni, tp, pr, desc, prio, st, ds, dc, cid) in os_rows:
    data_solic = dt(ds)
    data_concl = dt(ds + dc) if (st == 'Finalizada' and dc is not None) else None
    cur.execute('''INSERT INTO ordens_servico
        (unidade, tipo_servico, descricao, prioridade, responsavel, data_solicitacao, status, data_conclusao, prestador_servico, anexos, contrato_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)''',
        (uni, tp, desc, prio, 'Fernanda Lima', data_solic, st, data_concl, pr, None, cid))

# ---------- Planos de Manutenção Preventiva ----------
planos = [
    ('Limpeza de caixas d\'água', 'Sede Administrativa', 'Limpeza Técnica', 6, 'meses', 'Limpeza e desinfecção dos reservatórios.', d(-170), d(10)),
    ('Manutenção mensal de elevadores', 'Sede Administrativa', 'Elevadores', 1, 'meses', 'Inspeção e lubrificação conforme NBR.', d(-25), d(5)),
    ('Recarga de extintores', 'Centro de Saúde Municipal', 'Combate a Incêndio', 12, 'meses', 'Recarga e teste hidrostático.', d(-200), d(165)),
    ('Limpeza de filtros de ar-condicionado', 'Centro de Saúde Municipal', 'Climatização (HVAC)', 3, 'meses', 'Higienização de filtros e dutos.', d(-40), d(-5)),
    ('Inspeção elétrica preventiva', 'Anexo I - Secretaria de Obras', 'Elétrica', 6, 'meses', 'Termografia de quadros e reaperto.', d(-100), d(80)),
]
for (nome, uni, tp, val, un, tarefa, ult, prox) in planos:
    cur.execute('''INSERT INTO planos_manutencao
        (nome_plano, unidade, tipo_servico, periodicidade_valor, periodicidade_unidade, descricao_tarefa, data_ultima_execucao, data_proxima_execucao, status)
        VALUES (?,?,?,?,?,?,?,?,?)''',
        (nome, uni, tp, val, un, tarefa, ult, prox, 'Ativo'))

# ---------- Gestor e Fiscais por Contrato ----------
fiscais = [
    (C1, 'Gestor do contrato', 'Maria Souza', '1045', 'Portaria 012/2026', '(61) 3333-1000', 'maria.souza@orgao.gov', ''),
    (C1, 'Fiscal Técnico', 'Carlos Andrade', '1188', 'Portaria 014/2026', '(61) 3333-1001', 'carlos.andrade@orgao.gov', ''),
    (C1, 'Fiscal Administrativo', 'Fernanda Lima', '1201', 'Portaria 015/2026', '', 'fernanda.lima@orgao.gov', ''),
    (C2, 'Gestor do contrato', 'André Baeta', '1001', 'Portaria 020/2026', '', 'andre.baeta@orgao.gov', ''),
    (C2, 'Fiscal Setorial', 'Ana Costa', '1309', 'Portaria 021/2026', '', 'ana.costa@orgao.gov', ''),
    (C3, 'Gestor do contrato', 'Maria Souza', '1045', 'Portaria 030/2025', '', 'maria.souza@orgao.gov', ''),
    (C3, 'Fiscal Técnico', 'Carlos Andrade', '1188', 'Portaria 031/2025', '', 'carlos.andrade@orgao.gov', ''),
]
cur.executemany('INSERT INTO contrato_fiscais (contrato_id, tipo, nome, matricula, portaria, telefone, email, observacoes) VALUES (?,?,?,?,?,?,?,?)', fiscais)

# ---------- Demandas por Edificação ----------
# (edificacao_id, descricao, tipo_servico, prioridade, status, data_registro, responsavel, obs)
demandas = [
    (5, 'Recuperação do telhado do bloco B', 'Civil/Alvenaria', 'Alta', 'Aberta', d(-10), 'Paulo Reis', 'Infiltração em dias de chuva.'),
    (5, 'Pintura das salas de aula', 'Pintura', 'Média', 'Planejada', d(-30), 'Paulo Reis', ''),
    (1, 'Modernização do quadro elétrico do 3º andar', 'Elétrica', 'Alta', 'Em análise', d(-5), 'João Pereira', ''),
    (4, 'Adequação de acessibilidade (rampa de acesso)', 'Civil/Alvenaria', 'Média', 'Aberta', d(-20), 'Ana Costa', 'Exigência de laudo.'),
    (3, 'Reparo no portão de acesso do almoxarifado', 'Civil/Alvenaria', 'Baixa', 'Atendida', d(-60), 'Carlos Souza', 'Concluído.'),
    (6, 'Drenagem do pátio de manobras', 'Civil/Alvenaria', 'Média', 'Aberta', d(-8), 'Roberto Dias', ''),
]
cur.executemany('INSERT INTO edificacao_demandas (edificacao_id, descricao, tipo_servico, prioridade, status, data_registro, responsavel, observacoes) VALUES (?,?,?,?,?,?,?,?)', demandas)

conn.commit()

# ---------- Resumo ----------
print('Dados de teste gerados com sucesso!\n')
print('LOGIN: andre.baeta@orgao.gov / admin123 (Administrador)')
print('       demais usuarios: senha123\n')
for t in reversed(TABELAS):
    n = cur.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0]
    print(f'  {t:<28} {n:>3} registro(s)')
conn.close()
