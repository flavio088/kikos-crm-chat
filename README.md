# Anexos na oportunidade e conversa de WhatsApp

Duas funcionalidades construídas sobre a estrutura do CRM da Kikos.
---

## O que faz

**Anexos** — o histórico da oportunidade passou a aceitar PDF e imagem:
anexar pelo clipe ou arrastando, preview inline, download, remoção, teto de
20 por oportunidade. Validação de tipo, tamanho e magic bytes no servidor.

**WhatsApp** — o vendedor conversa com o cliente sem sair do CRM, numa aba ao
lado do histórico. Mensagem que chega pelo webhook encontra o contato pelo
telefone e entra na thread dele. A janela de 24 horas da Meta é respeitada,
com os templates aprovados listados quando ela fecha.

---

## Estrutura

packages/integrations/whatsapp/ cliente da Cloud API, isolado
packages/products/crm/ domínio, contratos, serviços, api, ui
migrations/ as duas migrations
diffs/ o que mudou em código que já existia


Os `diffs/` são as alterações em arquivos existentes — a tabela nova no
schema, o verbo novo na política, o terceiro tipo no timeline. Vão como diff
porque um arquivo de mil linhas com trinta novas esconde o que deveria
mostrar.

---

## Decisões

**O gateway é uma porta, não um cliente.** Duas implementações atrás da mesma
interface: uma chama a Meta, outra responde nas mesmas formas sem entregar
nada. O servidor escolhe pela presença de `WHATSAPP_TOKEN`, do mesmo jeito
que escolhe entre Postgres e pglite.

**A conversa pertence ao contato, não à oportunidade.** Quem comprou ano
passado e volta é uma conversa só.

**Número desconhecido não vira contato.** O CRM resolve identidade com chaves
normalizadas e índices únicos parciais — um desenho inteiro para não escrever
a mesma pessoa duas vezes.

**Bytes em tabela separada dos metadados.** Listar o histórico nunca deve
carregar os anexos.

**O timeline continuou timeline.** O chat de referência desenha balões, mas o
histórico tem eventos do sistema no meio, que não são mensagem de ninguém.

---

## Segurança

**IDOR no download** — duas perguntas: se o ator pode ler a oportunidade, e
se o arquivo pertence a ela. A verificação vive no serviço, então outro
endpoint que sirva o mesmo arquivo a herda.

**Recusa sem confirmar existência** — arquivo alheio responde "não
encontrado", nunca "proibido". Os ULID embutem timestamp, então ids próximos
no tempo são adivinháveis.

**Upload em três camadas** — teto de 10 MB cortado durante o stream, lista
fechada de tipos, e leitura dos magic bytes.

**O webhook não tem bearer token** — no lugar, um HMAC do corpo comparado em
tempo constante, calculado sobre os bytes crus.

---

## O que não está pronto

- Enviar o template escolhido: a lista aparece, o envio precisa de endpoint
- Mandar mídia pela tela: o backend recebe, a interface não envia
- Testes do WhatsApp: só os anexos têm

**A conexão com a Meta nunca foi exercitada.** O ciclo interno foi testado
com `curl`, incluindo o webhook com assinatura válida montada à mão — mas a
Meta nunca chamou o servidor.
