import type { Verdict } from "@bladedlp/shared";
import ReactDOM from "react-dom/client";
import WarningModal from "./WarningModal";
import styles from "./styles.css?inline";
import { BACKEND_URL, QUARANTINE_POLL_TIMEOUT_MS } from "../config";

interface ComposeView {
  getElement(): HTMLElement;
  send(): void;
}

interface QuarantineStatus {
  status: "pending" | "approved" | "rejected";
}

export function mountWarningModal(
  view: ComposeView,
  verdict: Verdict,
  orgCode?: string | null,
): () => void {
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.inset = "0";
  host.style.zIndex = "2147483647";
  host.style.pointerEvents = "none";
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: "closed" });

  const styleEl = document.createElement("style");
  styleEl.textContent = styles;
  shadow.appendChild(styleEl);

  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.inset = "0";
  container.style.pointerEvents = "auto";
  shadow.appendChild(container);

  const root = ReactDOM.createRoot(container);

  const cleanup = (): void => {
    root.unmount();
    host.remove();
  };

  const pollQuarantine =
    verdict.quarantine_id && orgCode
      ? async () => {
          const controller = new AbortController();
          const timer = setTimeout(
            () => controller.abort(),
            QUARANTINE_POLL_TIMEOUT_MS,
          );
          try {
            const res = await fetch(
              `${BACKEND_URL}/api/v1/quarantine/${encodeURIComponent(
                verdict.quarantine_id ?? "",
              )}/status?org_code=${encodeURIComponent(orgCode)}`,
              { signal: controller.signal },
            );
            if (!res.ok) throw new Error(res.statusText);
            return (await res.json()) as QuarantineStatus;
          } finally {
            clearTimeout(timer);
          }
        }
      : undefined;

  root.render(
    <WarningModal
      verdict={verdict}
      onClose={cleanup}
      onSend={() => {
        cleanup();
        view.send();
      }}
      pollQuarantine={pollQuarantine}
    />,
  );

  return cleanup;
}
