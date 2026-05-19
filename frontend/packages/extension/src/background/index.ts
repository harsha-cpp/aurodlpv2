import { createApiClient } from '@aurodlpv2/shared/api';
import type { Verdict, AuthTokens } from '@aurodlpv2/shared';

const API_BASE_URL = 'http://localhost:8000';

const api = createApiClient({
  baseUrl: API_BASE_URL,
  getAccessToken,
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('refresh-auth', { periodInMinutes: 12 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'refresh-auth') {
    void refreshAccessToken();
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  void handleMessage(message).then(sendResponse);
  return true;
});

export type MessageType =
  | { type: 'SCAN_EMAIL'; payload: { subject: string; body: string; recipients: string[]; files: Array<{ name: string; data: string; mimeType: string }> } }
  | { type: 'GET_AUTH_STATUS' }
  | { type: 'LOGIN' };

async function handleMessage(message: MessageType): Promise<unknown> {
  switch (message.type) {
    case 'SCAN_EMAIL':
      return handleScanEmail(message.payload);
    case 'GET_AUTH_STATUS':
      return getAuthStatus();
    case 'LOGIN':
      return handleLogin();
    default:
      return { error: 'Unknown message type' };
  }
}

async function handleScanEmail(payload: {
  subject: string;
  body: string;
  recipients: string[];
  files: Array<{ name: string; data: string; mimeType: string }>;
}): Promise<Verdict> {
  const verdict = await api.scan.email({
    subject: payload.subject,
    body: payload.body,
    recipients: payload.recipients,
  });

  if (payload.files.length > 0 && verdict.scan_id) {
    const attachmentScanIds: string[] = [];
    for (const fileData of payload.files) {
      const blob = base64ToBlob(fileData.data, fileData.mimeType);
      const file = new File([blob], fileData.name, { type: fileData.mimeType });
      const result = await api.scan.uploadAttachment(verdict.scan_id, file);
      attachmentScanIds.push(result.scan_id);
    }
    if (attachmentScanIds.length > 0) {
      return api.scan.finalize({
        scan_id: verdict.scan_id,
        attachment_scan_ids: attachmentScanIds,
      });
    }
  }

  return verdict;
}

async function getAuthStatus(): Promise<{ authenticated: boolean; email?: string }> {
  try {
    const profile = await api.auth.me();
    return { authenticated: true, email: profile.email };
  } catch {
    return { authenticated: false };
  }
}

async function handleLogin(): Promise<AuthTokens> {
  const idToken = await getGoogleIdToken();
  const tokens = await api.auth.loginWithGoogle(idToken);
  await chrome.storage.session.set({
    access_token: tokens.access_token,
    expires_at: Date.now() + tokens.expires_in * 1000,
  });
  return tokens;
}

async function getAccessToken(): Promise<string | null> {
  const data = await chrome.storage.session.get(['access_token', 'expires_at']);
  if (!data.access_token) return null;
  if (Date.now() >= (data.expires_at as number) - 30_000) {
    try {
      const tokens = await api.auth.refresh();
      await chrome.storage.session.set({
        access_token: tokens.access_token,
        expires_at: Date.now() + tokens.expires_in * 1000,
      });
      return tokens.access_token;
    } catch {
      await chrome.storage.session.remove(['access_token', 'expires_at']);
      return null;
    }
  }
  return data.access_token as string;
}

async function refreshAccessToken(): Promise<void> {
  const token = await getAccessToken();
  if (!token) return;
  try {
    const tokens = await api.auth.refresh();
    await chrome.storage.session.set({
      access_token: tokens.access_token,
      expires_at: Date.now() + tokens.expires_in * 1000,
    });
  } catch {
    await chrome.storage.session.remove(['access_token', 'expires_at']);
  }
}

function getGoogleIdToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    const clientId = chrome.runtime.getManifest().oauth2?.client_id;
    if (!clientId || clientId.startsWith('REPLACE_WITH_')) {
      reject(new Error('Google OAuth client ID is not configured. Set it in manifest.json.'));
      return;
    }

    const redirectUri = chrome.identity.getRedirectURL();
    const state = crypto.randomUUID();
    const nonce = crypto.randomUUID();
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'id_token',
      scope: 'openid email profile',
      state,
      nonce,
      prompt: 'select_account',
    });

    chrome.identity.launchWebAuthFlow(
      {
        url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
        interactive: true,
      },
      (responseUrl) => {
        if (chrome.runtime.lastError || !responseUrl) {
          reject(new Error(chrome.runtime.lastError?.message ?? 'No token'));
          return;
        }

        const url = new URL(responseUrl);
        const responseParams = new URLSearchParams(url.hash.slice(1) || url.search.slice(1));
        if (responseParams.get('state') !== state) {
          reject(new Error('Invalid OAuth state'));
          return;
        }

        const idToken = responseParams.get('id_token');
        if (!idToken) {
          reject(new Error('No ID token'));
          return;
        }

        resolve(idToken);
      },
    );
  });
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const bytes = atob(base64);
  const buffer = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    buffer[i] = bytes.charCodeAt(i);
  }
  return new Blob([buffer], { type: mimeType });
}
