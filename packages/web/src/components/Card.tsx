import { cn } from "./cn";

export const Root = ({ className, ...props }: React.ComponentProps<"div">) => (
  <div
    className={cn("flex flex-col gap-4 rounded-sm border border-neutral-700 py-4", className)}
    {...props}
  />
);

export const Header = ({ className, ...props }: React.ComponentProps<"div">) => (
  <div className={cn("flex flex-col gap-1 px-4", className)} {...props} />
);

export const Title = ({ className, ...props }: React.ComponentProps<"h3">) => (
  <h3 className={cn("font-medium text-white", className)} {...props} />
);

export const Content = ({ className, ...props }: React.ComponentProps<"div">) => (
  <div className={cn("px-4", className)} {...props} />
);
