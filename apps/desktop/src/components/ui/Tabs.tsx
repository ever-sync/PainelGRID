import type { ReactNode } from "react";
import { Tab, TabList, Tabs as TabsPrimitive } from "react-aria-components";

interface TabItem {
  id: string;
  label: string;
  icon?: ReactNode;
}

interface TabsProps {
  tabs: TabItem[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
}

/**
 * So a barra de abas (TabList+Tab) do react-aria-components — sem TabPanel,
 * ja que as paginas que usam isso trocam o conteudo por fora, no estado
 * local delas, nao como filhos deste componente.
 */
export function Tabs({ tabs, active, onChange, className }: TabsProps) {
  return (
    <TabsPrimitive
      selectedKey={active}
      onSelectionChange={(key) => onChange(String(key))}
      className={className}
    >
      <TabList items={tabs} className="flex gap-1 border-b border-border">
        {(tab) => (
          <Tab
            id={tab.id}
            className="relative -mb-px inline-flex cursor-default items-center gap-2 border-b-2 border-transparent px-4 py-2.5 text-sm font-medium text-muted-foreground outline-none transition-colors hover:text-foreground data-[selected]:border-primary data-[selected]:text-primary data-[focus-visible]:ring-2 data-[focus-visible]:ring-ring/30"
          >
            {tab.icon}
            {tab.label}
          </Tab>
        )}
      </TabList>
    </TabsPrimitive>
  );
}
