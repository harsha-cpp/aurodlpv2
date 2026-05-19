import * as InboxSDK from '@inboxsdk/core';
import { mountWarningModal } from '../modal/mount';
import { takeCapturedFiles, installAttachmentCapture } from './attachment-capture';
import { sendScanRequest } from '../shared/messaging';

const APP_ID = 'medshield-content';

async function bootstrap(): Promise<void> {
  const sdk = await InboxSDK.load(2, APP_ID);
  installAttachmentCapture(document);

  sdk.Compose.registerComposeViewHandler((view) => {
    view.on('presending', async (event) => {
      event.cancel();

      try {
        const files = takeCapturedFiles(view);
        const verdict = await sendScanRequest({
          subject: view.getSubject(),
          body: view.getHTMLContent(),
          recipients: view.getToRecipients().map((r) => r.emailAddress),
          files,
        });

        switch (verdict.action) {
          case 'allow':
            setTimeout(() => view.send(), 0);
            break;
          case 'warn':
          case 'block':
          case 'quarantine':
          case 'escalate':
            await mountWarningModal(view, verdict);
            break;
        }
      } catch (err) {
        console.error('[MedShield] Scan failed, allowing send as fallback:', err);
        setTimeout(() => view.send(), 0);
      }
    });
  });
}

void bootstrap();
