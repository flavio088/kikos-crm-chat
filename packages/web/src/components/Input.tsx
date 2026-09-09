import { cn } from "./cn";

export const Input = ({ className, ...props }: React.ComponentProps<"input">) => (
  <input
    className={cn(
      "w-full min-w-0 rounded-sm bg-transparent px-2 py-2 text-white outline-1 outline-neutral-700 selection:bg-red-600 focus:outline-red-600",
      className,
    )}
    {...props}
  />
);
