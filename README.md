# Anexos na oportunidade e conversa de WhatsApp

Duas funcionalidades construídas sobre a estrutura do CRM da Kikos.

**Este repositório é para leitura de código, não para execução.** Os módulos
dependem de pacotes internos do monorepo — domínio, persistência, design
system — que não estão aqui.

---

## O que existe

### Anexos no histórico da oportunidade

A tela tinha uma linha do tempo de eventos e um campo de nota só de texto.
Passou a aceitar PDF e imagem: anexar pelo clipe ou arrastando, preview
inline, download, remoção, teto de 20 por oportunidade, e validação de tipo
e tamanho no servidor.

### Conversa de WhatsApp

O vendedor conversa com o cliente sem sair do CRM, numa aba ao lado do
histórico. Mensagem que chega pelo webhook encontra o contato pelo telefone
e entra na thread dele; a resposta sai pela tela. A janela de 24 horas que a
Meta impõe é respeitada, com os templates aprovados listados quando ela
fecha.

---

## Estrutura

packages/integrations/whatsapp/ cliente da Cloud API, isolado
Model/ os tipos que a Meta fala
Gateway.ts a porta, com quatro operações
Live.ts a implementação real
Stub.ts a de bancada

packages/products/crm/
core/src/Conversation/ entidades da conversa
core/src/OpportunityFile/ entidade do anexo
contracts/src/Api/Conversation/ endpoints e webhook
services/services/src/
Persistance/Conversation*/ repositórios da conversa
Persistance/OpportunityFile*/ repositórios do anexo
Services/Conversation/ a lógica
services/api/src/Api/Conversation/ handlers
ui/backoffice/src/ atoms, hooks e componentes

migrations/ as duas migrations
diffs/ o que mudou em arquivos que já existiam

Os arquivos sob `diffs/` são as alterações em código que já existia — a
tabela nova no schema, o verbo novo na política de acesso, o terceiro tipo
de entrada no timeline. Estão como diff e não como arquivo inteiro porque é
o que mudou que interessa, e porque um arquivo de mil linhas com trinta
delas novas esconde exatamente o que deveria mostrar.


---

## Decisões

**A integração é um pacote isolado.** Depende apenas de `primitives` e
`effect` — não conhece CRM nem banco. Segue o padrão que `pagbank` já usa no
monorepo.

**O gateway é uma porta, não um cliente.** Duas implementações atrás da mesma
interface: uma chama a Meta, outra responde nas mesmas formas sem entregar
nada. O servidor escolhe pela presença de `WHATSAPP_TOKEN`, do mesmo jeito
que escolhe entre Postgres e pglite.

**A conversa pertence ao contato, não à oportunidade.** Quem comprou ano
passado e volta é uma conversa só.

**Número desconhecido não vira contato.** O CRM resolve identidade com chaves
normalizadas e índices únicos parciais — um desenho inteiro para não escrever
a mesma pessoa duas vezes. Uma linha por engano e por robô seria o oposto.

**Anexo não gera evento.** A lista de eventos é mantida curta de propósito, e
duplicar no log um estado que já vive em tabela própria é antipadrão no
projeto.

**Bytes em tabela separada dos metadados.** Listar o histórico nunca deve
carregar os anexos.

**O timeline continuou timeline.** O chat de referência desenha balões, mas o
histórico da oportunidade tem eventos do sistema no meio, que não são
mensagem de ninguém.

---

## Segurança

**IDOR no download.** Duas perguntas, não uma: se o ator pode ler a
oportunidade, e se o arquivo pertence a ela. A verificação vive no serviço,
então um segundo endpoint que sirva o mesmo arquivo a herda.

**Recusa sem confirmar existência.** Arquivo alheio responde "não
encontrado", nunca "proibido" — e os ULID embutem timestamp, então ids
próximos no tempo são adivinháveis.

**Três camadas no upload.** Teto de 10 MB cortado durante o stream, lista
fechada de tipos, e leitura dos magic bytes — um `.exe` renomeado para
`foto.png` é recusado.

**O webhook não tem bearer token.** No lugar dele, um HMAC do corpo com o app
secret, comparado em tempo constante e calculado sobre os bytes crus — o
payload re-serializado nunca bateria.

---

## O que não está pronto

- Enviar o template escolhido: a lista aparece, o envio precisa de endpoint
- Mandar mídia pela tela: o backend recebe, a interface não envia
- Caixa de não identificados na tela
- Testes do WhatsApp: só os anexos têm

**A conexão com a Meta nunca foi exercitada.** O ciclo interno foi testado
com `curl`, incluindo o webhook com assinatura válida montada à mão. Mas a
Meta nunca chamou o servidor, e nenhuma mensagem chegou a um celular.