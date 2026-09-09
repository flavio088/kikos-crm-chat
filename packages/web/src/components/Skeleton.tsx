import { cn } from "./cn";

export const Skeleton = ({ className, ...props }: React.ComponentProps<"div">) => (
  <div className={cn("animate-pulse rounded-sm bg-neutral-800", className)} {...props} />
);
