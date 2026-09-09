# Kikos CRM · Chat de WhatsApp

Projeto autocontido, de escopo fechado: um kanban de oportunidades, a tela de
detalhe da oportunidade e, dentro dela, o histórico com anexos e a conversa de
WhatsApp com o contato.

- **Kanban** por etapa (novo, em contato, proposta, ganho, perdido), arrastando o
  card para mudar de etapa.
- **Detalhe** com os dados do contato, a etapa atual e duas abas: chat e histórico.
- **Histórico** da oportunidade: entrada, mudanças de etapa, notas e anexos (PDF, JPG, PNG ou WebP até 10 MB,
  no máximo 20 por oportunidade), anexados pelo clipe ou arrastando, com preview
  de imagem, download e remoção. O servidor confere o tipo pelos magic bytes e só
  serve um arquivo para a oportunidade dona dele.
- **WhatsApp** pela Cloud API da Meta: envio de texto, recebimento pelo webhook
  (assinatura HMAC), janela de 24 horas e envio de template aprovado quando a
  janela fecha. O template não reabre a janela; a resposta do cliente reabre.
  Sem token configurado, um stub responde no lugar da Meta, com dois templates
  de exemplo.

## Rodando

Requisitos: Node 22+ e pnpm 10+. Nada mais: o banco é o Postgres embutido
(pglite) em `packages/server/pgdata`.

```bash
pnpm install
pnpm dev
```

- API: http://localhost:3000
- Interface: http://localhost:5173

Na primeira subida o servidor cria as tabelas e semeia um vendedor, cinco
contatos com uma oportunidade cada, uma nota no histórico de Ana Souza e duas
conversas: uma com a janela de 24h aberta (Ana Souza) e outra com a janela
fechada (Bruno Lima), para mostrar os dois estados do chat.

```bash
pnpm test
```

Roda os testes do serviço de oportunidade (anexos) contra um pglite em memória.

### Simulando uma mensagem recebida

Sem a Meta chamando o servidor, dá para injetar uma mensagem como se viesse do
webhook (assinada com o `WHATSAPP_APP_SECRET` em uso):

```bash
pnpm simulate:inbound 5511999990001 "Oi, ainda tem vaga?"
```

O número precisa pertencer a um contato; número desconhecido é aceito com 200 e
ignorado, sem criar contato.

É também o jeito de reabrir a janela de 24 horas depois de um template: a Meta
só reabre quando o cliente responde, então simule a resposta do Bruno Lima
(`5521999990002`) e o campo de texto volta. Na tela, o botão "Simular resposta
do cliente" no rodapé da conversa faz o mesmo pela rota
`POST /crm/contacts/:id/conversation/simulate`, sem passar pelo HMAC.

### Variáveis de ambiente

Copie `.env.example` para `.env` na raiz. Todas são opcionais.

| Variável | Efeito |
| --- | --- |
| `WHATSAPP_TOKEN` | Presente: usa a Cloud API. Ausente: stub, nada sai para a Meta. |
| `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID` | Exigidas junto com o token. |
| `WHATSAPP_APP_SECRET` | Segredo do HMAC do webhook. Padrão local: `dev-app-secret`. |
| `WHATSAPP_VERIFY_TOKEN` | Token do handshake `GET /webhooks/whatsapp`. Padrão local: `dev-verify-token`. |
| `DATABASE_URL` | Postgres externo no lugar do pglite. |
| `PORT` | Porta da API. Padrão 3000. |

Para a Meta chegar no webhook local, exponha a porta 3000 (ngrok ou similar) e
cadastre `https://<host>/webhooks/whatsapp` com o mesmo `WHATSAPP_VERIFY_TOKEN`.

## Estrutura

```
packages/
  whatsapp/   cliente da Cloud API: porta (Gateway), implementação real (Live) e stub
  domain/     modelos, ids, políticas e o contrato HTTP compartilhado por server e web
  server/     banco (drizzle + pglite/postgres), repositórios, serviços, handlers, webhook
  web/        Vite + React: kanban, detalhe, histórico e o chat
```

Rotas da API:

| Rota | O que faz |
| --- | --- |
| `GET /crm/opportunities/board` | Todas as oportunidades com o contato |
| `GET /crm/opportunities/:id` | Detalhe |
| `POST /crm/opportunities/:id/stage` | Muda a etapa |
| `POST /crm/opportunities/:id/notes` | Adiciona uma nota ao histórico |
| `POST /crm/opportunities/:id/files` | Anexa um arquivo (multipart, campo `file`) |
| `GET /crm/opportunities/:id/files/:fileId/content` | Bytes do anexo, só se ele pertencer à oportunidade |
| `DELETE /crm/opportunities/:id/files/:fileId` | Remove o anexo |
| `GET /crm/contacts/:id/conversation` | Conversa do contato |
| `POST /crm/contacts/:id/conversation/messages` | Envia texto (só com a janela de 24h aberta) |
| `POST /crm/contacts/:id/conversation/templates` | Envia um template aprovado (a qualquer hora) |
| `POST /crm/contacts/:id/conversation/simulate` | Simula uma resposta do cliente, como se viesse do webhook |
| `GET /crm/conversation/templates` | Templates aprovados |
| `GET /webhooks/whatsapp` | Handshake de verificação da Meta |
| `POST /webhooks/whatsapp` | Recebe mensagens (HMAC no corpo cru) |

## Decisões

- **O gateway é uma porta.** `WhatsAppGateway` tem duas implementações atrás da
  mesma interface; o servidor escolhe pela presença de `WHATSAPP_TOKEN`.
- **A conversa pertence ao contato**, não à oportunidade: quem volta depois é
  uma conversa só.
- **Número desconhecido não vira contato.**
- **Bytes em tabela separada** dos metadados, tanto na mídia da conversa quanto
  nos anexos da oportunidade: listar o histórico nunca carrega os arquivos.
- **Anexo alheio responde "não encontrado"**, nunca "proibido": os ids são ULID
  com timestamp, então ids vizinhos são adivinháveis.
- **Sem login.** Um vendedor fixo é semeado e usado como autor de tudo que sai.

## O que não está pronto

- Parâmetros de template: o envio vai sem variáveis no corpo, porque a listagem
  da Meta não diz quais são.
- Mandar mídia pela tela: o backend recebe mídia pelo webhook, a interface não envia.
- Status de entregue/lida: o webhook parseia, mas nada atualiza a mensagem.
- Reenvio de webhook pela Meta: o mesmo `wamid` entra duas vezes.
- Testes: só o serviço de oportunidade (anexos) tem; WhatsApp não.
- A Cloud API nunca foi exercitada de verdade; só o stub e o webhook assinado à mão.
