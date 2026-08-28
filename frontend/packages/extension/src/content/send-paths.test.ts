import { beforeEach, describe, expect, it } from 'vitest';
import {
  classifySendElement,
  findSendButton,
  findSendTrigger,
  isActivationKey,
  isSendShortcut,
  isTextEntryTarget,
  triggerLabel,
} from './send-paths';

function el(html: string): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = html;
  document.body.appendChild(host);
  return host.firstElementChild as HTMLElement;
}

beforeEach(() => {
  document.body.textContent = '';
});

describe('classifying a single control', () => {
  it('recognises the Send button in the shapes Gmail labels it', () => {
    expect(classifySendElement(el('<div role="button" aria-label="Send"></div>'))).toBe('send');
    expect(
      classifySendElement(el('<div role="button" aria-label="Send ‪(⌘Enter)‬"></div>')),
    ).toBe('send');
    expect(classifySendElement(el('<div role="button" data-tooltip="Send (Ctrl-Enter)"></div>'))).toBe(
      'send',
    );
    expect(classifySendElement(el('<div role="button" aria-label="Send &amp; Archive"></div>'))).toBe(
      'send',
    );
  });

  it('treats the Schedule send menu item as a send, not an exemption', () => {
    // The bypass this file exists to close: the interceptor used to return
    // early on any label containing "schedule".
    expect(classifySendElement(el('<div role="menuitem" aria-label="Schedule send"></div>'))).toBe(
      'schedule-open',
    );
    expect(classifySendElement(el('<div role="menuitem">Schedule send</div>'))).toBe('schedule-open');
  });

  it('treats the confirm button in the schedule dialog as a send', () => {
    expect(classifySendElement(el('<button aria-label="Schedule send">Schedule send</button>'))).toBe(
      'schedule-confirm',
    );
  });

  it('leaves discard alone - throwing a draft away is not a send', () => {
    expect(classifySendElement(el('<div role="button" aria-label="Discard draft"></div>'))).toBeNull();
  });

  it('ignores the arrow that only opens the send menu', () => {
    expect(
      classifySendElement(el('<div role="button" aria-label="More send options"></div>')),
    ).toBeNull();
  });

  it('ignores unrelated controls that merely mention sending', () => {
    expect(
      classifySendElement(el('<div role="menuitem" aria-label="Send feedback to Google"></div>')),
    ).toBeNull();
    expect(classifySendElement(el('<div role="button" aria-label="Save draft"></div>'))).toBeNull();
  });

  it('does not read a long text blob as a button label', () => {
    const long = el(
      '<div role="button">Please send this to the records department before the end of the day</div>',
    );
    expect(triggerLabel(long)).toBe('');
    expect(classifySendElement(long)).toBeNull();
  });
});

describe('the schedule dialog', () => {
  const dialog = (inner: string): HTMLElement =>
    el(`<div role="dialog" aria-label="Schedule send">${inner}</div>`);

  it('treats a preset time as a commitment even though it never says "send"', () => {
    const root = dialog('<button class="preset">Tomorrow morning 8:00 AM</button>');
    const preset = root.querySelector<HTMLElement>('.preset');
    expect(findSendTrigger(preset)?.kind).toBe('schedule-confirm');
  });

  it('ignores cancel and the date-picker navigation', () => {
    const root = dialog(
      '<button class="cancel">Cancel</button><button class="pick">Pick date &amp; time</button>',
    );
    expect(findSendTrigger(root.querySelector('.cancel'))).toBeNull();
    expect(findSendTrigger(root.querySelector('.pick'))).toBeNull();
  });

  it('does not claim buttons in unrelated dialogs', () => {
    const root = el('<div role="dialog" aria-label="Insert link"><button class="ok">OK</button></div>');
    expect(findSendTrigger(root.querySelector('.ok'))).toBeNull();
  });

  it('reads the dialog name from its heading when there is no aria-label', () => {
    const root = el(
      '<div role="dialog"><h2>Schedule send</h2><button class="preset">Monday morning</button></div>',
    );
    expect(findSendTrigger(root.querySelector('.preset'))?.kind).toBe('schedule-confirm');
  });
});

describe('walking up from the clicked node', () => {
  it('finds the button when the click lands on an inner span', () => {
    const button = el('<div role="button" aria-label="Send"><span class="inner">Send</span></div>');
    const trigger = findSendTrigger(button.querySelector('.inner'));
    expect(trigger?.kind).toBe('send');
    expect(trigger?.element).toBe(button);
  });

  it('returns nothing for an ordinary click in the message body', () => {
    const body = el('<div role="textbox" aria-label="Message Body"><p class="p">hello</p></div>');
    expect(findSendTrigger(body.querySelector('.p'))).toBeNull();
    expect(findSendTrigger(null)).toBeNull();
  });
});

describe('finding the send button to re-activate', () => {
  it('picks the Send button and not the options arrow', () => {
    const compose = el(
      '<div role="dialog">' +
        '<div role="button" aria-label="More send options" id="arrow"></div>' +
        '<div role="button" aria-label="Send" id="send"></div>' +
        '<div role="button" aria-label="Discard draft" id="discard"></div>' +
        '</div>',
    );
    expect(findSendButton(compose)?.id).toBe('send');
  });

  it('returns null when the compose has no send control', () => {
    expect(findSendButton(el('<div role="dialog"></div>'))).toBeNull();
  });
});

describe('keyboard send paths', () => {
  it('matches Gmail’s documented send shortcut on both platforms', () => {
    expect(isSendShortcut({ key: 'Enter', ctrlKey: true, metaKey: false })).toBe(true);
    expect(isSendShortcut({ key: 'Enter', ctrlKey: false, metaKey: true })).toBe(true);
    expect(isSendShortcut({ key: 'Enter', ctrlKey: false, metaKey: false })).toBe(false);
    expect(isSendShortcut({ key: 'a', ctrlKey: true, metaKey: false })).toBe(false);
  });

  it('treats Enter and Space on a focused control as activation', () => {
    // "Tab then Enter" is a documented Gmail send, and role=button divs never
    // synthesise a click from it.
    expect(isActivationKey({ key: 'Enter', ctrlKey: false, metaKey: false })).toBe(true);
    expect(isActivationKey({ key: ' ', ctrlKey: false, metaKey: false })).toBe(true);
    expect(isActivationKey({ key: 'Escape', ctrlKey: false, metaKey: false })).toBe(false);
  });

  it('never claims a keystroke that is going into text', () => {
    // Swallowing Enter in the message body would stop the user typing a
    // paragraph break, which is a worse bug than the one being fixed.
    const compose = el(
      '<div role="dialog">' +
        '<div role="textbox" aria-label="Message Body"><span class="line">line</span></div>' +
        '<input name="subjectbox" />' +
        '<div role="button" aria-label="Send" id="send"></div>' +
        '</div>',
    );
    expect(isTextEntryTarget(compose.querySelector('.line'))).toBe(true);
    expect(isTextEntryTarget(compose.querySelector('input'))).toBe(true);
    expect(isTextEntryTarget(compose.querySelector('#send'))).toBe(false);
    expect(isTextEntryTarget(null)).toBe(false);
  });
});
