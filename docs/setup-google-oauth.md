# Configurar o login do Google (Gmail API)

O kindlefly envia o EPUB pelo **seu** Gmail. Para isso você cria um projeto próprio no Google Cloud e gera um client ID OAuth. Leva uns 10 minutos.

## 1. Criar o projeto
1. Acesse <https://console.cloud.google.com/> e crie um projeto (ex.: `kindlefly`).

## 2. Ativar a Gmail API
1. Menu **APIs e serviços > Biblioteca**, procure **Gmail API** e clique em **Ativar**.

## 3. Google Auth Platform (tela de permissão)
Menu **Google Auth Platform** (ou **APIs e serviços > Tela de permissão OAuth**, que redireciona para lá).
1. Na primeira vez, o assistente inicial pede: **Nome do app** `kindlefly`, **E-mail de suporte do usuário**, **Público-alvo: Externo** e **E-mail de contato**. Aceite os termos e crie.
2. Menu lateral **Branding**: pode deixar como está (nome e e-mail de suporte já bastam).
3. Menu lateral **Público-alvo**: confirme o **Status de publicação: Teste** (não precisa publicar). Em **Usuários de teste > Add users**, adicione **o Gmail de cada pessoa** que vai usar a extensão (inclusive o seu).
4. Menu lateral **Acesso a dados > Adicionar ou remover escopos**: marque/adicione exatamente
   - `openid`
   - `.../auth/userinfo.email`
   - `https://www.googleapis.com/auth/gmail.send`

   e salve.

## 4. Cliente OAuth
1. Menu lateral **Clientes > Criar cliente**.
2. Tipo de aplicativo: **Aplicativo da Web** (não "Extensão do Chrome").
3. Em **URIs de redirecionamento autorizados**, adicione exatamente, **com a barra final**:

   ```
   https://mldnanjggjdhajchcgldihldickkjfee.chromiumapp.org/
   ```

   Esse é o ID fixo da extensão (vem da chave pública em `wxt.config.ts`). Para recalcular: `node scripts/gen-key.mjs` imprime o ID.
4. **Origens JavaScript autorizadas**: deixe em branco.
5. Crie e copie o **ID do cliente**. Um cliente novo pode levar alguns minutos (até ~5) para começar a funcionar.

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

## O que esperar no login
- **"O Google não verificou este app"**: é normal no modo Teste. Clique em **Avançado > Acessar kindlefly (não seguro)**.
- Na tela de permissões, **marque a caixa "Enviar e-mail em seu nome"**. Se desmarcar, o login falha com a mensagem de permissão de envio não concedida (`scope_missing`); conecte de novo e marque.
- No modo Teste, as autorizações expiram em ~7 dias: a janela de login reaparecer depois disso é esperado.


## Se aparecer erro 404/400 no login
- O URI de redirecionamento está **sem a barra final** (`...chromiumapp.org` em vez de `...chromiumapp.org/`).
- O tipo de credencial está errado: tem de ser **Aplicativo da Web**.
- O ID da extensão carregada é diferente do cadastrado (confira em `chrome://extensions`; deve ser `mldnanjggjdhajchcgldihldickkjfee`, o que exige a chave fixa do `wxt.config.ts`).
- O e-mail que você está usando **não está na lista de usuários de teste**.
- Acabou de criar o cliente: espere alguns minutos (até ~5) e tente de novo.
- Depois de mudar `.env.local`, recompile a extensão e recarregue-a.
- Para ver o motivo real de uma falha: abra o console do painel (botão direito no painel > Inspecionar) e procure as mensagens `[kindlefly]` (código e detalhe, nunca tokens).
