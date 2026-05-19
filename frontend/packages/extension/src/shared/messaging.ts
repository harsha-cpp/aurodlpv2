import type { Verdict } from '@aurodlpv2/shared';

export interface ScanRequest {
  subject: string;
  body: string;
  recipients: string[];
  files: File[];
}

export async function sendScanRequest(req: ScanRequest): Promise<Verdict> {
  const serializedFiles = await Promise.all(
    req.files.map(async (file) => ({
      name: file.name,
      data: await fileToBase64(file),
      mimeType: file.type || 'application/octet-stream',
    })),
  );

  const response = await chrome.runtime.sendMessage({
    type: 'SCAN_EMAIL',
    payload: {
      subject: req.subject,
      body: req.body,
      recipients: req.recipients,
      files: serializedFiles,
    },
  });

  if (response?.error) {
    throw new Error(response.error as string);
  }

  return response as Verdict;
}

export async function getAuthStatus(): Promise<{ authenticated: boolean; email?: string }> {
  const response = await Promise.race([
    chrome.runtime.sendMessage({ type: 'GET_AUTH_STATUS' }),
    new Promise<undefined>((resolve) => setTimeout(resolve, 5000)),
  ]);
  return response ?? { authenticated: false };
}

export async function login(): Promise<void> {
  await chrome.runtime.sendMessage({ type: 'LOGIN' });
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1] ?? '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
