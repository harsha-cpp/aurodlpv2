const captured = new WeakMap<Element, File[]>();

export function installAttachmentCapture(root: Document): void {
  const handler = (e: Event): void => {
    const dialog = (e.target as HTMLElement | null)?.closest('[role="dialog"]');
    if (!dialog) return;

    let files: FileList | null = null;
    if (e instanceof DragEvent) files = e.dataTransfer?.files ?? null;
    if (e instanceof ClipboardEvent) files = e.clipboardData?.files ?? null;
    if (e.type === 'change') files = (e.target as HTMLInputElement | null)?.files ?? null;
    if (!files?.length) return;

    const existing = captured.get(dialog) ?? [];
    captured.set(dialog, [...existing, ...Array.from(files)]);
  };

  for (const type of ['drop', 'paste', 'change'] as const) {
    root.addEventListener(type, handler, true);
  }
}

export function takeCapturedFiles(view: { getElement: () => HTMLElement }): File[] {
  const dialog = view.getElement().closest('[role="dialog"]') ?? view.getElement();
  const files = captured.get(dialog) ?? [];
  captured.delete(dialog);
  return files;
}
