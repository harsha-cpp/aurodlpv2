import { createApiClient } from '@medshield/shared';

export const api = createApiClient({
  baseUrl: import.meta.env['VITE_API_BASE_URL'] ?? '',
  getAccessToken: async () => null,
});
