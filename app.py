from flask import Flask, request, jsonify, render_template, send_from_directory, session, redirect, url_for
import sqlite3
import os
from datetime import datetime, timedelta
import uuid
from functools import wraps
from werkzeug.utils import secure_filename
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__, template_folder='templates') # CORRIGIDO __name__

# Chave de sessão (assina os cookies de login). Em produção defina a variável de
# ambiente SECRET_KEY com um valor aleatório e secreto.
app.secret_key = os.environ.get('SECRET_KEY', 'troque-esta-chave-secreta-em-producao-123456')

# Diretório base do projeto: garante caminhos absolutos (necessário sob WSGI,
# ex.: PythonAnywhere, onde o diretório de trabalho pode ser diferente).
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

DATABASE = os.path.join(BASE_DIR, 'database.db')

# --- Configurações para Upload de Arquivos ---
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads')
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'pdf'}
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024 # Limite de 16MB para uploads

# Cria a pasta de uploads se ela não existir
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def get_db_connection():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()

    # Tabela de Ordens de Serviço
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS ordens_servico (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            unidade TEXT NOT NULL,
            tipo_servico TEXT NOT NULL,
            descricao TEXT NOT NULL,
            prioridade TEXT NOT NULL,
            responsavel TEXT,
            data_solicitacao TEXT DEFAULT CURRENT_TIMESTAMP,
            status TEXT DEFAULT 'Aberta',
            data_conclusao TEXT DEFAULT NULL,
            prestador_servico TEXT DEFAULT NULL,
            anexos TEXT DEFAULT NULL
        )
    ''')
    # Migrações para novas colunas (garante que existam se o DB já existe)
    try:
        cursor.execute("SELECT data_conclusao FROM ordens_servico LIMIT 1")
    except sqlite3.OperationalError:
        print("Adicionando coluna 'data_conclusao' à tabela 'ordens_servico'...")
        cursor.execute("ALTER TABLE ordens_servico ADD COLUMN data_conclusao TEXT DEFAULT NULL")
        conn.commit()
    try:
        cursor.execute("SELECT prestador_servico FROM ordens_servico LIMIT 1")
    except sqlite3.OperationalError:
        print("Adicionando coluna 'prestador_servico' à tabela 'ordens_servico'...")
        cursor.execute("ALTER TABLE ordens_servico ADD COLUMN prestador_servico TEXT DEFAULT NULL")
        conn.commit()
    try:
        cursor.execute("SELECT anexos FROM ordens_servico LIMIT 1")
    except sqlite3.OperationalError:
        print("Adicionando coluna 'anexos' à tabela 'ordens_servico'...")
        cursor.execute("ALTER TABLE ordens_servico ADD COLUMN anexos TEXT DEFAULT NULL")
        conn.commit()
    try:
        cursor.execute("SELECT contrato_id FROM ordens_servico LIMIT 1")
    except sqlite3.OperationalError:
        print("Adicionando coluna 'contrato_id' à tabela 'ordens_servico'...")
        cursor.execute("ALTER TABLE ordens_servico ADD COLUMN contrato_id INTEGER DEFAULT NULL")
        conn.commit()


    # Tabela de Edificações (Prédios/Unidades)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS edificacoes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL UNIQUE,
            endereco TEXT,
            cidade TEXT,
            responsavel_local TEXT
        )
    ''')

    # Tabela de Tipos de Serviço
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS tipos_servico (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL UNIQUE,
            descricao TEXT
        )
    ''')

    # Tabela de Usuários e Perfis (Simplificado)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            perfil TEXT NOT NULL DEFAULT 'Solicitante'
        )
    ''')

    # Tabela de Planos de Manutenção Preventiva
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS planos_manutencao (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome_plano TEXT NOT NULL,
            unidade TEXT NOT NULL,
            tipo_servico TEXT NOT NULL,
            periodicidade_valor INTEGER NOT NULL,
            periodicidade_unidade TEXT NOT NULL,
            descricao_tarefa TEXT,
            data_ultima_execucao TEXT DEFAULT NULL,
            data_proxima_execucao TEXT DEFAULT NULL,
            status TEXT DEFAULT 'Ativo'
        )
    ''')

    # Adicionar colunas data_ultima_execucao e data_proxima_execucao se não existirem
    try:
        cursor.execute("SELECT data_ultima_execucao FROM planos_manutencao LIMIT 1")
    except sqlite3.OperationalError:
        print("Adicionando coluna 'data_ultima_execucao' à tabela 'planos_manutencao'...")
        cursor.execute("ALTER TABLE planos_manutencao ADD COLUMN data_ultima_execucao TEXT DEFAULT NULL")
        conn.commit()
    try:
        cursor.execute("SELECT data_proxima_execucao FROM planos_manutencao LIMIT 1")
    except sqlite3.OperationalError:
        print("Adicionando coluna 'data_proxima_execucao' à tabela 'planos_manutencao'...")
        cursor.execute("ALTER TABLE planos_manutencao ADD COLUMN data_proxima_execucao TEXT DEFAULT NULL")
        conn.commit()

    # Tabela: Prestadores de Serviço
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS prestadores_servico (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome_empresa TEXT NOT NULL UNIQUE,
            contato TEXT,
            telefone TEXT,
            email TEXT,
            tipos_servico_atendidos TEXT
        )
    ''')

    # ===================== MÓDULO DE CONTRATOS DE MANUTENÇÃO PREDIAL =====================
    # Contrato (capa)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS contratos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            numero TEXT NOT NULL,
            processo TEXT,
            modalidade TEXT,
            objeto TEXT NOT NULL,
            contratada TEXT,
            cnpj TEXT,
            prestador_id INTEGER,
            valor REAL DEFAULT 0,
            data_inicio TEXT,
            data_termino TEXT,
            fonte_recursos TEXT,
            gestor TEXT,
            fiscal TEXT,
            situacao TEXT DEFAULT 'Em execução',
            observacoes TEXT,
            data_cadastro TEXT DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Aditivos contratuais (acréscimos, supressões, prorrogações, reequilíbrios)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS contrato_aditivos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            contrato_id INTEGER NOT NULL,
            numero TEXT,
            tipo TEXT,
            data_assinatura TEXT,
            valor_acrescido REAL DEFAULT 0,
            valor_suprimido REAL DEFAULT 0,
            nova_vigencia_fim TEXT,
            fundamentacao TEXT,
            justificativa TEXT,
            FOREIGN KEY (contrato_id) REFERENCES contratos(id) ON DELETE CASCADE
        )
    ''')

    # Prorrogações de prazo
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS contrato_prorrogacoes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            contrato_id INTEGER NOT NULL,
            numero TEXT,
            data_assinatura TEXT,
            vigencia_anterior TEXT,
            nova_vigencia TEXT,
            dias INTEGER,
            fundamentacao TEXT,
            justificativa TEXT,
            FOREIGN KEY (contrato_id) REFERENCES contratos(id) ON DELETE CASCADE
        )
    ''')

    # Apostilamentos (reajustes, repactuações, correções — não exigem aditivo)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS contrato_apostilamentos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            contrato_id INTEGER NOT NULL,
            numero TEXT,
            tipo TEXT,
            data TEXT,
            indice TEXT,
            percentual REAL DEFAULT 0,
            valor_anterior REAL DEFAULT 0,
            valor_novo REAL DEFAULT 0,
            justificativa TEXT,
            FOREIGN KEY (contrato_id) REFERENCES contratos(id) ON DELETE CASCADE
        )
    ''')

    # Empenhos (execução orçamentária)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS contrato_empenhos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            contrato_id INTEGER NOT NULL,
            numero TEXT,
            exercicio TEXT,
            natureza_despesa TEXT,
            fonte_recursos TEXT,
            data TEXT,
            valor_empenhado REAL DEFAULT 0,
            valor_liquidado REAL DEFAULT 0,
            valor_pago REAL DEFAULT 0,
            observacoes TEXT,
            FOREIGN KEY (contrato_id) REFERENCES contratos(id) ON DELETE CASCADE
        )
    ''')

    # Subcontratações
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS contrato_subcontratacoes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            contrato_id INTEGER NOT NULL,
            empresa TEXT,
            cnpj TEXT,
            responsavel_tecnico TEXT,
            objeto TEXT,
            percentual REAL DEFAULT 0,
            valor REAL DEFAULT 0,
            data_autorizacao TEXT,
            limite_permitido REAL DEFAULT 30,
            observacoes TEXT,
            FOREIGN KEY (contrato_id) REFERENCES contratos(id) ON DELETE CASCADE
        )
    ''')

    # Medições (execução física e financeira)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS contrato_medicoes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            contrato_id INTEGER NOT NULL,
            numero TEXT,
            periodo_inicio TEXT,
            periodo_fim TEXT,
            data TEXT,
            percentual_fisico REAL DEFAULT 0,
            valor REAL DEFAULT 0,
            fiscal TEXT,
            observacoes TEXT,
            FOREIGN KEY (contrato_id) REFERENCES contratos(id) ON DELETE CASCADE
        )
    ''')

    # Garantias contratuais
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS contrato_garantias (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            contrato_id INTEGER NOT NULL,
            tipo TEXT,
            numero_apolice TEXT,
            instituicao TEXT,
            valor REAL DEFAULT 0,
            percentual REAL DEFAULT 0,
            data_inicio TEXT,
            data_validade TEXT,
            situacao TEXT DEFAULT 'Vigente',
            observacoes TEXT,
            FOREIGN KEY (contrato_id) REFERENCES contratos(id) ON DELETE CASCADE
        )
    ''')

    # Reajustes, Repactuações e Revisões
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS contrato_reajustes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            contrato_id INTEGER NOT NULL,
            tipo TEXT,
            indice TEXT,
            percentual REAL DEFAULT 0,
            valor_anterior REAL DEFAULT 0,
            valor_novo REAL DEFAULT 0,
            data TEXT,
            fundamentacao TEXT,
            justificativa TEXT,
            FOREIGN KEY (contrato_id) REFERENCES contratos(id) ON DELETE CASCADE
        )
    ''')

    # Cronograma físico-financeiro
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS contrato_cronograma (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            contrato_id INTEGER NOT NULL,
            etapa TEXT,
            descricao TEXT,
            periodo_previsto TEXT,
            percentual_previsto REAL DEFAULT 0,
            valor_previsto REAL DEFAULT 0,
            percentual_realizado REAL DEFAULT 0,
            valor_realizado REAL DEFAULT 0,
            observacoes TEXT,
            FOREIGN KEY (contrato_id) REFERENCES contratos(id) ON DELETE CASCADE
        )
    ''')

    # Gestão de riscos contratuais
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS contrato_riscos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            contrato_id INTEGER NOT NULL,
            descricao TEXT,
            categoria TEXT,
            probabilidade TEXT,
            impacto TEXT,
            nivel TEXT,
            resposta TEXT,
            responsavel TEXT,
            status TEXT DEFAULT 'Identificado',
            FOREIGN KEY (contrato_id) REFERENCES contratos(id) ON DELETE CASCADE
        )
    ''')

    # Aplicação de penalidades
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS contrato_penalidades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            contrato_id INTEGER NOT NULL,
            tipo TEXT,
            data TEXT,
            processo TEXT,
            valor_multa REAL DEFAULT 0,
            fundamentacao TEXT,
            situacao TEXT DEFAULT 'Em apuração',
            observacoes TEXT,
            FOREIGN KEY (contrato_id) REFERENCES contratos(id) ON DELETE CASCADE
        )
    ''')

    # Recebimento provisório e definitivo
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS contrato_recebimentos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            contrato_id INTEGER NOT NULL,
            tipo TEXT,
            numero_termo TEXT,
            data TEXT,
            responsavel TEXT,
            situacao TEXT DEFAULT 'Emitido',
            observacoes TEXT,
            FOREIGN KEY (contrato_id) REFERENCES contratos(id) ON DELETE CASCADE
        )
    ''')

    # Gestão documental
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS contrato_documentos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            contrato_id INTEGER NOT NULL,
            tipo TEXT,
            descricao TEXT,
            data TEXT,
            arquivo TEXT,
            observacoes TEXT,
            FOREIGN KEY (contrato_id) REFERENCES contratos(id) ON DELETE CASCADE
        )
    ''')

    # Gestor e fiscais do contrato
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS contrato_fiscais (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            contrato_id INTEGER NOT NULL,
            tipo TEXT,
            nome TEXT,
            matricula TEXT,
            portaria TEXT,
            telefone TEXT,
            email TEXT,
            observacoes TEXT,
            FOREIGN KEY (contrato_id) REFERENCES contratos(id) ON DELETE CASCADE
        )
    ''')

    # ===== Ampliação dos cadastros de Prestadores e Edificações =====
    def add_col(table, col, decl):
        try:
            cursor.execute(f"SELECT {col} FROM {table} LIMIT 1")
        except sqlite3.OperationalError:
            print(f"Adicionando coluna '{col}' à tabela '{table}'...")
            cursor.execute(f"ALTER TABLE {table} ADD COLUMN {col} {decl}")

    prestador_cols = {
        'razao_social': 'TEXT', 'nome_fantasia': 'TEXT', 'cnpj': 'TEXT',
        'inscricao_estadual': 'TEXT', 'inscricao_municipal': 'TEXT', 'contato_cargo': 'TEXT',
        'celular': 'TEXT', 'site': 'TEXT', 'endereco': 'TEXT', 'numero': 'TEXT', 'bairro': 'TEXT',
        'cidade': 'TEXT', 'uf': 'TEXT', 'cep': 'TEXT', 'responsavel_tecnico': 'TEXT',
        'registro_profissional': 'TEXT', 'porte': 'TEXT', 'banco': 'TEXT', 'agencia': 'TEXT',
        'conta': 'TEXT', 'situacao': "TEXT DEFAULT 'Ativo'", 'observacoes': 'TEXT'
    }
    for col, decl in prestador_cols.items():
        add_col('prestadores_servico', col, decl)

    edificacao_cols = {
        'codigo': 'TEXT', 'tipo_edificacao': 'TEXT', 'numero': 'TEXT', 'bairro': 'TEXT',
        'uf': 'TEXT', 'cep': 'TEXT', 'area_construida': 'REAL', 'num_pavimentos': 'INTEGER',
        'ano_construcao': 'INTEGER', 'matricula_imovel': 'TEXT', 'situacao': "TEXT DEFAULT 'Em uso'",
        'telefone': 'TEXT', 'observacoes': 'TEXT'
    }
    for col, decl in edificacao_cols.items():
        add_col('edificacoes', col, decl)

    # Senha (hash) para login de usuários
    add_col('usuarios', 'senha_hash', 'TEXT')

    # Documentos do prestador (PDF/imagens)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS prestador_documentos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            prestador_id INTEGER NOT NULL,
            tipo TEXT,
            descricao TEXT,
            data TEXT,
            validade TEXT,
            arquivo TEXT,
            observacoes TEXT
        )
    ''')

    # Anexos da edificação (fotos, laudos de vistoria, plantas)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS edificacao_anexos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            edificacao_id INTEGER NOT NULL,
            categoria TEXT,
            descricao TEXT,
            data TEXT,
            responsavel TEXT,
            arquivo TEXT,
            observacoes TEXT
        )
    ''')

    # Demandas da edificação
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS edificacao_demandas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            edificacao_id INTEGER NOT NULL,
            descricao TEXT,
            tipo_servico TEXT,
            prioridade TEXT DEFAULT 'Média',
            status TEXT DEFAULT 'Aberta',
            data_registro TEXT,
            responsavel TEXT,
            observacoes TEXT
        )
    ''')

    conn.commit()
    conn.close()
    print("Banco de dados e tabelas verificadas/criadas com sucesso.")

# Inicializa o banco de dados ao iniciar o aplicativo
if not os.path.exists(DATABASE):
    print(f"Arquivo de banco de dados '{DATABASE}' não encontrado. Criando novo...")
    init_db()
else:
    print(f"Banco de dados '{DATABASE}' encontrado. Verificando estrutura das tabelas.")
    init_db()


def ensure_admin():
    """Garante que sempre exista um usuário administrador com senha para login."""
    conn = get_db_connection()
    try:
        existe = conn.execute("SELECT COUNT(*) FROM usuarios WHERE senha_hash IS NOT NULL").fetchone()[0]
        if existe == 0:
            conn.execute(
                'INSERT INTO usuarios (nome, email, perfil, senha_hash) VALUES (?, ?, ?, ?)',
                ('Administrador', 'admin@obrasinteligentes.ia.br', 'Administrador', generate_password_hash('admin123'))
            )
            conn.commit()
            print("=" * 70)
            print("USUÁRIO ADMINISTRADOR CRIADO (troque a senha após o 1º acesso):")
            print("  E-mail: admin@obrasinteligentes.ia.br")
            print("  Senha:  admin123")
            print("=" * 70)
    except sqlite3.Error as e:
        print(f"Erro ao garantir admin: {e}")
    finally:
        conn.close()


ensure_admin()

# ===================== AUTENTICAÇÃO E CONTROLE DE ACESSO =====================
# Endpoints públicos (não exigem login)
ENDPOINTS_PUBLICOS = {'login', 'static'}


@app.before_request
def exigir_login():
    if request.endpoint in ENDPOINTS_PUBLICOS:
        return None
    if session.get('user_id'):
        return None
    # Não autenticado
    if request.path.startswith('/api/'):
        return jsonify({"error": "Sessão expirada. Faça login novamente.", "auth": False}), 401
    return redirect(url_for('login'))


def is_admin():
    return session.get('perfil') == 'Administrador'


def admin_required():
    """Retorna uma resposta de erro se o usuário não for administrador, senão None."""
    if not is_admin():
        return jsonify({"error": "Acesso restrito a administradores."}), 403
    return None


@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        email = (request.form.get('email') or '').strip()
        senha = request.form.get('senha') or ''
        conn = get_db_connection()
        user = conn.execute('SELECT * FROM usuarios WHERE email = ?', (email,)).fetchone()
        conn.close()
        if user and user['senha_hash'] and check_password_hash(user['senha_hash'], senha):
            session['user_id'] = user['id']
            session['nome'] = user['nome']
            session['perfil'] = user['perfil']
            return redirect(url_for('home'))
        return render_template('login.html', erro='E-mail ou senha inválidos.')
    if session.get('user_id'):
        return redirect(url_for('home'))
    return render_template('login.html')


@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))


@app.route('/api/me', methods=['GET'])
def api_me():
    return jsonify({'id': session.get('user_id'), 'nome': session.get('nome'), 'perfil': session.get('perfil')})


@app.route('/api/change_password', methods=['POST'])
def change_password():
    data = request.json or {}
    atual = data.get('senha_atual') or ''
    nova = data.get('nova_senha') or ''
    if len(nova) < 4:
        return jsonify({"error": "A nova senha deve ter ao menos 4 caracteres."}), 400
    conn = get_db_connection()
    try:
        user = conn.execute('SELECT * FROM usuarios WHERE id = ?', (session['user_id'],)).fetchone()
        if not user or not user['senha_hash'] or not check_password_hash(user['senha_hash'], atual):
            return jsonify({"error": "Senha atual incorreta."}), 400
        conn.execute('UPDATE usuarios SET senha_hash = ? WHERE id = ?', (generate_password_hash(nova), session['user_id']))
        conn.commit()
        return jsonify({"message": "Senha alterada com sucesso!"}), 200
    except sqlite3.Error as e:
        conn.rollback()
        return jsonify({"error": f"Erro ao alterar senha: {e}"}), 500
    finally:
        conn.close()


@app.route('/')
def home():
    return render_template('index.html')

# --- Rotas para Ordens de Serviço ---
@app.route('/api/ordens_servico', methods=['POST'])
def criar_os():
    unidade = request.form.get('unidade')
    tipo_servico = request.form.get('tipo_servico')
    descricao = request.form.get('descricao')
    prioridade = request.form.get('prioridade')
    responsavel = request.form.get('responsavel', 'Não Informado')
    status = request.form.get('status', 'Aberta')
    prestador_servico = request.form.get('prestador_servico')
    contrato_id = request.form.get('contrato_id') or None

    if not all([unidade, tipo_servico, descricao, prioridade]):
        return jsonify({"error": "Campos obrigatórios faltando (unidade, tipo_servico, descricao, prioridade)"}), 400

    anexos_filenames = []
    if 'anexos' in request.files:
        files = request.files.getlist('anexos')
        for file in files:
            if file and allowed_file(file.filename):
                filename = secure_filename(str(uuid.uuid4()) + os.path.splitext(file.filename)[1])
                filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
                try:
                    file.save(filepath)
                    anexos_filenames.append(filename)
                except Exception as e:
                    print(f"Erro ao salvar arquivo {file.filename}: {e}")
                    return jsonify({"error": f"Erro ao salvar arquivo: {file.filename}"}), 500
            elif file.filename != '':
                return jsonify({"error": f"Tipo de arquivo não permitido: {file.filename}"}), 400

    anexos_str = ",".join(anexos_filenames) if anexos_filenames else None

    conn = get_db_connection()
    try:
        conn.execute(
            'INSERT INTO ordens_servico (unidade, tipo_servico, descricao, prioridade, responsavel, status, data_conclusao, prestador_servico, anexos, contrato_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            (unidade, tipo_servico, descricao, prioridade, responsavel, status, None, prestador_servico, anexos_str, contrato_id)
        )
        conn.commit()
        return jsonify({"message": "Ordem de serviço criada com sucesso!", "id": conn.execute('SELECT last_insert_rowid()').fetchone()[0]}), 201
    except sqlite3.Error as e:
        conn.rollback()
        return jsonify({"error": f"Erro ao salvar OS no banco de dados: {e}"}), 500
    finally:
        conn.close()

@app.route('/api/ordens_servico', methods=['GET'])
def listar_os():
    conn = get_db_connection()
    contrato_id = request.args.get('contrato_id')
    if contrato_id:
        ordens = conn.execute('SELECT * FROM ordens_servico WHERE contrato_id = ? ORDER BY id DESC', (contrato_id,)).fetchall()
    else:
        ordens = conn.execute('SELECT * FROM ordens_servico ORDER BY id DESC').fetchall()
    conn.close()
    ordens_dict = []
    for row in ordens:
        os_item = dict(row)
        if os_item['anexos']:
            os_item['anexos'] = os_item['anexos'].split(',')
        else:
            os_item['anexos'] = []
        ordens_dict.append(os_item)
    return jsonify(ordens_dict)

@app.route('/api/ordens_servico/<int:os_id>', methods=['GET'])
def get_os(os_id):
    conn = get_db_connection()
    os_item = conn.execute('SELECT * FROM ordens_servico WHERE id = ?', (os_id,)).fetchone()
    conn.close()
    if os_item:
        os_dict = dict(os_item)
        if os_dict['anexos']:
            os_dict['anexos'] = os_dict['anexos'].split(',')
        else:
            os_dict['anexos'] = []
        return jsonify(os_dict)
    else:
        return jsonify({"error": "OS não encontrada"}), 404

@app.route('/api/ordens_servico/<int:os_id>', methods=['PUT'])
def atualizar_os(os_id):
    data = request.json
    conn = get_db_connection()
    try:
        existing_os = conn.execute('SELECT id, status, anexos FROM ordens_servico WHERE id = ?', (os_id,)).fetchone()
        if not existing_os:
            return jsonify({"error": "OS não encontrada para atualização"}), 404

        current_status = existing_os['status']
        new_status = data.get('status')
        current_anexos = existing_os['anexos'].split(',') if existing_os['anexos'] else []

        update_fields = []
        params = []

        if 'unidade' in data:
            update_fields.append('unidade = ?')
            params.append(data['unidade'])
        if 'tipo_servico' in data:
            update_fields.append('tipo_servico = ?')
            params.append(data['tipo_servico'])
        if 'descricao' in data:
            update_fields.append('descricao = ?')
            params.append(data['descricao'])
        if 'prioridade' in data:
            update_fields.append('prioridade = ?')
            params.append(data['prioridade'])

        if new_status and new_status != current_status:
            update_fields.append('status = ?')
            params.append(new_status)
            if new_status == 'Finalizada':
                update_fields.append('data_conclusao = ?')
                params.append(datetime.now().isoformat())
            elif current_status == 'Finalizada' and new_status != 'Finalizada':
                update_fields.append('data_conclusao = ?')
                params.append(None)
        elif 'status' in data:
            update_fields.append('status = ?')
            params.append(data['status'])

        if 'responsavel' in data:
            update_fields.append('responsavel = ?')
            params.append(data['responsavel'])

        if 'data_conclusao' in data:
            if 'data_conclusao = ?' not in update_fields:
                update_fields.append('data_conclusao = ?')
                params.append(data['data_conclusao'])
            else:
                idx = [i for i, field in enumerate(update_fields) if 'data_conclusao' in field][0]
                params[idx] = data['data_conclusao']

        if 'prestador_servico' in data:
            update_fields.append('prestador_servico = ?')
            params.append(data['prestador_servico'])

        if 'contrato_id' in data:
            update_fields.append('contrato_id = ?')
            params.append(data['contrato_id'] or None)

        if 'anexos' in data and isinstance(data['anexos'], list):
            new_anexos_list = data['anexos']
            update_fields.append('anexos = ?')
            params.append(",".join(new_anexos_list) if new_anexos_list else None)


        if not update_fields:
            return jsonify({"message": "Nenhum campo para atualizar fornecido"}), 200

        query = f"UPDATE ordens_servico SET {', '.join(update_fields)} WHERE id = ?"
        params.append(os_id)

        conn.execute(query, tuple(params))
        conn.commit()
        return jsonify({"message": "Ordem de serviço atualizada com sucesso!"}), 200
    except sqlite3.Error as e:
        conn.rollback()
        return jsonify({"error": f"Erro ao atualizar OS no banco de dados: {e}"}), 500
    finally:
        conn.close()

@app.route('/api/ordens_servico/<int:os_id>', methods=['DELETE'])
def deletar_os(os_id):
    conn = get_db_connection()
    try:
        os_item = conn.execute('SELECT anexos FROM ordens_servico WHERE id = ?', (os_id,)).fetchone()
        if os_item and os_item['anexos']:
            anexos_to_delete = os_item['anexos'].split(',')
            for filename in anexos_to_delete:
                filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
                if os.path.exists(filepath):
                    try:
                        os.remove(filepath)
                        print(f"Arquivo anexado deletado: {filepath}")
                    except Exception as e:
                        print(f"Erro ao deletar arquivo {filepath}: {e}")

        cursor = conn.execute('DELETE FROM ordens_servico WHERE id = ?', (os_id,))
        conn.commit()
        if cursor.rowcount == 0:
            return jsonify({"error": "OS não encontrada para exclusão"}), 404
        return jsonify({"message": "Ordem de serviço deletada com sucesso!"}), 200
    except sqlite3.Error as e:
        conn.rollback()
        return jsonify({"error": f"Erro ao deletar OS do banco de dados: {e}"}), 500
    finally:
        conn.close()

# --- Rota para servir arquivos anexados ---
@app.route('/uploads/<filename>')
def uploaded_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)


# --- KPI: Tempo Médio de Atendimento ---
@app.route('/api/kpi/tma', methods=['GET'])
def get_tma():
    conn = get_db_connection()
    ordens_finalizadas = conn.execute(
        "SELECT data_solicitacao, data_conclusao FROM ordens_servico WHERE status = 'Finalizada' AND data_conclusao IS NOT NULL"
    ).fetchall()
    conn.close()

    total_duration = timedelta(0)
    count_completed = 0

    for os in ordens_finalizadas:
        try:
            start_time_str = os['data_solicitacao']
            end_time_str = os['data_conclusao']

            start_time = datetime.fromisoformat(start_time_str + 'Z' if '+' not in start_time_str and not start_time_str.endswith('Z') else start_time_str)
            end_time = datetime.fromisoformat(end_time_str + 'Z' if '+' not in end_time_str and not end_time_str.endswith('Z') else end_time_str)

            duration = end_time - start_time
            if duration.total_seconds() >= 0:
                total_duration += duration
                count_completed += 1
        except Exception as e:
            print(f"Erro ao parsear datas para OS: {os['data_solicitacao']} e {os['data_conclusao']}. Erro: {e}")
            continue

    if count_completed > 0:
        average_duration = total_duration / count_completed
        total_seconds = int(average_duration.total_seconds())

        days = total_seconds // (24 * 3600)
        total_seconds %= (24 * 3600)
        hours = total_seconds // 3600
        total_seconds %= 3600
        minutes = total_seconds // 60
        seconds = total_seconds % 60

        parts = []
        if days > 0:
            parts.append(f"{days}d")
        if hours > 0:
            parts.append(f"{hours}h")
        if minutes > 0:
            parts.append(f"{minutes}m")
        if not parts and seconds == 0:
            parts.append("0s")
        elif seconds > 0:
             parts.append(f"{seconds}s")

        tma_formatted = " ".join(parts)

        return jsonify({"tma": tma_formatted, "raw_seconds": average_duration.total_seconds()}), 200
    else:
        return jsonify({"tma": "N/A", "raw_seconds": 0}), 200


# --- Rotas para Edificações (Prédios/Unidades) ---
EDIFICACAO_CAMPOS = ['nome', 'codigo', 'tipo_edificacao', 'endereco', 'numero', 'bairro', 'cidade',
                     'uf', 'cep', 'area_construida', 'num_pavimentos', 'ano_construcao',
                     'matricula_imovel', 'situacao', 'telefone', 'responsavel_local', 'observacoes']

@app.route('/api/edificacoes', methods=['POST'])
def criar_edificacao():
    data = request.json or {}
    if not data.get('nome'):
        return jsonify({"error": "O nome da edificação é obrigatório."}), 400

    conn = get_db_connection()
    try:
        cols = ', '.join(EDIFICACAO_CAMPOS)
        ph = ', '.join(['?'] * len(EDIFICACAO_CAMPOS))
        vals = [data.get(c) for c in EDIFICACAO_CAMPOS]
        conn.execute(f'INSERT INTO edificacoes ({cols}) VALUES ({ph})', vals)
        conn.commit()
        return jsonify({"message": "Edificação cadastrada com sucesso!", "id": conn.execute('SELECT last_insert_rowid()').fetchone()[0]}), 201
    except sqlite3.IntegrityError:
        return jsonify({"error": "Já existe uma edificação com este nome."}), 409
    except sqlite3.Error as e:
        conn.rollback()
        return jsonify({"error": f"Erro ao cadastrar edificação: {e}"}), 500
    finally:
        conn.close()

@app.route('/api/edificacoes', methods=['GET'])
def listar_edificacoes():
    conn = get_db_connection()
    edificacoes = conn.execute('SELECT * FROM edificacoes ORDER BY nome').fetchall()
    conn.close()
    edificacoes_dict = [dict(row) for row in edificacoes]
    return jsonify(edificacoes_dict)

# NOVA ROTA: Alterar Edificação
@app.route('/api/edificacoes/<int:edificacao_id>', methods=['GET'])
def get_edificacao(edificacao_id):
    conn = get_db_connection()
    row = conn.execute('SELECT * FROM edificacoes WHERE id = ?', (edificacao_id,)).fetchone()
    conn.close()
    if not row:
        return jsonify({"error": "Edificação não encontrada"}), 404
    return jsonify(dict(row))

@app.route('/api/edificacoes/<int:edificacao_id>', methods=['PUT'])
def alterar_edificacao(edificacao_id):
    data = request.json or {}
    campos = [c for c in EDIFICACAO_CAMPOS if c in data]
    if not campos:
        return jsonify({"message": "Nenhum campo para atualizar"}), 200
    conn = get_db_connection()
    try:
        sets = ', '.join(f'{c} = ?' for c in campos)
        vals = [data[c] for c in campos] + [edificacao_id]
        cursor = conn.execute(f'UPDATE edificacoes SET {sets} WHERE id = ?', vals)
        conn.commit()
        if cursor.rowcount == 0:
            return jsonify({"error": "Edificação não encontrada para atualização."}), 404
        return jsonify({"message": "Edificação atualizada com sucesso!"}), 200
    except sqlite3.IntegrityError:
        return jsonify({"error": "Já existe uma edificação com este nome."}), 409
    except sqlite3.Error as e:
        conn.rollback()
        return jsonify({"error": f"Erro ao atualizar edificação: {e}"}), 500
    finally:
        conn.close()

# NOVA ROTA: Excluir Edificação
@app.route('/api/edificacoes/<int:edificacao_id>', methods=['DELETE'])
def excluir_edificacao(edificacao_id):
    conn = get_db_connection()
    try:
        # Remove anexos físicos da edificação
        anexos = conn.execute('SELECT arquivo FROM edificacao_anexos WHERE edificacao_id = ?', (edificacao_id,)).fetchall()
        for a in anexos:
            if a['arquivo']:
                fp = os.path.join(app.config['UPLOAD_FOLDER'], a['arquivo'])
                if os.path.exists(fp):
                    try:
                        os.remove(fp)
                    except OSError:
                        pass
        conn.execute('DELETE FROM edificacao_anexos WHERE edificacao_id = ?', (edificacao_id,))
        conn.execute('DELETE FROM edificacao_demandas WHERE edificacao_id = ?', (edificacao_id,))
        cursor = conn.execute('DELETE FROM edificacoes WHERE id = ?', (edificacao_id,))
        conn.commit()
        if cursor.rowcount == 0:
            return jsonify({"error": "Edificação não encontrada para exclusão."}), 404
        return jsonify({"message": "Edificação excluída com sucesso!"}), 200
    except sqlite3.Error as e:
        conn.rollback()
        return jsonify({"error": f"Erro ao excluir edificação: {e}"}), 500
    finally:
        conn.close()

# --- Anexos da edificação (fotos, laudos, plantas) ---
@app.route('/api/edificacoes/<int:edificacao_id>/anexos', methods=['GET', 'POST'])
def edificacao_anexos(edificacao_id):
    conn = get_db_connection()
    try:
        if request.method == 'GET':
            rows = conn.execute('SELECT * FROM edificacao_anexos WHERE edificacao_id = ? ORDER BY id DESC', (edificacao_id,)).fetchall()
            return jsonify([dict(r) for r in rows])
        categoria = request.form.get('categoria')
        descricao = request.form.get('descricao')
        data_anexo = request.form.get('data')
        responsavel = request.form.get('responsavel')
        observacoes = request.form.get('observacoes')
        arquivo_nome = None
        if 'arquivo' in request.files:
            file = request.files['arquivo']
            if file and file.filename:
                if not allowed_file(file.filename):
                    return jsonify({"error": f"Tipo de arquivo não permitido: {file.filename}"}), 400
                arquivo_nome = secure_filename(str(uuid.uuid4()) + os.path.splitext(file.filename)[1])
                file.save(os.path.join(app.config['UPLOAD_FOLDER'], arquivo_nome))
        conn.execute(
            'INSERT INTO edificacao_anexos (edificacao_id, categoria, descricao, data, responsavel, arquivo, observacoes) VALUES (?, ?, ?, ?, ?, ?, ?)',
            (edificacao_id, categoria, descricao, data_anexo, responsavel, arquivo_nome, observacoes)
        )
        conn.commit()
        return jsonify({"message": "Anexo registrado com sucesso!", "id": conn.execute('SELECT last_insert_rowid()').fetchone()[0]}), 201
    except Exception as e:
        conn.rollback()
        return jsonify({"error": f"Erro ao salvar anexo: {e}"}), 500
    finally:
        conn.close()

@app.route('/api/edificacao_anexos/<int:item_id>', methods=['DELETE'])
def excluir_edificacao_anexo(item_id):
    conn = get_db_connection()
    try:
        a = conn.execute('SELECT arquivo FROM edificacao_anexos WHERE id = ?', (item_id,)).fetchone()
        if not a:
            return jsonify({"error": "Anexo não encontrado"}), 404
        if a['arquivo']:
            fp = os.path.join(app.config['UPLOAD_FOLDER'], a['arquivo'])
            if os.path.exists(fp):
                try:
                    os.remove(fp)
                except OSError:
                    pass
        conn.execute('DELETE FROM edificacao_anexos WHERE id = ?', (item_id,))
        conn.commit()
        return jsonify({"message": "Anexo excluído com sucesso!"}), 200
    except sqlite3.Error as e:
        conn.rollback()
        return jsonify({"error": f"Erro ao excluir anexo: {e}"}), 500
    finally:
        conn.close()

# --- Demandas da edificação ---
DEMANDA_CAMPOS = ['descricao', 'tipo_servico', 'prioridade', 'status', 'data_registro', 'responsavel', 'observacoes']

@app.route('/api/edificacoes/<int:edificacao_id>/demandas', methods=['GET', 'POST'])
def edificacao_demandas(edificacao_id):
    conn = get_db_connection()
    try:
        if request.method == 'GET':
            rows = conn.execute('SELECT * FROM edificacao_demandas WHERE edificacao_id = ? ORDER BY id DESC', (edificacao_id,)).fetchall()
            return jsonify([dict(r) for r in rows])
        data = request.json or {}
        cols = 'edificacao_id, ' + ', '.join(DEMANDA_CAMPOS)
        ph = ', '.join(['?'] * (len(DEMANDA_CAMPOS) + 1))
        vals = [edificacao_id] + [data.get(c) for c in DEMANDA_CAMPOS]
        conn.execute(f'INSERT INTO edificacao_demandas ({cols}) VALUES ({ph})', vals)
        conn.commit()
        return jsonify({"message": "Demanda registrada com sucesso!", "id": conn.execute('SELECT last_insert_rowid()').fetchone()[0]}), 201
    except sqlite3.Error as e:
        conn.rollback()
        return jsonify({"error": f"Erro ao salvar demanda: {e}"}), 500
    finally:
        conn.close()

@app.route('/api/edificacao_demandas/<int:item_id>', methods=['PUT', 'DELETE'])
def alterar_excluir_demanda(item_id):
    conn = get_db_connection()
    try:
        if request.method == 'DELETE':
            cur = conn.execute('DELETE FROM edificacao_demandas WHERE id = ?', (item_id,))
            conn.commit()
            if cur.rowcount == 0:
                return jsonify({"error": "Demanda não encontrada"}), 404
            return jsonify({"message": "Demanda excluída com sucesso!"}), 200
        data = request.json or {}
        campos = [c for c in DEMANDA_CAMPOS if c in data]
        if not campos:
            return jsonify({"message": "Nenhum campo para atualizar"}), 200
        sets = ', '.join(f'{c} = ?' for c in campos)
        vals = [data[c] for c in campos] + [item_id]
        conn.execute(f'UPDATE edificacao_demandas SET {sets} WHERE id = ?', vals)
        conn.commit()
        return jsonify({"message": "Demanda atualizada com sucesso!"}), 200
    except sqlite3.Error as e:
        conn.rollback()
        return jsonify({"error": f"Erro na demanda: {e}"}), 500
    finally:
        conn.close()

# --- Rotas para Tipos de Serviço (Manutenção da funcionalidade existente) ---
@app.route('/api/tipos_servico', methods=['POST'])
def criar_tipo_servico():
    data = request.json
    nome = data.get('nome')
    descricao = data.get('descricao')

    if not nome:
        return jsonify({"error": "O nome do tipo de serviço é obrigatório."}), 400

    conn = get_db_connection()
    try:
        conn.execute(
            'INSERT INTO tipos_servico (nome, descricao) VALUES (?, ?)',
            (nome, descricao)
        )
        conn.commit()
        return jsonify({"message": "Tipo de serviço cadastrado com sucesso!", "id": conn.execute('SELECT last_insert_rowid()').fetchone()[0]}), 201
    except sqlite3.IntegrityError:
        return jsonify({"error": "Já existe um tipo de serviço com este nome."}), 409
    except sqlite3.Error as e:
        conn.rollback()
        return jsonify({"error": f"Erro ao cadastrar tipo de serviço: {e}"}), 500
    finally:
        conn.close()

@app.route('/api/tipos_servico', methods=['GET'])
def listar_tipos_servico():
    conn = get_db_connection()
    tipos = conn.execute('SELECT * FROM tipos_servico ORDER BY nome').fetchall()
    conn.close()
    tipos_dict = [dict(row) for row in tipos]
    return jsonify(tipos_dict)

# --- Rotas para Usuários ---
@app.route('/api/usuarios', methods=['POST'])
def criar_usuario():
    bloqueio = admin_required()
    if bloqueio:
        return bloqueio
    data = request.json or {}
    nome = data.get('nome')
    email = data.get('email')
    perfil = data.get('perfil', 'Solicitante')
    senha = data.get('senha') or ''

    if not all([nome, email]):
        return jsonify({"error": "Nome e e-mail do usuário são obrigatórios."}), 400
    if len(senha) < 4:
        return jsonify({"error": "Informe uma senha inicial com ao menos 4 caracteres."}), 400

    conn = get_db_connection()
    try:
        conn.execute(
            'INSERT INTO usuarios (nome, email, perfil, senha_hash) VALUES (?, ?, ?, ?)',
            (nome, email, perfil, generate_password_hash(senha))
        )
        conn.commit()
        return jsonify({"message": "Usuário cadastrado com sucesso!", "id": conn.execute('SELECT last_insert_rowid()').fetchone()[0]}), 201
    except sqlite3.IntegrityError:
        return jsonify({"error": "Já existe um usuário com este e-mail."}), 409
    except sqlite3.Error as e:
        conn.rollback()
        return jsonify({"error": f"Erro ao cadastrar usuário: {e}"}), 500
    finally:
        conn.close()

@app.route('/api/usuarios', methods=['GET'])
def listar_usuarios():
    conn = get_db_connection()
    usuarios = conn.execute('SELECT id, nome, email, perfil FROM usuarios ORDER BY nome').fetchall()
    conn.close()
    usuarios_dict = [dict(row) for row in usuarios]
    return jsonify(usuarios_dict)

# NOVA ROTA: Alterar Usuário
@app.route('/api/usuarios/<int:usuario_id>', methods=['PUT'])
def alterar_usuario(usuario_id):
    bloqueio = admin_required()
    if bloqueio:
        return bloqueio
    data = request.json or {}
    nome = data.get('nome')
    email = data.get('email')
    perfil = data.get('perfil')
    senha = data.get('senha')  # opcional: se informada, redefine a senha

    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        if senha:
            cursor.execute('UPDATE usuarios SET nome = ?, email = ?, perfil = ?, senha_hash = ? WHERE id = ?',
                           (nome, email, perfil, generate_password_hash(senha), usuario_id))
        else:
            cursor.execute('UPDATE usuarios SET nome = ?, email = ?, perfil = ? WHERE id = ?',
                           (nome, email, perfil, usuario_id))
        conn.commit()
        if cursor.rowcount == 0:
            return jsonify({"error": "Usuário não encontrado para atualização."}), 404
        return jsonify({"message": "Usuário atualizado com sucesso!"}), 200
    except sqlite3.IntegrityError:
        return jsonify({"error": "Já existe um usuário com este e-mail."}), 409
    except sqlite3.Error as e:
        conn.rollback()
        return jsonify({"error": f"Erro ao atualizar usuário: {e}"}), 500
    finally:
        conn.close()

# NOVA ROTA: Excluir Usuário
@app.route('/api/usuarios/<int:usuario_id>', methods=['DELETE'])
def excluir_usuario(usuario_id):
    bloqueio = admin_required()
    if bloqueio:
        return bloqueio
    if usuario_id == session.get('user_id'):
        return jsonify({"error": "Você não pode excluir o próprio usuário."}), 400
    conn = get_db_connection()
    try:
        cursor = conn.execute('DELETE FROM usuarios WHERE id = ?', (usuario_id,))
        conn.commit()
        if cursor.rowcount == 0:
            return jsonify({"error": "Usuário não encontrado para exclusão."}), 404
        return jsonify({"message": "Usuário excluído com sucesso!"}), 200
    except sqlite3.Error as e:
        conn.rollback()
        return jsonify({"error": f"Erro ao excluir usuário: {e}"}), 500
    finally:
        conn.close()

# --- ROTAS PARA PLANOS DE MANUTENÇÃO PREVENTIVA ---
@app.route('/api/planos_manutencao', methods=['POST'])
def criar_plano_manutencao():
    data = request.json
    nome_plano = data.get('nome_plano')
    unidade = data.get('unidade')
    tipo_servico = data.get('tipo_servico')
    periodicidade_valor = data.get('periodicidade_valor')
    periodicidade_unidade = data.get('periodicidade_unidade')
    descricao_tarefa = data.get('descricao_tarefa')

    if not all([nome_plano, unidade, tipo_servico, periodicidade_valor, periodicidade_unidade]):
        return jsonify({"error": "Campos obrigatórios faltando para o plano de manutenção."}), 400

    data_proxima_execucao = calcular_proxima_data(datetime.now(), periodicidade_valor, periodicidade_unidade).isoformat()

    conn = get_db_connection()
    try:
        conn.execute(
            'INSERT INTO planos_manutencao (nome_plano, unidade, tipo_servico, periodicidade_valor, periodicidade_unidade, descricao_tarefa, data_ultima_execucao, data_proxima_execucao) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            (nome_plano, unidade, tipo_servico, periodicidade_valor, periodicidade_unidade, descricao_tarefa, None, data_proxima_execucao)
        )
        conn.commit()
        return jsonify({"message": "Plano de manutenção cadastrado com sucesso!", "id": conn.execute('SELECT last_insert_rowid()').fetchone()[0]}), 201
    except sqlite3.Error as e:
        conn.rollback()
        return jsonify({"error": f"Erro ao salvar plano de manutenção: {e}"}), 500
    finally:
        conn.close()

@app.route('/api/planos_manutencao', methods=['GET'])
def listar_planos_manutencao():
    conn = get_db_connection()
    planos = conn.execute('SELECT * FROM planos_manutencao ORDER BY nome_plano').fetchall()
    conn.close()
    planos_dict = [dict(row) for row in planos]
    return jsonify(planos_dict)

# --- FUNÇÕES E ROTA PARA GERAÇÃO AUTOMÁTICA DE OS DE MANUTENÇÃO PREVENTIVA ---

def calcular_proxima_data(data_base, valor, unidade):
    if unidade == 'dias':
        return data_base + timedelta(days=valor)
    elif unidade == 'semanas':
        return data_base + timedelta(weeks=valor)
    elif unidade == 'meses':
        try:
            return data_base.replace(month=data_base.month + valor)
        except ValueError:
            new_month = (data_base.month + valor - 1) % 12 + 1
            new_year = data_base.year + ((data_base.month + valor - 1) // 12)
            last_day_of_month = (datetime(new_year, new_month % 12 + 1, 1) - timedelta(days=1)).day if new_month != 12 else (datetime(new_year + 1, 1, 1) - timedelta(days=1)).day
            return datetime(new_year, new_month, min(data_base.day, last_day_of_month), data_base.hour, data_base.minute, data_base.second, data_base.microsecond)

    elif unidade == 'anos':
        try:
            return data_base.replace(year=data_base.year + valor)
        except ValueError:
            return data_base.replace(year=data_base.year + valor, day=28)
    return data_base

@app.route('/api/manutencao_preventiva/gerar_os', methods=['POST'])
def gerar_os_preventivas():
    conn = get_db_connection()
    cursor = conn.cursor()

    planos_gerados = []
    erros = []

    try:
        planos = cursor.execute("SELECT * FROM planos_manutencao WHERE status = 'Ativo'").fetchall()
        data_atual = datetime.now()

        for plano in planos:
            nome_plano = plano['nome_plano']
            unidade = plano['unidade']
            tipo_servico = plano['tipo_servico']
            periodicidade_valor = plano['periodicidade_valor']
            periodicidade_unidade = plano['periodicidade_unidade']
            descricao_tarefa = plano['descricao_tarefa']
            data_ultima_execucao_str = plano['data_ultima_execucao']
            data_proxima_execucao_str = plano['data_proxima_execucao']

            proxima_execucao_prevista = None
            if data_proxima_execucao_str:
                try:
                    proxima_execucao_prevista = datetime.fromisoformat(data_proxima_execucao_str)
                except ValueError:
                    print(f"Erro ao parsear data_proxima_execucao para plano {plano['id']}: {data_proxima_execucao_str}")
                    proxima_execucao_prevista = None

            if not proxima_execucao_prevista or proxima_execucao_prevista <= data_atual:

                base_data_calculo = data_atual
                if data_ultima_execucao_str:
                    try:
                        base_data_calculo = datetime.fromisoformat(data_ultima_execucao_str)
                    except ValueError:
                        print(f"Erro ao parsear data_ultima_execucao para plano {plano['id']}: {data_ultima_execucao_str}")
                        base_data_calculo = data_atual

                nova_data_proxima_execucao = calcular_proxima_data(base_data_calculo, periodicidade_valor, periodicidade_unidade)
                while nova_data_proxima_execucao <= data_atual:
                    nova_data_proxima_execucao = calcular_proxima_data(nova_data_proxima_execucao, periodicidade_valor, periodicidade_unidade)


                descricao_os = f"Manutenção Preventiva - {nome_plano} - {descricao_tarefa or 'Verificar e manter.'}"
                responsavel_os = "Sistema de Manutenção Preventiva"
                prestador_servico_os = None

                try:
                    cursor.execute(
                        'INSERT INTO ordens_servico (unidade, tipo_servico, descricao, prioridade, responsavel, status, data_solicitacao, prestador_servico, anexos) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                        (unidade, tipo_servico, descricao_os, 'Média', responsavel_os, 'Aberta', datetime.now().isoformat(), prestador_servico_os, None)
                    )
                    os_id = cursor.lastrowid;

                    cursor.execute(
                        'UPDATE planos_manutencao SET data_ultima_execucao = ?, data_proxima_execucao = ? WHERE id = ?',
                        (data_atual.isoformat(), nova_data_proxima_execucao.isoformat(), plano['id'])
                    )
                    planos_gerados.append({"plano_id": plano['id'], "os_gerada_id": os_id, "nome_plano": nome_plano})

                except sqlite3.Error as e:
                    erros.append({"plano_id": plano['id'], "erro": f"Erro ao criar OS ou atualizar plano: {e}"})

        conn.commit()
        return jsonify({
            "message": "Processo de geração de OS preventivas concluído.",
            "os_geradas": planos_gerados,
            "erros": erros
        }), 200
    except Exception as e:
        conn.rollback()
        return jsonify({"error": f"Erro geral no processo de geração de OS preventivas: {e}"}), 500
    finally:
        conn.close()

# --- ROTAS PARA PRESTADORES DE SERVIÇO ---
PRESTADOR_CAMPOS = ['nome_empresa', 'razao_social', 'nome_fantasia', 'cnpj', 'inscricao_estadual',
                    'inscricao_municipal', 'contato', 'contato_cargo', 'telefone', 'celular', 'email',
                    'site', 'endereco', 'numero', 'bairro', 'cidade', 'uf', 'cep', 'responsavel_tecnico',
                    'registro_profissional', 'porte', 'banco', 'agencia', 'conta', 'situacao', 'observacoes']

def _tipos_para_str(valor):
    return ",".join(valor) if isinstance(valor, list) else valor

@app.route('/api/prestadores_servico', methods=['POST'])
def criar_prestador_servico():
    data = request.json or {}
    if not data.get('nome_empresa'):
        return jsonify({"error": "O nome da empresa é obrigatório."}), 400

    campos = PRESTADOR_CAMPOS + ['tipos_servico_atendidos']
    valores = [data.get(c) for c in PRESTADOR_CAMPOS] + [_tipos_para_str(data.get('tipos_servico_atendidos'))]

    conn = get_db_connection()
    try:
        cols = ', '.join(campos)
        ph = ', '.join(['?'] * len(campos))
        conn.execute(f'INSERT INTO prestadores_servico ({cols}) VALUES ({ph})', valores)
        conn.commit()
        return jsonify({"message": "Prestador de serviço cadastrado com sucesso!", "id": conn.execute('SELECT last_insert_rowid()').fetchone()[0]}), 201
    except sqlite3.IntegrityError:
        return jsonify({"error": "Já existe um prestador de serviço com este nome de empresa."}), 409
    except sqlite3.Error as e:
        conn.rollback()
        return jsonify({"error": f"Erro ao cadastrar prestador de serviço: {e}"}), 500
    finally:
        conn.close()

@app.route('/api/prestadores_servico', methods=['GET'])
def listar_prestadores_servico():
    conn = get_db_connection()
    prestadores = conn.execute('SELECT * FROM prestadores_servico ORDER BY nome_empresa').fetchall()
    conn.close()

    prestadores_dict = []
    for row in prestadores:
        prestador = dict(row)
        if prestador['tipos_servico_atendidos']:
            prestador['tipos_servico_atendidos'] = prestador['tipos_servico_atendidos'].split(',')
        else:
            prestador['tipos_servico_atendidos'] = []
        prestadores_dict.append(prestador)

    return jsonify(prestadores_dict)

@app.route('/api/prestadores_servico/<string:tipo_servico>', methods=['GET'])
def buscar_prestadores_por_tipo(tipo_servico):
    conn = get_db_connection()
    query = "SELECT * FROM prestadores_servico WHERE tipos_servico_atendidos LIKE ? OR tipos_servico_atendidos LIKE ? OR tipos_servico_atendidos LIKE ? OR tipos_servico_atendidos = ?"
    prestadores = conn.execute(query, (
        f"{tipo_servico},%",
        f"%,{tipo_servico}",
        f"%,{tipo_servico},%",
        tipo_servico
    )).fetchall()
    conn.close()

    prestadores_dict = []
    for row in prestadores:
        prestador = dict(row)
        if prestador['tipos_servico_atendidos']:
            atendidos = [t.strip() for t in prestador['tipos_servico_atendidos'].split(',')]
            if tipo_servico in atendidos:
                prestador['tipos_servico_atendidos'] = atendidos
                prestadores_dict.append(prestador)

    return jsonify(prestadores_dict)

# NOVA ROTA: Obter um prestador
@app.route('/api/prestadores_servico/id/<int:prestador_id>', methods=['GET'])
def get_prestador(prestador_id):
    conn = get_db_connection()
    row = conn.execute('SELECT * FROM prestadores_servico WHERE id = ?', (prestador_id,)).fetchone()
    conn.close()
    if not row:
        return jsonify({"error": "Prestador não encontrado"}), 404
    p = dict(row)
    p['tipos_servico_atendidos'] = p['tipos_servico_atendidos'].split(',') if p.get('tipos_servico_atendidos') else []
    return jsonify(p)

# NOVA ROTA: Alterar Prestador de Serviço
@app.route('/api/prestadores_servico/<int:prestador_id>', methods=['PUT'])
def alterar_prestador_servico(prestador_id):
    data = request.json or {}
    if 'nome_empresa' in data and not data.get('nome_empresa'):
        return jsonify({"error": "O nome da empresa é obrigatório."}), 400

    campos = [c for c in PRESTADOR_CAMPOS if c in data]
    sets = [f'{c} = ?' for c in campos]
    vals = [data[c] for c in campos]
    if 'tipos_servico_atendidos' in data:
        sets.append('tipos_servico_atendidos = ?')
        vals.append(_tipos_para_str(data.get('tipos_servico_atendidos')))
    if not sets:
        return jsonify({"message": "Nenhum campo para atualizar"}), 200

    conn = get_db_connection()
    try:
        vals.append(prestador_id)
        cursor = conn.execute(f"UPDATE prestadores_servico SET {', '.join(sets)} WHERE id = ?", vals)
        conn.commit()
        if cursor.rowcount == 0:
            return jsonify({"error": "Prestador de serviço não encontrado para atualização."}), 404
        return jsonify({"message": "Prestador de serviço atualizado com sucesso!"}), 200
    except sqlite3.IntegrityError:
        return jsonify({"error": "Já existe um prestador de serviço com este nome de empresa."}), 409
    except sqlite3.Error as e:
        conn.rollback()
        return jsonify({"error": f"Erro ao atualizar prestador de serviço: {e}"}), 500
    finally:
        conn.close()

# --- Documentos do prestador (PDF/imagens) ---
@app.route('/api/prestadores_servico/<int:prestador_id>/documentos', methods=['GET', 'POST'])
def prestador_documentos(prestador_id):
    conn = get_db_connection()
    try:
        if request.method == 'GET':
            rows = conn.execute('SELECT * FROM prestador_documentos WHERE prestador_id = ? ORDER BY id DESC', (prestador_id,)).fetchall()
            return jsonify([dict(r) for r in rows])
        tipo = request.form.get('tipo')
        descricao = request.form.get('descricao')
        data_doc = request.form.get('data')
        validade = request.form.get('validade')
        observacoes = request.form.get('observacoes')
        arquivo_nome = None
        if 'arquivo' in request.files:
            file = request.files['arquivo']
            if file and file.filename:
                if not allowed_file(file.filename):
                    return jsonify({"error": f"Tipo de arquivo não permitido: {file.filename}"}), 400
                arquivo_nome = secure_filename(str(uuid.uuid4()) + os.path.splitext(file.filename)[1])
                file.save(os.path.join(app.config['UPLOAD_FOLDER'], arquivo_nome))
        conn.execute(
            'INSERT INTO prestador_documentos (prestador_id, tipo, descricao, data, validade, arquivo, observacoes) VALUES (?, ?, ?, ?, ?, ?, ?)',
            (prestador_id, tipo, descricao, data_doc, validade, arquivo_nome, observacoes)
        )
        conn.commit()
        return jsonify({"message": "Documento registrado com sucesso!", "id": conn.execute('SELECT last_insert_rowid()').fetchone()[0]}), 201
    except Exception as e:
        conn.rollback()
        return jsonify({"error": f"Erro ao salvar documento: {e}"}), 500
    finally:
        conn.close()

@app.route('/api/prestador_documentos/<int:item_id>', methods=['DELETE'])
def excluir_prestador_documento(item_id):
    conn = get_db_connection()
    try:
        doc = conn.execute('SELECT arquivo FROM prestador_documentos WHERE id = ?', (item_id,)).fetchone()
        if not doc:
            return jsonify({"error": "Documento não encontrado"}), 404
        if doc['arquivo']:
            fp = os.path.join(app.config['UPLOAD_FOLDER'], doc['arquivo'])
            if os.path.exists(fp):
                try:
                    os.remove(fp)
                except OSError:
                    pass
        conn.execute('DELETE FROM prestador_documentos WHERE id = ?', (item_id,))
        conn.commit()
        return jsonify({"message": "Documento excluído com sucesso!"}), 200
    except sqlite3.Error as e:
        conn.rollback()
        return jsonify({"error": f"Erro ao excluir documento: {e}"}), 500
    finally:
        conn.close()

# NOVA ROTA: Excluir Prestador de Serviço
@app.route('/api/prestadores_servico/<int:prestador_id>', methods=['DELETE'])
def excluir_prestador_servico(prestador_id):
    conn = get_db_connection()
    try:
        # Remove documentos físicos do prestador
        docs = conn.execute('SELECT arquivo FROM prestador_documentos WHERE prestador_id = ?', (prestador_id,)).fetchall()
        for dprestador in docs:
            if dprestador['arquivo']:
                fp = os.path.join(app.config['UPLOAD_FOLDER'], dprestador['arquivo'])
                if os.path.exists(fp):
                    try:
                        os.remove(fp)
                    except OSError:
                        pass
        conn.execute('DELETE FROM prestador_documentos WHERE prestador_id = ?', (prestador_id,))
        cursor = conn.execute('DELETE FROM prestadores_servico WHERE id = ?', (prestador_id,))
        conn.commit()
        if cursor.rowcount == 0:
            return jsonify({"error": "Prestador de serviço não encontrado para exclusão."}), 404
        return jsonify({"message": "Prestador de serviço excluído com sucesso!"}), 200
    except sqlite3.Error as e:
        conn.rollback()
        return jsonify({"error": f"Erro ao excluir prestador de serviço: {e}"}), 500
    finally:
        conn.close()

# ===================== MÓDULO DE CONTRATOS DE MANUTENÇÃO PREDIAL =====================

CONTRATO_CAMPOS = ['numero', 'processo', 'modalidade', 'objeto', 'contratada', 'cnpj',
                   'prestador_id', 'valor', 'data_inicio', 'data_termino', 'fonte_recursos',
                   'gestor', 'fiscal', 'situacao', 'observacoes']

# Sub-entidades vinculadas a um contrato. As chaves de tabela/campos são fixas (não vêm do usuário).
SUBENTIDADES = {
    'aditivos': {
        'table': 'contrato_aditivos',
        'campos': ['numero', 'tipo', 'data_assinatura', 'valor_acrescido', 'valor_suprimido',
                   'nova_vigencia_fim', 'fundamentacao', 'justificativa']
    },
    'prorrogacoes': {
        'table': 'contrato_prorrogacoes',
        'campos': ['numero', 'data_assinatura', 'vigencia_anterior', 'nova_vigencia', 'dias',
                   'fundamentacao', 'justificativa']
    },
    'apostilamentos': {
        'table': 'contrato_apostilamentos',
        'campos': ['numero', 'tipo', 'data', 'indice', 'percentual', 'valor_anterior',
                   'valor_novo', 'justificativa']
    },
    'empenhos': {
        'table': 'contrato_empenhos',
        'campos': ['numero', 'exercicio', 'natureza_despesa', 'fonte_recursos', 'data',
                   'valor_empenhado', 'valor_liquidado', 'valor_pago', 'observacoes']
    },
    'subcontratacoes': {
        'table': 'contrato_subcontratacoes',
        'campos': ['empresa', 'cnpj', 'responsavel_tecnico', 'objeto', 'percentual', 'valor',
                   'data_autorizacao', 'limite_permitido', 'observacoes']
    },
    'medicoes': {
        'table': 'contrato_medicoes',
        'campos': ['numero', 'periodo_inicio', 'periodo_fim', 'data', 'percentual_fisico',
                   'valor', 'fiscal', 'observacoes']
    },
    'garantias': {
        'table': 'contrato_garantias',
        'campos': ['tipo', 'numero_apolice', 'instituicao', 'valor', 'percentual', 'data_inicio',
                   'data_validade', 'situacao', 'observacoes']
    },
    'reajustes': {
        'table': 'contrato_reajustes',
        'campos': ['tipo', 'indice', 'percentual', 'valor_anterior', 'valor_novo', 'data',
                   'fundamentacao', 'justificativa']
    },
    'cronograma': {
        'table': 'contrato_cronograma',
        'campos': ['etapa', 'descricao', 'periodo_previsto', 'percentual_previsto', 'valor_previsto',
                   'percentual_realizado', 'valor_realizado', 'observacoes']
    },
    'riscos': {
        'table': 'contrato_riscos',
        'campos': ['descricao', 'categoria', 'probabilidade', 'impacto', 'nivel', 'resposta',
                   'responsavel', 'status']
    },
    'penalidades': {
        'table': 'contrato_penalidades',
        'campos': ['tipo', 'data', 'processo', 'valor_multa', 'fundamentacao', 'situacao', 'observacoes']
    },
    'recebimentos': {
        'table': 'contrato_recebimentos',
        'campos': ['tipo', 'numero_termo', 'data', 'responsavel', 'situacao', 'observacoes']
    },
    'fiscais': {
        'table': 'contrato_fiscais',
        'campos': ['tipo', 'nome', 'matricula', 'portaria', 'telefone', 'email', 'observacoes']
    },
}

@app.route('/api/contratos', methods=['POST'])
def criar_contrato():
    data = request.json or {}
    if not data.get('numero') or not data.get('objeto'):
        return jsonify({"error": "Número e objeto do contrato são obrigatórios."}), 400
    conn = get_db_connection()
    try:
        cols = ', '.join(CONTRATO_CAMPOS)
        ph = ', '.join(['?'] * len(CONTRATO_CAMPOS))
        vals = [data.get(c) for c in CONTRATO_CAMPOS]
        conn.execute(f'INSERT INTO contratos ({cols}) VALUES ({ph})', vals)
        conn.commit()
        new_id = conn.execute('SELECT last_insert_rowid()').fetchone()[0]
        return jsonify({"message": "Contrato cadastrado com sucesso!", "id": new_id}), 201
    except sqlite3.Error as e:
        conn.rollback()
        return jsonify({"error": f"Erro ao cadastrar contrato: {e}"}), 500
    finally:
        conn.close()

@app.route('/api/contratos', methods=['GET'])
def listar_contratos():
    conn = get_db_connection()
    rows = conn.execute('SELECT * FROM contratos ORDER BY id DESC').fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/contratos/<int:contrato_id>', methods=['GET'])
def get_contrato(contrato_id):
    conn = get_db_connection()
    row = conn.execute('SELECT * FROM contratos WHERE id = ?', (contrato_id,)).fetchone()
    conn.close()
    if not row:
        return jsonify({"error": "Contrato não encontrado"}), 404
    return jsonify(dict(row))

@app.route('/api/contratos/<int:contrato_id>', methods=['PUT'])
def atualizar_contrato(contrato_id):
    data = request.json or {}
    campos = [c for c in CONTRATO_CAMPOS if c in data]
    if not campos:
        return jsonify({"message": "Nenhum campo para atualizar"}), 200
    conn = get_db_connection()
    try:
        sets = ', '.join(f'{c} = ?' for c in campos)
        vals = [data[c] for c in campos] + [contrato_id]
        cur = conn.execute(f'UPDATE contratos SET {sets} WHERE id = ?', vals)
        conn.commit()
        if cur.rowcount == 0:
            return jsonify({"error": "Contrato não encontrado"}), 404
        return jsonify({"message": "Contrato atualizado com sucesso!"}), 200
    except sqlite3.Error as e:
        conn.rollback()
        return jsonify({"error": f"Erro ao atualizar contrato: {e}"}), 500
    finally:
        conn.close()

@app.route('/api/contratos/<int:contrato_id>', methods=['DELETE'])
def excluir_contrato(contrato_id):
    conn = get_db_connection()
    try:
        # Desvincula as OS e remove os registros dependentes
        conn.execute('UPDATE ordens_servico SET contrato_id = NULL WHERE contrato_id = ?', (contrato_id,))
        for cfg in SUBENTIDADES.values():
            conn.execute(f"DELETE FROM {cfg['table']} WHERE contrato_id = ?", (contrato_id,))
        # Remove documentos e seus arquivos físicos
        docs = conn.execute('SELECT arquivo FROM contrato_documentos WHERE contrato_id = ?', (contrato_id,)).fetchall()
        for d in docs:
            if d['arquivo']:
                fp = os.path.join(app.config['UPLOAD_FOLDER'], d['arquivo'])
                if os.path.exists(fp):
                    try:
                        os.remove(fp)
                    except OSError:
                        pass
        conn.execute('DELETE FROM contrato_documentos WHERE contrato_id = ?', (contrato_id,))
        cur = conn.execute('DELETE FROM contratos WHERE id = ?', (contrato_id,))
        conn.commit()
        if cur.rowcount == 0:
            return jsonify({"error": "Contrato não encontrado"}), 404
        return jsonify({"message": "Contrato excluído com sucesso!"}), 200
    except sqlite3.Error as e:
        conn.rollback()
        return jsonify({"error": f"Erro ao excluir contrato: {e}"}), 500
    finally:
        conn.close()

# CRUD genérico das sub-entidades (aditivos, prorrogações, apostilamentos, empenhos, subcontratações)
@app.route('/api/contratos/<int:contrato_id>/<entidade>', methods=['GET', 'POST'])
def contrato_subentidade(contrato_id, entidade):
    if entidade not in SUBENTIDADES:
        return jsonify({"error": "Entidade inválida"}), 404
    cfg = SUBENTIDADES[entidade]
    table, campos = cfg['table'], cfg['campos']
    conn = get_db_connection()
    try:
        if request.method == 'GET':
            rows = conn.execute(f'SELECT * FROM {table} WHERE contrato_id = ? ORDER BY id DESC', (contrato_id,)).fetchall()
            return jsonify([dict(r) for r in rows])
        data = request.json or {}
        cols = 'contrato_id, ' + ', '.join(campos)
        ph = ', '.join(['?'] * (len(campos) + 1))
        vals = [contrato_id] + [data.get(c) for c in campos]
        conn.execute(f'INSERT INTO {table} ({cols}) VALUES ({ph})', vals)
        conn.commit()
        new_id = conn.execute('SELECT last_insert_rowid()').fetchone()[0]
        return jsonify({"message": "Registro salvo com sucesso!", "id": new_id}), 201
    except sqlite3.Error as e:
        conn.rollback()
        return jsonify({"error": f"Erro ao salvar registro: {e}"}), 500
    finally:
        conn.close()

@app.route('/api/contrato_item/<entidade>/<int:item_id>', methods=['DELETE'])
def excluir_subentidade(entidade, item_id):
    if entidade not in SUBENTIDADES:
        return jsonify({"error": "Entidade inválida"}), 404
    table = SUBENTIDADES[entidade]['table']
    conn = get_db_connection()
    try:
        cur = conn.execute(f'DELETE FROM {table} WHERE id = ?', (item_id,))
        conn.commit()
        if cur.rowcount == 0:
            return jsonify({"error": "Registro não encontrado"}), 404
        return jsonify({"message": "Registro excluído com sucesso!"}), 200
    except sqlite3.Error as e:
        conn.rollback()
        return jsonify({"error": f"Erro ao excluir registro: {e}"}), 500
    finally:
        conn.close()

# --- Gestão Documental (upload de arquivos por contrato) ---
@app.route('/api/contratos/<int:contrato_id>/documentos', methods=['GET', 'POST'])
def contrato_documentos(contrato_id):
    conn = get_db_connection()
    try:
        if request.method == 'GET':
            rows = conn.execute('SELECT * FROM contrato_documentos WHERE contrato_id = ? ORDER BY id DESC', (contrato_id,)).fetchall()
            return jsonify([dict(r) for r in rows])

        tipo = request.form.get('tipo')
        descricao = request.form.get('descricao')
        data_doc = request.form.get('data')
        observacoes = request.form.get('observacoes')

        arquivo_nome = None
        if 'arquivo' in request.files:
            file = request.files['arquivo']
            if file and file.filename:
                if not allowed_file(file.filename):
                    return jsonify({"error": f"Tipo de arquivo não permitido: {file.filename}"}), 400
                arquivo_nome = secure_filename(str(uuid.uuid4()) + os.path.splitext(file.filename)[1])
                file.save(os.path.join(app.config['UPLOAD_FOLDER'], arquivo_nome))

        conn.execute(
            'INSERT INTO contrato_documentos (contrato_id, tipo, descricao, data, arquivo, observacoes) VALUES (?, ?, ?, ?, ?, ?)',
            (contrato_id, tipo, descricao, data_doc, arquivo_nome, observacoes)
        )
        conn.commit()
        new_id = conn.execute('SELECT last_insert_rowid()').fetchone()[0]
        return jsonify({"message": "Documento registrado com sucesso!", "id": new_id}), 201
    except Exception as e:
        conn.rollback()
        return jsonify({"error": f"Erro ao salvar documento: {e}"}), 500
    finally:
        conn.close()

@app.route('/api/contrato_documentos/<int:item_id>', methods=['DELETE'])
def excluir_documento(item_id):
    conn = get_db_connection()
    try:
        doc = conn.execute('SELECT arquivo FROM contrato_documentos WHERE id = ?', (item_id,)).fetchone()
        if not doc:
            return jsonify({"error": "Documento não encontrado"}), 404
        if doc['arquivo']:
            fp = os.path.join(app.config['UPLOAD_FOLDER'], doc['arquivo'])
            if os.path.exists(fp):
                try:
                    os.remove(fp)
                except OSError:
                    pass
        conn.execute('DELETE FROM contrato_documentos WHERE id = ?', (item_id,))
        conn.commit()
        return jsonify({"message": "Documento excluído com sucesso!"}), 200
    except sqlite3.Error as e:
        conn.rollback()
        return jsonify({"error": f"Erro ao excluir documento: {e}"}), 500
    finally:
        conn.close()

# --- Dashboard Executivo (consolida a carteira de contratos) ---
@app.route('/api/contratos/dashboard', methods=['GET'])
def contratos_dashboard():
    conn = get_db_connection()
    try:
        contratos = [dict(r) for r in conn.execute('SELECT * FROM contratos').fetchall()]
        aditivos = [dict(r) for r in conn.execute('SELECT * FROM contrato_aditivos').fetchall()]
        prorrogacoes = [dict(r) for r in conn.execute('SELECT * FROM contrato_prorrogacoes').fetchall()]
        empenhos = [dict(r) for r in conn.execute('SELECT * FROM contrato_empenhos').fetchall()]
        garantias = [dict(r) for r in conn.execute('SELECT * FROM contrato_garantias').fetchall()]
        medicoes = [dict(r) for r in conn.execute('SELECT * FROM contrato_medicoes').fetchall()]
        penalidades = [dict(r) for r in conn.execute('SELECT * FROM contrato_penalidades').fetchall()]
        riscos = [dict(r) for r in conn.execute('SELECT * FROM contrato_riscos').fetchall()]

        hoje = datetime.now().date()

        def soma(lista, campo):
            return sum(float(x.get(campo) or 0) for x in lista)

        valor_contratado = soma(contratos, 'valor')
        total_acrescido = soma(aditivos, 'valor_acrescido')
        total_suprimido = soma(aditivos, 'valor_suprimido')
        valor_atualizado = valor_contratado + total_acrescido - total_suprimido

        por_situacao = {}
        for c in contratos:
            s = c.get('situacao') or 'Sem situação'
            por_situacao[s] = por_situacao.get(s, 0) + 1

        # Vigência atual por contrato (maior data entre término, prorrogações e aditivos)
        def vigencia_atual(cid, termino):
            datas = [termino]
            datas += [p.get('nova_vigencia') for p in prorrogacoes if p.get('contrato_id') == cid]
            datas += [a.get('nova_vigencia_fim') for a in aditivos if a.get('contrato_id') == cid]
            datas = [str(d).split('T')[0] for d in datas if d]
            return max(datas) if datas else None

        contratos_a_vencer = 0
        contratos_vencidos = 0
        for c in contratos:
            if (c.get('situacao') or '') in ('Encerrado', 'Rescindido'):
                continue
            v = vigencia_atual(c['id'], c.get('data_termino'))
            if not v:
                continue
            try:
                d = datetime.fromisoformat(v).date()
                dias = (d - hoje).days
                if dias < 0:
                    contratos_vencidos += 1
                elif dias <= 60:
                    contratos_a_vencer += 1
            except ValueError:
                pass

        garantias_a_vencer = 0
        garantias_vencidas = 0
        for g in garantias:
            v = g.get('data_validade')
            if not v:
                continue
            try:
                d = datetime.fromisoformat(str(v).split('T')[0]).date()
                dias = (d - hoje).days
                if dias < 0:
                    garantias_vencidas += 1
                elif dias <= 60:
                    garantias_a_vencer += 1
            except ValueError:
                pass

        riscos_altos = sum(1 for r in riscos if (r.get('nivel') or r.get('impacto') or '') in ('Alto', 'Alta', 'Muito alto', 'Crítico'))

        return jsonify({
            "total_contratos": len(contratos),
            "por_situacao": por_situacao,
            "valor_contratado": valor_contratado,
            "total_aditivos": total_acrescido - total_suprimido,
            "valor_atualizado": valor_atualizado,
            "empenhado": soma(empenhos, 'valor_empenhado'),
            "liquidado": soma(empenhos, 'valor_liquidado'),
            "pago": soma(empenhos, 'valor_pago'),
            "total_medido": soma(medicoes, 'valor'),
            "contratos_a_vencer": contratos_a_vencer,
            "contratos_vencidos": contratos_vencidos,
            "garantias_a_vencer": garantias_a_vencer,
            "garantias_vencidas": garantias_vencidas,
            "penalidades": len(penalidades),
            "riscos_altos": riscos_altos
        }), 200
    finally:
        conn.close()

# --- Relatório gerencial da carteira de contratos ---
@app.route('/api/relatorios/contratos', methods=['GET'])
def relatorio_contratos():
    conn = get_db_connection()
    try:
        contratos = [dict(r) for r in conn.execute('SELECT * FROM contratos').fetchall()]
        aditivos = [dict(r) for r in conn.execute('SELECT * FROM contrato_aditivos').fetchall()]
        prorrog = [dict(r) for r in conn.execute('SELECT * FROM contrato_prorrogacoes').fetchall()]
        empenhos = [dict(r) for r in conn.execute('SELECT * FROM contrato_empenhos').fetchall()]
        medicoes = [dict(r) for r in conn.execute('SELECT * FROM contrato_medicoes').fetchall()]
        os_counts = {}
        for cid, n in conn.execute('SELECT contrato_id, COUNT(*) FROM ordens_servico WHERE contrato_id IS NOT NULL GROUP BY contrato_id'):
            os_counts[cid] = n
        hoje = datetime.now().date()
        out = []
        for c in contratos:
            cid = c['id']
            ad = [a for a in aditivos if a['contrato_id'] == cid]
            acr = sum(float(a.get('valor_acrescido') or 0) for a in ad)
            sup = sum(float(a.get('valor_suprimido') or 0) for a in ad)
            valor = float(c.get('valor') or 0)
            valor_atu = valor + acr - sup
            perc = (acr / valor * 100) if valor else 0
            datas = [c.get('data_termino')] + [p.get('nova_vigencia') for p in prorrog if p['contrato_id'] == cid] + [a.get('nova_vigencia_fim') for a in ad]
            datas = [str(x).split('T')[0] for x in datas if x]
            vig = max(datas) if datas else None
            dias = None
            if vig:
                try:
                    dias = (datetime.fromisoformat(vig).date() - hoje).days
                except ValueError:
                    dias = None
            emp = [e for e in empenhos if e['contrato_id'] == cid]
            out.append({
                'id': cid, 'numero': c.get('numero'), 'objeto': c.get('objeto'),
                'contratada': c.get('contratada'), 'situacao': c.get('situacao'), 'modalidade': c.get('modalidade'),
                'valor': valor, 'total_acrescido': acr, 'total_suprimido': sup, 'valor_atualizado': valor_atu,
                'perc_aditivo': perc, 'vigencia_atual': vig, 'dias_restantes': dias,
                'empenhado': sum(float(e.get('valor_empenhado') or 0) for e in emp),
                'liquidado': sum(float(e.get('valor_liquidado') or 0) for e in emp),
                'pago': sum(float(e.get('valor_pago') or 0) for e in emp),
                'medido': sum(float(m.get('valor') or 0) for m in medicoes if m['contrato_id'] == cid),
                'qtd_os': os_counts.get(cid, 0)
            })
        out.sort(key=lambda x: (x['dias_restantes'] is None, x['dias_restantes'] if x['dias_restantes'] is not None else 0))
        return jsonify(out)
    finally:
        conn.close()

# --- Dossiê completo de um contrato (relatório geral) ---
@app.route('/api/contratos/<int:contrato_id>/relatorio', methods=['GET'])
def contrato_relatorio(contrato_id):
    conn = get_db_connection()
    try:
        c = conn.execute('SELECT * FROM contratos WHERE id = ?', (contrato_id,)).fetchone()
        if not c:
            return jsonify({"error": "Contrato não encontrado"}), 404
        dossie = {'contrato': dict(c)}
        for ent, cfg in SUBENTIDADES.items():
            rows = conn.execute(f"SELECT * FROM {cfg['table']} WHERE contrato_id = ? ORDER BY id", (contrato_id,)).fetchall()
            dossie[ent] = [dict(r) for r in rows]
        docs = conn.execute('SELECT * FROM contrato_documentos WHERE contrato_id = ? ORDER BY id', (contrato_id,)).fetchall()
        dossie['documentos'] = [dict(r) for r in docs]
        os_rows = conn.execute('SELECT * FROM ordens_servico WHERE contrato_id = ? ORDER BY id DESC', (contrato_id,)).fetchall()
        dossie['ordens_servico'] = [dict(r) for r in os_rows]
        return jsonify(dossie)
    finally:
        conn.close()


if __name__ == '__main__':
    print(f"Servidor Flask inicializado. O banco de dados está em: {os.path.abspath(DATABASE)}")
    print("Acesse: http://127.0.0.1:5000/")
    # debug desligado por padrão (mais seguro). Para desenvolvimento, rode com FLASK_DEBUG=1
    debug_mode = os.environ.get('FLASK_DEBUG', '0') == '1'
    app.run(debug=debug_mode)