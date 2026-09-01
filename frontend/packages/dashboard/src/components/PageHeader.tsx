import type { ReactNode } from "react";

export default function PageHeader({
  section,
  title,
  lede,
  actions,
}: {
  section: string;
  title: string;
  lede?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header" aria-label={section}>
      <div className="page-header-text">
        <h1 className="h1">{title}</h1>
        {lede ? <p className="lede">{lede}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}
