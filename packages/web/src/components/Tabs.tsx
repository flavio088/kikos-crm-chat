import { createContext, useContext, useState } from "react";
import { cn } from "./cn";

type TabsState = { readonly value: string; readonly select: (value: string) => void };

const TabsContext = createContext<TabsState>({ value: "", select: () => undefined });

const Root = ({
  defaultValue,
  className,
  ...props
}: React.ComponentProps<"div"> & { defaultValue: string }) => {
  const [value, select] = useState(defaultValue);
  return (
    <TabsContext.Provider value={{ value, select }}>
      <div className={className} {...props} />
    </TabsContext.Provider>
  );
};

const List = ({ className, ...props }: React.ComponentProps<"div">) => (
  <div
    role="tablist"
    className={cn("relative flex gap-6 border-b border-neutral-700", className)}
    {...props}
  />
);

const Tab = ({
  value,
  className,
  ...props
}: React.ComponentProps<"button"> & { value: string }) => {
  const tabs = useContext(TabsContext);
  const active = tabs.value === value;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      data-active={active || undefined}
      className={cn(
        "relative cursor-pointer pb-3 text-sm text-neutral-400 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 data-active:text-white data-active:after:absolute data-active:after:inset-x-0 data-active:after:-bottom-px data-active:after:h-0.5 data-active:after:bg-red-600",
        className,
      )}
      onClick={() => tabs.select(value)}
      {...props}
    />
  );
};

const Panel = ({
  value,
  className,
  ...props
}: React.ComponentProps<"div"> & { value: string }) => {
  const tabs = useContext(TabsContext);
  if (tabs.value !== value) return null;
  return <div role="tabpanel" className={cn("flex flex-col gap-6", className)} {...props} />;
};

export const Tabs = { Root, List, Tab, Panel };
