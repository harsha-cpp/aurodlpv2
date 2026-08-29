const KNOWN = new Set(["allow", "warn", "block", "quarantine", "escalate"]);

export default function ActionPill({ action }: { action: string }) {
  const variant = KNOWN.has(action) ? action : "allow";
  return <span className={`action-pill action-pill-${variant}`}>{action}</span>;
}
