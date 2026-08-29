import { request } from "../lib/api";

export type DomainDirection = "sender" | "recipient" | "both";
export type DomainClass = "internal" | "partner" | "blocked";

export interface ApprovedDomain {
  id: string;
  domain: string;
  direction: DomainDirection;
  classification: DomainClass;
  notes: string | null;
  created_at: string;
}

export interface DomainIn {
  domain: string;
  direction: DomainDirection;
  classification: DomainClass;
  notes?: string | undefined;
}

export const domainsApi = {
  list: () => request<ApprovedDomain[]>("/api/v1/domains"),
  create: (body: DomainIn) =>
    request<ApprovedDomain>("/api/v1/domains", { method: "POST", body }),
  update: (id: string, body: Partial<DomainIn>) =>
    request<ApprovedDomain>(`/api/v1/domains/${id}`, { method: "PATCH", body }),
  remove: (id: string) =>
    request<void>(`/api/v1/domains/${id}`, { method: "DELETE" }),
};
