import type { ReactNode } from "react";

interface ScreenProps {
  title: string;
  children?: ReactNode;
}

/** Content area of a routed screen: padding and the page heading. */
export function Screen({ title, children }: ScreenProps) {
  return (
    <div className="flex min-h-full flex-col gap-10 px-10 pb-12">
      <h1 className="text-title">{title}</h1>
      {children}
    </div>
  );
}
