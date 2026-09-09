import { cn } from "./cn";

export const Separator = ({ className, ...props }: React.ComponentProps<"hr">) => (
  <hr
    data-orientation="horizontal"
    className={cn("h-px w-full shrink-0 border-0 bg-neutral-700", className)}
    {...props}
  />
);
