# Spec — kindlefly

> Versão 1 (paridade). Escrita em 2026-10-18 a partir da conversa de brainstorming.
> Itens marcados **[decisão do Claude]** foram escolhas minhas, não do dono do projeto — revise-os.

## Objetivo

Extensão do Chrome que transforma páginas web em EPUB e envia para o Kindle, 100% no navegador do usuário.

A v1 tem um objetivo só: **paridade funcional com a extensão "Send Web to Kindle"** (Chrome Web Store, id `egoihiminiafbalfnlekfhhmccihbgpe`). O dono vai adicionar funcionalidades próprias numa fase 2, então a v1 precisa ser uma base sólida, não um protótipo.

O ponto que justifica o projeto: **o envio pelo Gmail tem que funcionar de verdade.** Numa tentativa anterior do dono (sem código guardado), a janela de login do Google dava erro 404 e ele acabava baixando o EPUB e enviando à mão. Se o envio pelo Gmail não funcionar, a v1 falhou — mesmo que todo o resto funcione.

## Usuários

Leitores de Kindle que querem ler artigos, posts, documentação e mangás/quadrinhos da web no Kindle. Na v1, o próprio dono e até ~100 testadores (limite do modo de teste do OAuth do Google — ver Riscos).

## Escopo (v1)

Funcionalidades, todas da extensão original, salvo onde indicado:

1. **Entrada**
   - Clique no ícone da extensão: abre o painel lateral e extrai a aba atual para a fila. **[decisão do Claude]** Se a URL já estiver na fila, não duplica; só seleciona o item.
   - Menu de contexto (botão direito): "Salvar artigo como EPUB" (na página) e "Salvar seleção como EPUB" (com texto selecionado). Ambos abrem o painel e adicionam o item à fila.
2. **Extração e limpeza**: isola o conteúdo principal da página; remove scripts, anúncios, rastreadores, menus, sidebars. Preserva parágrafos, títulos, listas, tabelas, blocos de código e imagens inline. Extrai título e autor (byline / metadados da página; fallback: nome do site).
3. **Extração contínua**: cada extração vira um item numa fila (a "lista de nomes" no painel). A fila acumula páginas e seleções de abas diferentes.
4. **Painel lateral** (Chrome Side Panel; faixa estreita na lateral, como na original — layout igual, visual pode ser diferente). De cima para baixo:
   1. Campos **Título** e **Autor** (do item selecionado; no modo "juntar", do livro — ver Exportação)
   2. Botões **Baixar EPUB** e **Enviar para o Kindle**, e o seletor do modo de exportação
   3. **Lista de nomes** dos itens da fila (só o nome). Selecionar um item mostra a prévia dele. Cada item pode ser removido. Botão para limpar a fila.
   4. **Prévia editável** do item selecionado, com **editor de texto rico** (igual à original): formatar texto, apagar trechos, apagar imagens. O que está na prévia é exatamente o que vai para o EPUB.
   - Configurações atrás de um ícone de engrenagem **[decisão do Claude]**: conta Google conectada (conectar/desconectar), endereço Send-to-Kindle, e instruções de configuração da Amazon.
5. **Exportação** — dois modos:
   - **Um EPUB por item** (cada página vira um arquivo).
   - **Juntar tudo em um EPUB**: cada item vira um capítulo; o sumário lista os capítulos e, dentro deles, os títulos. Título padrão do livro: o do primeiro item **[decisão do Claude]**, editável.
6. **EPUB**: arquivo válido que a Amazon aceita. Sumário gerado a partir de H1–H6.
7. **Imagens**: baixadas em paralelo e embutidas no EPUB; comprimidas e redimensionadas para tela e-ink; formatos que o Kindle não aceita (WebP, AVIF, SVG etc.) convertidos.
8. **Mangá/quadrinhos**: páginas que são basicamente uma sequência de imagens são detectadas automaticamente e extraídas como sequência de imagens, uma por página do EPUB **[decisão do Claude]**; há um botão para forçar esse modo.
   - **Prioridade: mangá em páginas** (cada imagem é uma página).
   - **Tiras verticais longas (webtoon / "mangá em lista")**: o dono pediu, "se possível", que sejam cortadas em pedaços do tamanho da tela do Kindle. Entra na v1 com prioridade menor que o mangá em páginas. **[decisão do Claude]** Cortar preferencialmente nas faixas brancas/lisas entre quadros, para não partir balões; sem faixa disponível, cortar na altura da página.
   - EPUB reflowable com cada imagem ocupando a página (não fixed-layout, que o Send-to-Kindle por e-mail trata mal) **[decisão do Claude]**.
9. **Envio para o Kindle via Gmail**: o usuário conecta a conta Google uma vez e cadastra o endereço `@kindle.com`. "Enviar para o Kindle" manda o(s) EPUB(s) como anexo de e-mail a partir do Gmail do próprio usuário, pela Gmail API, direto do navegador.
   - Respeitar o limite de tamanho por e-mail do Gmail (~25 MB). Vários arquivos são agrupados em e-mails que caibam no limite **[decisão do Claude]**. Um arquivo único maior que o limite: avisa e oferece "Baixar EPUB".
   - Mensagens de erro claras para: não conectado, endereço Kindle ausente/inválido, token expirado/revogado, arquivo grande demais, falha de rede.
   - Configuração guiada: lembrar o usuário de adicionar o seu Gmail à lista "Approved Personal Document E-mail List" na conta Amazon (sem isso a Amazon descarta o e-mail em silêncio).
10. **Baixar EPUB**: salva o(s) arquivo(s) localmente. Nome do arquivo = título sanitizado + `.epub`.
11. **Idiomas**: português (BR), inglês e espanhol, conforme o idioma do Chrome. Fallback: inglês **[decisão do Claude]**.
12. **Privacidade**: nenhum servidor próprio. O único serviço externo contatado é a API do Google (OAuth + Gmail), e só no envio. Configurações e fila guardadas localmente.

**Definição de paridade [decisão do Claude]:** a lista acima é a definição completa de paridade para a v1. Não há auditoria item a item da extensão original. Detalhes não listados (botões da barra do editor, atalhos) ficam com o builder, com o critério "o que um leitor espera de um editor simples".

## Não-escopo (v1)

- App de celular / PWA (a original tem; fica de fora).
- Histórico de arquivos exportados.
- Funcionalidades novas da fase 2 (o dono vai definir depois).
- Saída em outros formatos (PDF, MOBI, AZW3).
- Outros navegadores (Firefox, Edge, Safari). Só Chrome.
- Verificação do app OAuth pelo Google para publicação aberta na Chrome Web Store (necessária depois; ver Riscos).
- Links de doação/apoio (nada do Ko-fi do autor da original).

## Anti-objetivos (falhou, mesmo que "funcione")

- O login do Google dá erro (404 ou outro) ou o envio pelo Gmail não chega no Kindle.
- O Kindle/Amazon rejeita o EPUB gerado (e-mail de "falha na conversão").
- Qualquer conteúdo de página ou dado do usuário trafega por um servidor que não seja o Google no ato do envio.
- Copiar código, nome, logo, textos ou identidade visual da extensão original. Copiamos **o que ela faz e o layout do painel**, não os assets dela.
- Pedir permissões além do necessário (especialmente escopos do Gmail além de `gmail.send`).

## Requisitos e restrições técnicas

**Decididas na conversa:**
- Chrome Manifest V3, painel via `chrome.sidePanel`.
- TypeScript.
- Extração com `@mozilla/readability`.
- EPUB gerado pela própria extensão com JSZip (foliate-js é leitor, não gerador — descartado).
- **O usuário escolhe na configuração qual conta Gmail usa para enviar** — pode ser diferente da conta do perfil do Chrome. Por isso o login é com `chrome.identity.launchWebAuthFlow` (não `getAuthToken`). Escopos: `https://www.googleapis.com/auth/gmail.send` + `openid email` (só para mostrar o e-mail conectado).

**[decisão do Claude]:**
- Build: WXT (framework de extensões baseado em Vite).
- UI do painel: React. Editor rico: TipTap.
- Fila (texto + imagens) em IndexedDB, com permissão `unlimitedStorage` — `chrome.storage.local` não comporta imagens de mangá. Configurações em `chrome.storage.local`. A fila sobrevive a fechar o painel/navegador até ser exportada ou limpa.
- `host_permissions: ["<all_urls>"]` para baixar imagens de qualquer domínio sem bloqueio de CORS.
- Testes: Vitest (unidade e integração com fixtures HTML), epubcheck nos EPUBs gerados, Playwright carregando a extensão para testes ponta a ponta.

**Como evitar o 404 do OAuth (obrigatório):**
- `key` fixa no `manifest.json` para o ID da extensão não mudar entre instalações em modo desenvolvedor.
- No Google Cloud: projeto próprio, Gmail API ativada, tela de consentimento em modo **Teste** com os testadores cadastrados, credencial OAuth do tipo **"Aplicativo da Web"** com o URI de redirecionamento autorizado exatamente igual a `chrome.identity.getRedirectURL()` (`https://<id-da-extensão>.chromiumapp.org/`). Esse URI depende do ID fixo — por isso a `key` é obrigatória.
- URL de autorização: `https://accounts.google.com/o/oauth2/v2/auth` com `client_id`, `redirect_uri`, `response_type=token id_token`, `scope`, `nonce`, e `prompt=select_account` ao conectar (para o usuário escolher a conta). Uma URL malformada ou um redirect não cadastrado é a causa mais provável do 404 da tentativa anterior — o builder deve ter um teste unitário que monta essa URL e confere cada parâmetro.
- **Expiração do token**: sem servidor, o fluxo implícito dá token de ~1 h e nenhum refresh token. Mitigação obrigatória: antes de enviar, se o token expirou, renovar em silêncio com `launchWebAuthFlow({interactive: false})` + `prompt=none` + `login_hint=<email conectado>` (funciona enquanto a sessão Google da conta estiver ativa no navegador). Só se isso falhar, abrir o login interativo. Em 401 da Gmail API: descartar o token, renovar e tentar uma vez. Uma conta conectada por vez; "Desconectar" apaga o token e revoga (`https://oauth2.googleapis.com/revoke`).
- O token fica só na memória/`chrome.storage.session`; o e-mail conectado fica em `chrome.storage.local`.
- Documentar o passo a passo do Google Cloud em `docs/setup-google-oauth.md` (o dono vai precisar refazer isso para publicar).
- **[decisão do Claude]** Mesmo ID em desenvolvimento e na Chrome Web Store: na primeira submissão à loja, incluir a mesma chave (`key.pem`) no zip para que a loja preserve o ID — assim a mesma credencial OAuth serve para testadores instalando pela loja (não listada) ou sem empacotar.
- **[decisão do Claude]** Quem configura o Google Cloud e a conta Amazon é o dono, seguindo o guia. No plano, isso é um checkpoint humano antes dos critérios 1 e 2. Nos testes automatizados a Gmail API é simulada (mock); o envio real é verificado por um checklist manual.

**Envio (Gmail API):**
- MIME `multipart/mixed` montado no cliente, anexo `application/epub+zip` em Base64, nome do arquivo com encoding RFC 2231 (títulos com acentos).
- Usar o endpoint de upload (`/upload/gmail/v1/users/me/messages/send`, `uploadType=media`, `message/rfc822`), que aceita mensagens maiores que o `raw` em JSON.
- Limites relevantes: Gmail ~25 MB por mensagem (contando o inchaço de ~33% do Base64 — o builder deve confirmar o valor efetivo e deixá-lo numa constante); Amazon por e-mail: até 25 anexos e 50 MB.

**EPUB:**
- EPUB 3 com `nav.xhtml` **e** `toc.ncx` (compatibilidade). `mimetype` primeiro e sem compressão. XHTML bem formado (serializar com `XMLSerializer`). Metadados: título, autor, idioma, identificador único, data.
- Imagens: apenas JPEG/PNG/GIF no arquivo final. Redimensionar para no máximo ~1600 px no lado maior e recomprimir JPEG — valores exatos ficam com o builder, alvo é legibilidade em Kindle Paperwhite com arquivo pequeno.

## Critérios de aceitação

1. Com a extensão carregada sem empacotar, "Conectar conta Google" abre o consentimento do Google **sem erro** e volta conectada, mostrando o e-mail da conta.
2. "Enviar para o Kindle" num artigo comum (ex.: um post de blog com imagens): o documento aparece na biblioteca do Kindle do dono, legível, com imagens e sumário funcionando.
3. Todo EPUB gerado (um por item, juntado, com imagens, mangá) passa no epubcheck sem erros.
4. Extração contínua: adicionar 3 páginas de sites diferentes + 1 seleção; "juntar em um" gera um EPUB com 4 capítulos no sumário; "um por item" gera 4 arquivos.
5. Edições feitas no editor rico (texto apagado, imagem removida, título renomeado) aparecem no EPUB exportado.
6. Uma página de mangá em páginas com 30+ imagens gera um EPUB com todas as imagens na ordem, abaixo do limite de envio. Uma tira vertical longa sai cortada em páginas legíveis no Kindle.
10. Conectar uma conta Gmail diferente da conta do perfil do Chrome funciona, e um envio feito mais de 1 h depois de conectar funciona sem pedir login de novo (sessão Google ativa).
7. Erros de envio (sem conta, sem endereço Kindle, arquivo grande demais, token revogado) mostram mensagem clara no idioma do usuário, e nenhum trava o painel.
8. Interface completa em pt-BR, en e es.
9. Inspeção de rede durante extração e exportação: nenhuma requisição além das próprias páginas/imagens de origem e da API do Google.

## Riscos

- **Reautorização frequente.** Como o usuário escolhe a conta (sem `getAuthToken`), o token dura ~1 h. A renovação silenciosa cobre o caso comum; se o usuário saiu da conta Google no navegador, ele vai ver a tela de login de novo. O dono escolheu essa opção sabendo da expiração, em troca de poder escolher a conta.
- **Verificação do Google para publicar.** `gmail.send` é um escopo sensível; fora do modo de teste (100 usuários), publicar exige verificação do app OAuth (a original passou por ela). Não bloqueia a v1, mas bloqueia a publicação aberta.
- **Amazon descarta e-mails de remetentes não aprovados** sem avisar. Mitigação: instrução clara na configuração.
- **Sites que bloqueiam hotlink de imagens** (comum em sites de mangá) por `Referer`. Pode exigir regras `declarativeNetRequest` para mandar o `Referer` da página. O builder decide se entra na v1, conforme os sites de teste.
- **Imagens carregadas sob demanda (lazy-load)** não estão no DOM até rolar a página. Extração precisa ler `data-src`/`srcset` e similares.
- **Readability falha em algumas páginas** (SPAs, layouts estranhos). Fallback: seleção manual de texto ("Salvar seleção") sempre funciona.
