import { request } from "../lib/api";

export interface Device {
  id: string;
  label: string;
  member_email: string | null;
  last_seen_at: string | null;
  revoked_at: string | null;
  expires_at: string;
  created_at: string;
}

export interface DeviceEnrollResponse {
  device: Device;
  device_token: string;
}

export const devicesApi = {
  list: () => request<Device[]>("/api/v1/devices"),
  enroll: (label: string) =>
    request<DeviceEnrollResponse>("/api/v1/devices/enroll", {
      method: "POST",
      body: { label },
    }),
  revoke: (id: string) =>
    request<Device>(`/api/v1/devices/${id}/revoke`, { method: "POST" }),
};
