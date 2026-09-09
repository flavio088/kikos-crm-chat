import type { OpportunityTimelineEntry } from "@kikos/crm-contracts";
import { Quotation, Opportunity, OpportunityFile, type Event, type Note } from "@kikos/crm-core";
import type { CrmOpportunityId } from "@kikos/effect-identity";
import { Button, ErrorBoundary, ErrorFallback, InputGroup, Skeleton, Typography } from "@kikos/ui-backoffice";
import type { DateTime } from "effect";
import { Download, FileText, Image, Paperclip, Trash2 } from "lucide-react";
import { Suspense, useEffect,useRef, useState } from "react";
import {
  quotationStatusLabel,
  formatDateTime,
  formatMoney,
  payloadNumber,
  payloadText,
  reclaimReason,
  sortTimeline,
  sourceLabels,
  stageLabels,
  useAddOpportunityNote,
  useDetachOpportunityFile,
  useDownloadOpportunityFile,
  useUploadOpportunityFile,
  useOpportunityFileContent,
  useOpportunityNoteDraft,
} from "../../lib"; 

type Rendered = {
  readonly dot: string;
  readonly title: string;
  readonly detail: string | undefined;
};

const renderEvent = (event: Event.Event): Rendered => {
  switch (event.kind) {
    case "created": {
      const source = payloadText(event.payload, "source");
      return {
        dot: "bg-neutral-500",
        title: "Oportunidade recebida",
        detail:
          source === undefined
            ? undefined
            : `Origem: ${Opportunity.Source.isSource(source) ? sourceLabels[source] : source}`,
      };
    }
    case "placed":
      return {
        dot: "bg-sky-400",
        title: "Encaminhado para um destino",
        detail: payloadText(event.payload, "destination"),
      };
    case "reclaimed": {
      const reason = payloadText(event.payload, "reason");
      return {
        dot: "bg-orange-400",
        title: "Retomado do destino",
        detail: reason === undefined ? undefined : reclaimReason(reason),
      };
    }
    case "noted":
      return { dot: "bg-neutral-500", title: "Nota registrada", detail: undefined };
    case "reconverted": {
      const source = payloadText(event.payload, "source");
      return {
        dot: "bg-amber-400",
        title: "Contato voltou a se inscrever",
        detail:
          source === undefined
            ? undefined
            : `Origem: ${Opportunity.Source.isSource(source) ? sourceLabels[source] : source}`,
      };
    }
    case "quotation_opened": {
      const ref = payloadNumber(event.payload, "ref");
      const value = payloadText(event.payload, "value");
      const opened = ref === undefined ? "Orçamento" : `Orçamento ${Quotation.formatRef(ref)}`;
      return {
        dot: "bg-emerald-400",
        title: "Orçamento aberto",
        detail: value === undefined ? opened : `${opened} · ${formatMoney(value)}`,
      };
    }
    case "quotation_moved": {
      const from = payloadText(event.payload, "from");
      const to = payloadText(event.payload, "to");
      return {
        dot: "bg-violet-400",
        title: "Orçamento movido",
        detail:
          from === undefined || to === undefined
            ? undefined
            : `De ${quotationStatusLabel(from)} para ${quotationStatusLabel(to)}`,
      };
    }
    case "quotation_closed": {
      const won = payloadText(event.payload, "to") === "won";
      const ref = payloadNumber(event.payload, "ref");
      return {
        dot: won ? "bg-emerald-400" : "bg-neutral-600",
        title: won ? "Orçamento ganho" : "Orçamento perdido",
        detail: ref === undefined ? undefined : `Orçamento ${Quotation.formatRef(ref)}`,
      };
    }
    case "staged": {
      const from = payloadText(event.payload, "from");
      const to = payloadText(event.payload, "to");
      if (to === "lost") return { dot: "bg-neutral-600", title: "Marcada como perdida", detail: undefined };
      return {
        dot: "bg-violet-400",
        title:
          Opportunity.Stage.isStage(from) && Opportunity.Stage.isStage(to)
            ? `Etapa: ${stageLabels[from]} → ${stageLabels[to]}`
            : "Etapa alterada",
        detail: undefined,
      };
    }
  }
};

const renderNote = (note: Note.OnOpportunity): Rendered => ({
  dot: "bg-white",
  title: "Nota",
  detail: note.body,
});

const formatFileSize = (sizeBytes: number) => {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
};

const ImagePreview = ({
  opportunityId,
  file,
}: {
  opportunityId: CrmOpportunityId.Id;
  file: OpportunityFile.OpportunityFile;
}) => {
  const { result } = useOpportunityFileContent(opportunityId, file.id);
  const [source, setSource] = useState<string>();

  useEffect(() => {
    const url = URL.createObjectURL(new Blob([result.value as BlobPart], { type: file.mediaType }));
    setSource(url);
    return () => URL.revokeObjectURL(url);
  }, [file.mediaType, result.value]);

  if (source === undefined) return <Skeleton className="h-48 w-full" />;
  return (
    <img
      src={source}
      alt={file.filename}
      className="max-h-64 w-full bg-neutral-950 object-contain"
    />
  );
};

const FileRow = ({
  opportunityId,
  file,
  at,
}: {
  opportunityId: CrmOpportunityId.Id;
  file: OpportunityFile.OpportunityFile;
  at: DateTime.Utc;
}) => {
  const { download, pending } = useDownloadOpportunityFile();
  const { detach, pending: detaching } = useDetachOpportunityFile();
  const isImage = file.mediaType !== "application/pdf";

  return (
    <li className="relative flex flex-col gap-1 border-l border-neutral-800 pb-6 pl-6 last:border-transparent last:pb-0">
      <span aria-hidden className="absolute top-1 -left-1 size-2 rounded-full bg-sky-300" />
      <Typography size="small">Arquivo anexado</Typography>
      <figure className="max-w-sm overflow-hidden rounded-sm border border-neutral-800 bg-neutral-900">
         {isImage ? (
          <ErrorBoundary
            fallback={<ErrorFallback className="h-48">Pré-visualização indisponível</ErrorFallback>}
          >
            <Suspense fallback={<Skeleton className="h-48 w-full" />}>
              <ImagePreview opportunityId={opportunityId} file={file} />
            </Suspense>
          </ErrorBoundary>
        ) : null}
        <figcaption className="flex items-center gap-3 px-3 py-2">
          {isImage ? (
            <Image className="size-4 shrink-0 text-neutral-500" />
          ) : (
            <FileText className="size-4 shrink-0 text-neutral-500" />
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm text-neutral-200">{file.filename}</span>
            <span className="block text-xs text-neutral-500">{formatFileSize(file.sizeBytes)}</span>
          </span>
          <button
            type="button"
            title="Baixar arquivo"
            aria-label={`Baixar ${file.filename}`}
            className="rounded-sm p-2 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-100 disabled:opacity-60"
            disabled={pending}
            onClick={() =>
              download({
                opportunityId,
                fileId: file.id,
                filename: file.filename,
                mediaType: file.mediaType,
              })
            }
          >
            <Download className="size-4" />
          </button>
          <button
            type="button"
            title="Remover arquivo"
            aria-label={`Remover ${file.filename}`}
            className="rounded-sm p-2 text-neutral-500 hover:bg-neutral-800 hover:text-red-500 disabled:opacity-60"
            disabled={detaching}
            onClick={() => {
              if (!window.confirm(`Remover "${file.filename}" desta oportunidade?`)) return;
              detach({ id: opportunityId, fileId: file.id });
            }}
          >
            <Trash2 className="size-4" />
          </button>
        </figcaption>
      </figure>
      <Typography color="muted" size="small" className="text-xs text-neutral-500">
        {formatDateTime(at)}
      </Typography>
    </li>
  );
};

const TimelineRow = ({ dot, title, detail, at }: Rendered & { at: DateTime.Utc }) => (
  <li className="relative flex flex-col gap-0.5 border-l border-neutral-800 pb-6 pl-6 last:border-transparent last:pb-0">
    <span aria-hidden className={`absolute top-1 -left-1 size-2 rounded-full ${dot}`} />
    <Typography size="small">{title}</Typography>
    {detail === undefined ? null : (
      <Typography color="muted" size="small" className="break-words">
        {detail}
      </Typography>
    )}
    <Typography color="muted" size="small" className="text-xs text-neutral-500">
      {formatDateTime(at)}
    </Typography>
  </li>
);

const Row = ({
  entry,
  opportunityId,
}: {
  entry: OpportunityTimelineEntry;
  opportunityId: CrmOpportunityId.Id;
}) => {
  switch (entry.kind) {
    case "note":
      return <TimelineRow {...renderNote(entry.note)} at={entry.at} />;
    case "event":
      return <TimelineRow {...renderEvent(entry.event)} at={entry.at} />;
    case "file":
      return <FileRow opportunityId={opportunityId} file={entry.file} at={entry.at} />;
  }
};

const entryKey = (entry: OpportunityTimelineEntry) => {
  switch (entry.kind) {
    case "note":
      return `note:${entry.note.id}`;
    case "event":
      return `event:${entry.event.id}`;
    case "file":
      return `file:${entry.file.id}`;
  }
};

const NoteComposer = ({ opportunityId }: { opportunityId: CrmOpportunityId.Id }) => {
  const [draft, setDraft] = useOpportunityNoteDraft(opportunityId);
  const { add, pending } = useAddOpportunityNote();
  const { upload, pending: uploadPending } = useUploadOpportunityFile();
  const fileInput = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [draggingFile, setDraggingFile] = useState(false);
  const empty = draft.trim() === "";

  return (
    <form
      className="relative pt-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (empty || pending) return;
        add(opportunityId);
      }}
      onDragEnter={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        dragDepth.current += 1;
        setDraggingFile(true);
      }}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(event) => {
        if (dragDepth.current === 0) return;
        event.preventDefault();
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDraggingFile(false);
      }}
      onDrop={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        dragDepth.current = 0;
        setDraggingFile(false);
        const file = event.dataTransfer.files[0];
        if (file !== undefined && !uploadPending) upload({ id: opportunityId, file });
      }}
    >
      {draggingFile && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center gap-2 rounded-sm border-2 border-dashed border-red-600 bg-neutral-950/95 text-sm text-neutral-100">
          <Paperclip className="size-4" />
          Solte para anexar à oportunidade
        </div>
      )}
      <input
        ref={fileInput}
        type="file"
        className="hidden"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file !== undefined) upload({ id: opportunityId, file });
          event.currentTarget.value = "";
        }}
      />
      <div className="flex items-end gap-2">
        <Button
          type="button"
          color="surface"
          className="w-auto shrink-0 border border-neutral-800 px-3"
          title="Anexar PDF ou imagem"
          disabled={uploadPending}
          onClick={() => fileInput.current?.click()}
        >
          <Paperclip className="size-4" />
        </Button>
        <InputGroup.Root className="flex-1">
          <InputGroup.Input
            aria-label="Nova nota"
            placeholder="Escreva uma nota sobre esta oportunidade…"
            className="pr-28"
            value={draft}
            disabled={pending}
            onChange={(event) => setDraft(event.target.value)}
          />
          <InputGroup.Addon className="pr-1">
            <Button type="submit" className="w-auto px-3 py-1 text-sm" disabled={empty || pending}>
              Adicionar
            </Button>
          </InputGroup.Addon>
        </InputGroup.Root>
      </div>
    </form>
  );
};

export type OpportunityTimelineProps = {
  opportunityId: CrmOpportunityId.Id;
  timeline: ReadonlyArray<OpportunityTimelineEntry>;
};

export const OpportunityTimeline = ({ opportunityId, timeline }: OpportunityTimelineProps) => {
  const entries = sortTimeline(timeline);

  return (
    <div className="flex flex-col gap-4">
      <Typography weight="bold">Histórico</Typography>
      {entries.length === 0 ? (
        <Typography color="muted" size="small">
          Nada aconteceu com esta oportunidade ainda.
        </Typography>
      ) : (
        <ul className="flex flex-col">
          {entries.map((entry) => (
            <Row key={entryKey(entry)} entry={entry} opportunityId={opportunityId} />
          ))}
        </ul>
      )}
      <NoteComposer opportunityId={opportunityId} />
    </div>
  );
};
