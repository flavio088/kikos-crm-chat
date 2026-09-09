import { ChevronsUpDownIcon, UsersIcon } from "lucide-react";
import { Separator, Typography } from "../components";

const itemClass =
  "flex h-8 w-full items-center gap-2 overflow-hidden rounded-sm p-2 text-left text-sm text-neutral-200 hover:bg-neutral-800 hover:text-white data-active:bg-neutral-800 data-active:font-medium data-active:text-white [&_svg]:size-4 [&_svg]:shrink-0 [&>span:last-child]:truncate";

const Operator = () => (
  <div className="flex items-center gap-2 rounded-sm p-2 hover:bg-neutral-800">
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-red-600 text-xs font-semibold text-white">
      VE
    </span>
    <div className="min-w-0">
      <Typography size="small" weight="medium" className="truncate">
        Vendedor
      </Typography>
      <Typography color="muted" size="small" className="truncate text-xs">
        Vendedor Kikos
      </Typography>
    </div>
    <ChevronsUpDownIcon className="ml-auto size-4 shrink-0 text-neutral-400" />
  </div>
);

export const Sidebar = ({ onOpenOpportunities }: { onOpenOpportunities: () => void }) => (
  <aside className="sticky top-0 flex h-svh flex-col gap-6 overflow-y-auto border-r border-neutral-700 p-4">
    <div className="px-2 pt-1">
      <img src="/assets/kikos/logo-crm.png" alt="Kikos CRM" className="h-9 w-auto" />
    </div>
    <Separator className="-mx-4 w-auto" />
    <nav>
      <ul className="flex flex-col gap-1">
        <li>
          <button type="button" className={itemClass} data-active onClick={onOpenOpportunities}>
            <UsersIcon />
            <span>Oportunidades</span>
          </button>
        </li>
      </ul>
    </nav>
    <Separator className="-mx-4 mt-auto w-auto" />
    <Operator />
  </aside>
);
