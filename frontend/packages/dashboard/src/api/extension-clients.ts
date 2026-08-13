import { request } from "../lib/api";

export interface ExtensionClient {
  id: string;
  label: string;
  status: "active" | "revoked";
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
}

export interface ExtensionEnrollment extends ExtensionClient {
  token: string;
}

export const extensionClientsApi = {
  list: () => request<ExtensionClient[]>("/api/v1/extension-clients"),
  create: (label: string) =>
    request<ExtensionEnrollment>("/api/v1/extension-clients", {
      method: "POST",
      body: { label },
    }),
  revoke: (id: string) =>
    request<ExtensionClient>(
      `/api/v1/extension-clients/${encodeURIComponent(id)}`,
      {
        method: "DELETE",
      },
    ),
};
