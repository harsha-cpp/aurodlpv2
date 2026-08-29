import { request } from "../lib/api";
import type { Organization } from "./auth";

export const orgsApi = {
  current: () => request<Organization>("/api/v1/orgs/current"),
  update: (body: { name: string }) =>
    request<Organization>("/api/v1/orgs/current", { method: "PATCH", body }),
  regenerateCode: () =>
    request<Organization>("/api/v1/orgs/current/regenerate-code", {
      method: "POST",
    }),
};
