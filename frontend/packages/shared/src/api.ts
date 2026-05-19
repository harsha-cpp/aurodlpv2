import {
  verdictSchema,
  attachmentUploadResultSchema,
  authTokensSchema,
  userProfileSchema,
} from './schemas';
import type {
  Verdict,
  AttachmentUploadResult,
  AuthTokens,
  UserProfile,
  ScanEmailPayload,
  ScanFinalizePayload,
} from './types';

export interface ApiClientOptions {
  baseUrl: string;
  getAccessToken: () => Promise<string | null>;
  fetchImpl?: typeof fetch;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function createApiClient(opts: ApiClientOptions) {
  const f = opts.fetchImpl ?? fetch;

  async function authHeaders(contentType?: string): Promise<Headers> {
    const h = new Headers();
    const token = await opts.getAccessToken();
    if (token) h.set('authorization', `Bearer ${token}`);
    if (contentType) h.set('content-type', contentType);
    return h;
  }

  async function request<T>(
    path: string,
    init: RequestInit,
    parser: (raw: unknown) => T,
  ): Promise<T> {
    const res = await f(`${opts.baseUrl}${path}`, init);
    const body = (await res.json().catch(() => null)) as unknown;
    if (!res.ok) throw new ApiError(res.status, res.statusText, body);
    return parser(body);
  }

  return {
    auth: {
      loginWithGoogle(idToken: string): Promise<AuthTokens> {
        return request(
          '/api/v1/auth/google',
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id_token: idToken }),
          },
          (raw) => authTokensSchema.parse(raw),
        );
      },
      refresh(): Promise<AuthTokens> {
        return request(
          '/api/v1/auth/refresh',
          { method: 'POST', headers: { 'content-type': 'application/json' } },
          (raw) => authTokensSchema.parse(raw),
        );
      },
      async me(): Promise<UserProfile> {
        const h = await authHeaders();
        return request('/api/v1/auth/me', { method: 'GET', headers: h }, (raw) =>
          userProfileSchema.parse(raw),
        );
      },
    },
    scan: {
      async email(payload: ScanEmailPayload): Promise<Verdict> {
        const h = await authHeaders('application/json');
        return request(
          '/api/v1/scan/email',
          { method: 'POST', headers: h, body: JSON.stringify(payload) },
          (raw) => verdictSchema.parse(raw),
        );
      },
      async uploadAttachment(scanId: string, file: File): Promise<AttachmentUploadResult> {
        const h = await authHeaders();
        const form = new FormData();
        form.append('file', file);
        return request(
          `/api/v1/scan/attachment?scan_id=${encodeURIComponent(scanId)}`,
          { method: 'POST', headers: h, body: form },
          (raw) => attachmentUploadResultSchema.parse(raw),
        );
      },
      async finalize(payload: ScanFinalizePayload): Promise<Verdict> {
        const h = await authHeaders('application/json');
        return request(
          `/api/v1/scan/${payload.scan_id}/finalize`,
          {
            method: 'POST',
            headers: h,
            body: JSON.stringify({ attachment_scan_ids: payload.attachment_scan_ids }),
          },
          (raw) => verdictSchema.parse(raw),
        );
      },
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
