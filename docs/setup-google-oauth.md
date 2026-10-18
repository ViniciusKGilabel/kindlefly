# Configurar o login do Google (Gmail API)

O kindlefly envia o EPUB pelo **seu** Gmail. Para isso você cria um projeto próprio no Google Cloud e gera um client ID OAuth. Leva uns 10 minutos.

## 1. Criar o projeto
1. Acesse <https://console.cloud.google.com/> e crie um projeto (ex.: `kindlefly`).

## 2. Ativar a Gmail API
1. Menu **APIs e serviços > Biblioteca**, procure **Gmail API** e clique em **Ativar**.

## 3. Tela de consentimento OAuth
1. **APIs e serviços > Tela de consentimento OAuth** (ou "Google Auth Platform").
2. Tipo de usuário: **Externo**. Status de publicação: **Teste** (não precisa publicar).
3. Preencha nome do app e e-mails de contato.
4. Em **Escopos**, adicione: `openid`, `email` e `https://www.googleapis.com/auth/gmail.send`.
5. Em **Usuários de teste**, adicione **todos os e-mails Gmail** que vão usar a extensão (inclusive o seu).

## 4. Credencial OAuth
1. **APIs e serviços > Credenciais > Criar credenciais > ID do cliente OAuth**.
2. Tipo de aplicativo: **Aplicativo da Web** (não "Extensão do Chrome").
3. Em **URIs de redirecionamento autorizados**, adicione exatamente, **com a barra final**:

   ```
   https://mldnanjggjdhajchcgldihldickkjfee.chromiumapp.org/
   ```

   Esse é o ID fixo da extensão (vem da chave pública em `wxt.config.ts`). Para recalcular: `node scripts/gen-key.mjs` imprime o ID.
4. Copie o **ID do cliente** gerado.

## 5. Configurar o projeto
```bash
cp .env.example .env.local
# edite .env.local e cole: WXT_GOOGLE_CLIENT_ID=<seu client id>
pnpm wxt build   # ou pnpm dev
```
Carregue `.output/chrome-mv3` em `chrome://extensions` (modo desenvolvedor > Carregar sem compactação). Sem o client ID, as Configurações mostram um aviso apontando para este guia.

## 6. Amazon
1. Em Amazon > **Conteúdo e dispositivos > Preferências > Configurações de documentos pessoais**:
   - adicione o seu Gmail à **Approved Personal Document E-mail List**;
   - copie o endereço `@kindle.com` do seu Kindle.
2. No painel da extensão (engrenagem), cole o endereço `@kindle.com`, salve e clique em **Conectar conta Google**.

## Se aparecer erro 404/400 no login
- O URI de redirecionamento está **sem a barra final** (`...chromiumapp.org` em vez de `...chromiumapp.org/`).
- O tipo de credencial está errado: tem de ser **Aplicativo da Web**.
- O ID da extensão carregada é diferente do cadastrado (confira em `chrome://extensions`; deve ser `mldnanjggjdhajchcgldihldickkjfee`, o que exige a chave fixa do `wxt.config.ts`).
- O e-mail que você está usando **não está na lista de usuários de teste**.
- Depois de mudar `.env.local`, recompile a extensão e recarregue-a.
