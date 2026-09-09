import { cn } from "./cn";

const colors = {
  default: "text-white",
  muted: "text-neutral-400",
  danger: "text-red-500",
} as const;

const sizes = {
  small: "text-sm",
  default: "text-base",
  large: "text-2xl",
} as const;

const weights = {
  regular: "font-normal",
  medium: "font-medium",
  bold: "font-bold",
} as const;

export type TypographyProps = React.ComponentProps<"p"> & {
  as?: "p" | "h1" | "h2" | "h3" | "span";
  color?: keyof typeof colors;
  size?: keyof typeof sizes;
  weight?: keyof typeof weights;
};

export const Typography = ({
  as = "p",
  className,
  color = "default",
  size = "default",
  weight = "regular",
  ...props
}: TypographyProps) => {
  const Tag: React.ElementType = as;
  return (
    <Tag className={cn(colors[color], sizes[size], weights[weight], className)} {...props} />
  );
};
