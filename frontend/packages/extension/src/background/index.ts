import { extensionFetch } from "../auth";
import { apiEndpoint } from "../config";

const REFRESH_ALARM = "aurodlp-config-refresh";

interface PublicDomain {
  domain: string;
  direction: "sender" | "recipient" | "both";
  classification: "internal" | "partner" | "blocked";
}

interface PublicConfig {
  organization: { name: string; org_code: string };
  domains: PublicDomain[];
  blocked_domains?: PublicDomain[];
}

interface ConfigCache {
  org_code: string;
  organization_name: string;
  domains: PublicDomain[];
  blocked_domains: PublicDomain[];
  fetched_at: number;
}

type ConfigFetchResult =
  | { status: "ok"; config: ConfigCache }
  | { status: "not_found" }
  | { status: "transient_error" };

async function fetchConfig(orgCode: string): Promise<ConfigFetchResult> {
  try {
    const url = await apiEndpoint(
      `/api/v1/public/orgs/${encodeURIComponent(orgCode)}/config`,
    );
    const res = await extensionFetch(url, { method: "GET" });
    if (!res.ok) {
      console.warn("[AURO] Config fetch failed:", res.status);
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
        fetched_at: Date.now(),
      },
    };
  } catch (err) {
    console.warn("[AURO] Config fetch error", err);
    return { status: "transient_error" };
  }
}

async function refresh(): Promise<void> {
  const stored = await chrome.storage.local.get([
    "aurodlp_org_code",
    "aurodlp_extension_token",
    "aurodlp_config",
  ]);
  const orgCode =
    ((stored.aurodlp_org_code as string | undefined) ?? null)
      ?.trim()
      .toUpperCase() ?? null;
  if (!orgCode || !stored.aurodlp_extension_token) {
    await chrome.storage.local.remove("aurodlp_config");
    return;
  }

  const cached = stored.aurodlp_config as ConfigCache | undefined;
  if (cached?.org_code !== orgCode) {
    await chrome.storage.local.remove("aurodlp_config");
  }

  const configResult = await fetchConfig(orgCode);
  if (configResult.status === "ok") {
    await chrome.storage.local.set({ aurodlp_config: configResult.config });
  } else if (configResult.status === "not_found") {
    await chrome.storage.local.remove("aurodlp_config");
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
  if (
    area === "local" &&
    (changes.aurodlp_org_code || changes.aurodlp_extension_token)
  ) {
    void refresh();
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "REFRESH_CONFIG") {
    void refresh().then(() => sendResponse({ ok: true }));
    return true;
  }
  return false;
});
