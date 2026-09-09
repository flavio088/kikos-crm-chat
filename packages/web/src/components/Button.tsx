import { cn } from "./cn";

const colors = {
  primary: "bg-red-600 hover:bg-red-700 active:bg-red-800",
  success: "bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800",
  surface:
    "relative group after:absolute hover:text-red-500 after:inset-0 overflow-clip after:translate-y-[95%] hover:after:bg-red-600 after:-z-10 active:after:translate-y-0 active:text-white",
} as const;

export type ButtonProps = React.ComponentProps<"button"> & {
  color?: keyof typeof colors;
};

export const Button = ({ className, color = "primary", type = "button", ...props }: ButtonProps) => (
  <button
    type={type}
    className={cn(
      "flex w-full flex-row items-center justify-center rounded-sm px-4 py-2 disabled:pointer-events-none disabled:opacity-60",
      colors[color],
      className,
    )}
    {...props}
  />
);
