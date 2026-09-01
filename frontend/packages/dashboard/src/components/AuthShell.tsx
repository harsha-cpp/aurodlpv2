import type { ReactNode } from "react";
import BladeWordmark from "./BladeWordmark";

export default function AuthShell({
  title,
  children,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="auth-split">
      <aside className="auth-panel" aria-hidden="true">
        <div className="auth-panel-brand">
          <BladeWordmark height={38} className="sidebar-brand-lockup" />
          <span className="brand-tm">DLP</span>
        </div>
        <div className="col gap-6">
          <h2 className="auth-panel-claim">
            Patient data stays inside the hospital.
          </h2>
          <ul className="auth-panel-points">
            <li>Every outgoing Gmail message is checked before it leaves.</li>
            <li>
              Aadhaar, ABHA, record numbers, diagnoses and 17 more identifiers.
            </li>
            <li>Rules you set. Decisions you can audit, hash by hash.</li>
          </ul>
        </div>
        <div className="auth-panel-foot">Blade Healthcare DLP</div>
      </aside>
      <main className="auth-main">
        <div className={`auth-form${wide ? " is-wide" : ""}`}>
          <h1 className="h1">{title}</h1>
          {children}
        </div>
      </main>
    </div>
  );
}
