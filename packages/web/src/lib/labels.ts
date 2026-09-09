import type { Opportunity } from "@crm-chat/domain";

export const stageColumnLabels: Record<Opportunity.Stage, string> = {
  novo: "Novas",
  em_contato: "Em contato",
  proposta: "Proposta",
  ganho: "Ganhas",
  perdido: "Perdidas",
};

export const stageColumnHints: Record<Opportunity.Stage, string> = {
  novo: "Chegaram e ainda não foram contatadas.",
  em_contato: "Primeiro contato feito, conversa em andamento.",
  proposta: "Receberam uma proposta e aguardam resposta.",
  ganho: "Fecharam negócio.",
  perdido: "Marcadas como perdidas.",
};

export const stageDescriptions: Record<Opportunity.Stage, string> = {
  novo: "Chegou e ainda não foi contatada.",
  em_contato: "O primeiro contato já foi feito.",
  proposta: "Tem uma proposta em aberto.",
  ganho: "Negócio fechado.",
  perdido: "Marcada como perdida.",
};

export const emptyColumnMessages: Record<Opportunity.Stage, string> = {
  novo: "Nenhuma oportunidade nova.",
  em_contato: "Arraste uma oportunidade para cá depois do primeiro contato.",
  proposta: "Arraste para cá o que já recebeu proposta.",
  ganho: "Nada ganho ainda.",
  perdido: "Nada perdido.",
};
