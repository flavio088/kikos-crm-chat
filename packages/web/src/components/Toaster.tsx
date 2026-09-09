import { Toaster as Sonner, type ToasterProps } from "sonner";

export const Toaster = (props: ToasterProps) => (
  <Sonner
    theme="dark"
    position="top-center"
    toastOptions={{
      classNames: {
        toast:
          "!bg-neutral-900 !border-neutral-700 !text-neutral-200 data-[type=success]:!border-emerald-500 data-[type=error]:!border-red-600",
        description: "!text-neutral-400",
      },
      duration: 5000,
    }}
    {...props}
  />
);
