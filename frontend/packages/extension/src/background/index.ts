import { BACKEND_URL } from "../config";
import {
  WEB_BLOCK_MESSAGE,
  webBlockKey,
  type WebBlockReport,
} from "../web-block";

const REFRESH_ALARM = "blade-config-refresh";

const WEB_BLOCK_DEDUPE_MS = 60_000;
const WEB_BLOCK_TIMEOUT_MS = 5_000;
const recentWebBlocks = new Map<string, number>();

function shouldReport(report: WebBlockReport, now: number): boolean {
  const key = webBlockKey(report);
  const last = recentWebBlocks.get(key);
  if (last !== undefined && now - last < WEB_BLOCK_DEDUPE_MS) return false;
  recentWebBlocks.set(key, now);
  for (const [k, at] of recentWebBlocks) {
    if (now - at >= WEB_BLOCK_DEDUPE_MS) recentWebBlocks.delete(k);
  }
  return true;
}

async function reportWebBlock(report: WebBlockReport): Promise<void> {
  if (!shouldReport(report, Date.now())) return;

  const stored = await chrome.storage.local.get([
    "blade_org_code",
    "blade_last_user_email",
  ]);
  const orgCode = (stored.blade_org_code as string | undefined)
    ?.trim()
    .toUpperCase();
  if (!orgCode) return;

  const userEmail =
    (stored.blade_last_user_email as string | undefined) ?? null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEB_BLOCK_TIMEOUT_MS);
  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        org_code: orgCode,
        client_event_id: crypto.randomUUID(),
        user_email: userEmail,
        action: "block",
        severity: report.severity,
        risk_score: report.risk_score,
        entities: report.entities,
        recipients: [],
        channel: "web",
        site_host: report.site_host,
      }),
    });
    if (!res.ok) console.warn("[Blade] web block report rejected:", res.status);
  } catch (err) {
    console.warn("[Blade] web block report failed", err);
  } finally {
    clearTimeout(timer);
  }
}

interface PublicDomain {
  domain: string;
  direction: "sender" | "recipient" | "both";
  classification: "internal" | "partner" | "blocked";
}

interface PublicConfig {
  organization: { name: string; org_code: string };
  domains: PublicDomain[];
  blocked_domains?: PublicDomain[];
  fail_open?: boolean;
}

interface ConfigCache {
  org_code: string;
  organization_name: string;
  domains: PublicDomain[];
  blocked_domains: PublicDomain[];
  fail_open: boolean;
  fetched_at: number;
}

type ConfigFetchResult =
  | { status: "ok"; config: ConfigCache }
  | { status: "not_found" }
  | { status: "transient_error" };

async function fetchConfig(orgCode: string): Promise<ConfigFetchResult> {
  try {
    const url = `${BACKEND_URL}/api/v1/public/orgs/${encodeURIComponent(orgCode)}/config`;
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) {
      console.warn("[Blade] Config fetch failed:", res.status);
      if (res.status === 404) return { status: "not_found" };
      return { status: "transient_error" };
    }
    const data = (await res.json()) as PublicConfig;
    return {
      status: "ok",
      config: {
        org_code: data.organization.org_code,
        organization_name: data.organization.name,
        domains: data.domains,
        blocked_domains: data.blocked_domains ?? [],
        fail_open: data.fail_open === true,
        fetched_at: Date.now(),
      },
    };
  } catch (err) {
    console.warn("[Blade] Config fetch error", err);
    return { status: "transient_error" };
  }
}

async function refresh(): Promise<void> {
  const stored = await chrome.storage.local.get([
    "blade_org_code",
    "blade_config",
  ]);
  const orgCode =
    ((stored.blade_org_code as string | undefined) ?? null)
      ?.trim()
      .toUpperCase() ?? null;
  if (!orgCode) {
    await chrome.storage.local.remove("blade_config");
    return;
  }

  const cached = stored.blade_config as ConfigCache | undefined;
  if (cached?.org_code !== orgCode) {
    await chrome.storage.local.remove("blade_config");
  }

  const configResult = await fetchConfig(orgCode);
  if (configResult.status === "ok") {
    await chrome.storage.local.set({ blade_config: configResult.config });
  } else if (configResult.status === "not_found") {
    await chrome.storage.local.remove("blade_config");
  }
  // Transient network/server failures keep only same-org cached config.
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(REFRESH_ALARM, {
    periodInMinutes: 5,
    delayInMinutes: 0.1,
  });
  void refresh();
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(REFRESH_ALARM, {
    periodInMinutes: 5,
    delayInMinutes: 0.1,
  });
  void refresh();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === REFRESH_ALARM) void refresh();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.blade_org_code) {
    void refresh();
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "REFRESH_CONFIG") {
    void refresh().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message?.type === WEB_BLOCK_MESSAGE) {
    void reportWebBlock(message as WebBlockReport).then(() =>
      sendResponse({ ok: true }),
    );
    return true;
  }
  return false;
});
