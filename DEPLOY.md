# 🚀 Guia de Implantação — Sistema de Manutenção Predial

Este guia coloca o sistema no ar e o liga ao seu site **www.obrasinteligentes.ia.br**
(hospedado na Hostinger), **sem alterar a sua página inicial** — apenas adicionando um
botão "Manutenção Predial" que abre o sistema.

---

## 🧭 Como a arquitetura funciona (e por quê)

O sistema é uma aplicação **Python/Flask** com banco **SQLite** e **upload de arquivos**.
A **Hostinger Business (hospedagem compartilhada) NÃO executa Python/Flask** — ela serve
PHP e arquivos estáticos. Por isso:

```
  [ Página inicial ]                 [ Sistema Manutenção Predial ]
  www.obrasinteligentes.ia.br        manutencao.obrasinteligentes.ia.br
  Fica na HOSTINGER (como hoje)  --->  Roda no PYTHONANYWHERE (Python)
        (botão/link)                   (código vindo do seu GitHub)
```

Usamos o **PythonAnywhere** porque ele tem **armazenamento persistente**: seus dados e
arquivos enviados **não são apagados** quando o app reinicia. (Em hosts "grátis" como o
Render, o banco SQLite seria perdido a cada atualização — inadequado para um sistema real.)

---

## ✅ Pré-requisitos (contas gratuitas)

1. Conta no **GitHub** — https://github.com
2. Conta no **PythonAnywhere** — https://www.pythonanywhere.com (plano "Beginner" é grátis)
3. Acesso ao **hPanel da Hostinger** (para o subdomínio, opcional)

> O **Git já está instalado** na sua máquina. Os comandos abaixo são para rodar no
> **Git Bash** ou no **PowerShell**, dentro da pasta do projeto.

---

## 1️⃣ Subir o código para o GitHub

1. No GitHub, clique em **New repository**, nomeie como `manutencao-predial`,
   deixe **vazio** (sem README) e clique em **Create repository**.

2. Na sua máquina, dentro da pasta do projeto, rode:

```bash
cd "C:/Sistema Manutenção Predial"
git init
git add .
git commit -m "Sistema de Manutenção Predial - versao inicial"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/manutencao-predial.git
git push -u origin main
```

> Troque `SEU_USUARIO` pelo seu usuário do GitHub. Na primeira vez o GitHub pedirá login
> (use seu usuário e um **token de acesso pessoal** como senha — gerado em
> GitHub → Settings → Developer settings → Personal access tokens).

✔️ O `.gitignore` já garante que `database.db` e a pasta `uploads/` **não** vão para o
GitHub — eles são criados automaticamente no servidor.

---

## 2️⃣ Publicar no PythonAnywhere

1. Crie a conta grátis e faça login.
2. Vá em **Consoles → Bash** e clone o seu repositório:

```bash
git clone https://github.com/SEU_USUARIO/manutencao-predial.git
```

3. Instale as dependências:

```bash
cd manutencao-predial
pip install --user -r requirements.txt
```

4. Vá na aba **Web → Add a new web app**:
   - Escolha **Manual configuration** (NÃO o "Flask" automático).
   - Selecione **Python 3.10** (ou superior).

---

## 3️⃣ Configurar o arquivo WSGI

Na aba **Web**, clique no link do **WSGI configuration file** (algo como
`/var/www/SEU_USUARIO_pythonanywhere_com_wsgi.py`), **apague todo o conteúdo** e cole:

```python
import sys

# Caminho da pasta do projeto (troque SEU_USUARIO)
project_home = '/home/SEU_USUARIO/manutencao-predial'
if project_home not in sys.path:
    sys.path.insert(0, project_home)

from app import app as application
```

Salve. Ainda na aba **Web**:
- Em **Source code** e **Working directory**, aponte para `/home/SEU_USUARIO/manutencao-predial`.
- Clique no botão verde **Reload**.

✔️ Acesse `https://SEU_USUARIO.pythonanywhere.com` — o sistema deve abrir.
O banco e as tabelas são criados sozinhos na primeira execução.

> **Dados de exemplo (opcional):** no console Bash, rode
> `python3 seed_dados_teste.py` para popular o sistema com dados de demonstração.

---

## 4️⃣ Ligar o botão na sua página inicial (já funciona aqui!)

Mesmo no plano grátis, o sistema já está acessível pela URL
`https://SEU_USUARIO.pythonanywhere.com`. Basta adicionar um botão na sua página inicial
apontando para ela. **Como** adicionar depende de como o seu site foi feito
(veja no hPanel → **Sites**):

- **Site em HTML estático:** adicione este link onde quiser o botão:
  ```html
  <a href="https://SEU_USUARIO.pythonanywhere.com" target="_blank"
     style="display:inline-block;padding:14px 28px;background:#2c3e50;color:#fff;
            border-radius:8px;text-decoration:none;font-weight:bold;">
     🏢 Manutenção Predial
  </a>
  ```
- **WordPress:** edite a página, adicione um bloco **Botão** e cole a URL no link.
- **Hostinger Website Builder:** adicione um elemento **Botão** e defina a URL no link.

---

## 5️⃣ (Opcional) Usar o subdomínio próprio `manutencao.obrasinteligentes.ia.br`

O domínio personalizado exige o plano **Hacker do PythonAnywhere (~US$ 5/mês)**, que também
mantém o app **sempre ativo**. Passos:

1. No PythonAnywhere, faça upgrade para **Hacker** e, na aba **Web**, em **Add a new domain**,
   digite `manutencao.obrasinteligentes.ia.br`. Ele mostrará um destino tipo
   `webapp-XXXXX.pythonanywhere.com`.
2. No **hPanel da Hostinger → Domínios → DNS / Zona DNS**, crie um registro:
   - **Tipo:** CNAME
   - **Nome/Host:** `manutencao`
   - **Aponta para / Destino:** `webapp-XXXXX.pythonanywhere.com` (o que apareceu no passo 1)
   - **TTL:** padrão
3. Aguarde a propagação (de minutos a algumas horas) e clique em **Reload** no PythonAnywhere.
4. Atualize o botão da página inicial para `https://manutencao.obrasinteligentes.ia.br`.

---

## 🔄 Atualizações futuras

Quando alterarmos o sistema, basta:

```bash
# na sua máquina
git add . && git commit -m "descricao da mudanca" && git push

# no console Bash do PythonAnywhere
cd manutencao-predial && git pull
```

E clicar em **Reload** na aba **Web**. Pronto.

---

## 🔐 Login e segurança

O sistema **tem login com senha e perfis de acesso** (Administrador, Gestor, Executor,
Solicitante). Todas as páginas e APIs exigem autenticação.

- **Primeiro acesso:** na primeira execução, o sistema cria automaticamente um administrador:
  - **E-mail:** `admin@obrasinteligentes.ia.br`
  - **Senha:** `admin123`
  - 👉 **Troque essa senha imediatamente** após entrar (botão 🔑 no topo do sistema).
  - Se você rodar o `seed_dados_teste.py`, use `andre.baeta@orgao.gov` / `admin123`.
- **Apenas administradores** podem cadastrar/editar usuários e definir senhas.

### Defina a chave de sessão (SECRET_KEY)

Os logins são assinados por uma chave secreta. Em produção, defina uma chave aleatória:

- No PythonAnywhere, aba **Web → Environment variables**, adicione:
  - **Nome:** `SECRET_KEY`
  - **Valor:** uma sequência longa e aleatória (ex.: gere uma com letras/números).
- Clique em **Reload**.

> Sem isso, o app usa uma chave padrão (funciona, mas é menos seguro para uso público).

> No plano grátis do PythonAnywhere, o app precisa ser **renovado a cada 3 meses**
> (um botão "Run until 3 months from today" aparece na aba Web). O plano Hacker remove isso.
