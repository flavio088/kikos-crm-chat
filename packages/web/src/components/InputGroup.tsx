import { cn } from "./cn";

export const Root = ({ className, ...props }: React.ComponentProps<"div">) => (
  <div
    className={cn(
      "relative w-full rounded-sm outline-1 outline-neutral-700 focus-within:outline-red-600 selection:bg-red-600",
      className,
    )}
    {...props}
  />
);

export const Input = ({ className, ...props }: React.ComponentProps<"input">) => (
  <input className={cn("w-full bg-transparent p-2 text-white focus:outline-0", className)} {...props} />
);
