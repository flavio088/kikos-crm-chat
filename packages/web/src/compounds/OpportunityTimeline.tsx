import {
  type CrmOpportunityId,
  Opportunity,
  type OpportunityEvent,
  type OpportunityFile,
  type OpportunityNote,
  type OpportunityTimelineEntry,
} from "@crm-chat/domain";
import type { DateTime } from "effect";
import { Download, FileText, Image, Paperclip, Trash } from "lucide-react";
import { Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button, ErrorBoundary, Input, Skeleton, Typography } from "../components";
import {
  formatDateTime,
  formatFileSize,
  useAddOpportunityNote,
  useDetachOpportunityFile,
  useDownloadOpportunityFile,
  useOpportunityFileContent,
  useOpportunityNoteDraft,
  useUploadOpportunityFile,
} from "../lib";

const ACCEPTED_TYPES = "application/pdf,image/jpeg,image/png,image/webp";

const rowClassName =
  "relative flex flex-col gap-1 border-l border-neutral-800 pb-6 pl-6 last:border-transparent last:pb-0";

const Dot = ({ tone }: { tone: string }) => (
  <span aria-hidden className={`absolute top-1 -left-1 size-2 rounded-full ${tone}`} />
);

const Stamp = ({ at }: { at: DateTime.Utc }) => (
  <Typography color="muted" size="small" className="text-xs text-neutral-500">
    {formatDateTime(at)}
  </Typography>
);

const NoteRow = ({ note, at }: { note: OpportunityNote.OpportunityNote; at: DateTime.Utc }) => (
  <li className={rowClassName}>
    <Dot tone="bg-white" />
    <Typography size="small">Nota</Typography>
    <Typography color="muted" size="small" className="break-words whitespace-pre-wrap">
      {note.body}
    </Typography>
    <Stamp at={at} />
  </li>
);

const describeEvent = (event: OpportunityEvent.OpportunityEvent) => {
  if (event.kind === "created") return { tone: "bg-neutral-500", title: "Oportunidade recebida" };
  if (event.to === "perdido") return { tone: "bg-neutral-600", title: "Marcada como perdida" };
  const from = event.from === undefined ? undefined : Opportunity.stageLabels[event.from];
  const to = event.to === undefined ? undefined : Opportunity.stageLabels[event.to];
  return {
    tone: "bg-violet-400",
    title: from === undefined || to === undefined ? "Etapa alterada" : `Etapa: ${from} → ${to}`,
  };
};

const EventRow = ({
  event,
  at,
}: {
  event: OpportunityEvent.OpportunityEvent;
  at: DateTime.Utc;
}) => {
  const { tone, title } = describeEvent(event);
  return (
    <li className={rowClassName}>
      <Dot tone={tone} />
      <Typography size="small">{title}</Typography>
      <Stamp at={at} />
    </li>
  );
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
    <img src={source} alt={file.filename} className="max-h-64 w-full bg-neutral-950 object-contain" />
  );
};

const iconButtonClassName =
  "rounded-sm p-2 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-100 disabled:opacity-60";

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
    <li className={rowClassName}>
      <Dot tone="bg-sky-300" />
      <Typography size="small">Arquivo anexado</Typography>
      <figure className="max-w-sm overflow-hidden rounded-sm border border-neutral-800 bg-neutral-900">
        {isImage ? (
          <ErrorBoundary
            fallback={
              <div className="flex h-48 items-center justify-center text-sm text-neutral-500">
                Pré-visualização indisponível
              </div>
            }
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
            className={iconButtonClassName}
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
            className={`${iconButtonClassName} hover:text-red-500`}
            disabled={detaching}
            onClick={() => {
              if (!window.confirm(`Remover "${file.filename}" desta oportunidade?`)) return;
              detach({ id: opportunityId, fileId: file.id });
            }}
          >
            <Trash className="size-4" />
          </button>
        </figcaption>
      </figure>
      <Stamp at={at} />
    </li>
  );
};

const Row = ({
  entry,
  opportunityId,
}: {
  entry: OpportunityTimelineEntry;
  opportunityId: CrmOpportunityId.Id;
}) => {
  switch (entry.kind) {
    case "note":
      return <NoteRow note={entry.note} at={entry.at} />;
    case "event":
      return <EventRow event={entry.event} at={entry.at} />;
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
  const { upload, pending: uploading } = useUploadOpportunityFile();
  const fileInput = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const submittable = draft.trim().length > 0 && !pending;

  const carriesFiles = (event: React.DragEvent) => event.dataTransfer.types.includes("Files");

  return (
    <form
      className="relative flex w-full items-center gap-2 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (submittable) add(opportunityId);
      }}
      onDragEnter={(event) => {
        if (!carriesFiles(event)) return;
        event.preventDefault();
        dragDepth.current += 1;
        setDragging(true);
      }}
      onDragOver={(event) => {
        if (!carriesFiles(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(event) => {
        if (dragDepth.current === 0) return;
        event.preventDefault();
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
      }}
      onDrop={(event) => {
        if (!carriesFiles(event)) return;
        event.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        const file = event.dataTransfer.files[0];
        if (file !== undefined && !uploading) upload({ id: opportunityId, file });
      }}
    >
      {dragging ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center gap-2 rounded-sm border-2 border-dashed border-red-600 bg-neutral-950/95 text-sm text-neutral-100">
          <Paperclip className="size-4" />
          Solte para anexar à oportunidade
        </div>
      ) : null}
      <input
        ref={fileInput}
        type="file"
        className="hidden"
        accept={ACCEPTED_TYPES}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file !== undefined) upload({ id: opportunityId, file });
          event.currentTarget.value = "";
        }}
      />
      <Button
        color="surface"
        className="h-10 w-auto shrink-0 border border-neutral-700 px-3"
        title="Anexar PDF ou imagem"
        aria-label="Anexar PDF ou imagem"
        disabled={uploading}
        onClick={() => fileInput.current?.click()}
      >
        <Paperclip className="size-4" />
      </Button>
      <Input
        className="h-10"
        aria-label="Nova nota"
        placeholder="Escreva uma nota sobre esta oportunidade…"
        value={draft}
        disabled={pending}
        onChange={(event) => setDraft(event.target.value)}
      />
      <Button type="submit" className="h-10 w-auto shrink-0" disabled={!submittable}>
        {pending ? "Salvando…" : "Adicionar"}
      </Button>
    </form>
  );
};

const Entries = ({
  opportunityId,
  timeline,
}: {
  opportunityId: CrmOpportunityId.Id;
  timeline: ReadonlyArray<OpportunityTimelineEntry>;
}) => {
  const container = useRef<HTMLDivElement>(null);
  const newest = timeline[timeline.length - 1];
  const newestKey = newest === undefined ? undefined : entryKey(newest);

  useLayoutEffect(() => {
    const node = container.current;
    if (node !== null) node.scrollTop = node.scrollHeight;
  }, [newestKey]);

  return (
    <div
      ref={container}
      className="max-h-[36rem] min-h-0 flex-1 overflow-y-auto px-6 py-4 lg:max-h-none"
    >
      {timeline.length === 0 ? (
        <Typography color="muted" size="small">
          Nada aconteceu com esta oportunidade ainda.
        </Typography>
      ) : (
        <ul className="flex flex-col">
          {timeline.map((entry) => (
            <Row key={entryKey(entry)} entry={entry} opportunityId={opportunityId} />
          ))}
        </ul>
      )}
    </div>
  );
};

export type OpportunityTimelineProps = {
  opportunityId: CrmOpportunityId.Id;
  timeline: ReadonlyArray<OpportunityTimelineEntry>;
};

export const OpportunityTimeline = ({ opportunityId, timeline }: OpportunityTimelineProps) => (
  <div className="flex min-h-0 flex-1 flex-col">
    <Entries opportunityId={opportunityId} timeline={timeline} />
    <footer className="shrink-0 border-t border-neutral-700">
      <NoteComposer opportunityId={opportunityId} />
    </footer>
  </div>
);
