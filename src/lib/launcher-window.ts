export const LAUNCHER_COMMAND = 'open-launcher';
export const LAUNCHER_MESSAGE = 'arcly:open-launcher';

export async function requestLauncher(): Promise<void> {
  if (!globalThis.chrome?.runtime?.id) {
    window.open('./launcher.html', 'arcly-search', 'popup,width=640,height=460');
    return;
  }
  const response = await chrome.runtime.sendMessage({ type: LAUNCHER_MESSAGE }) as { ok: boolean; error?: string };
  if (!response?.ok) throw new Error(response?.error || '検索を開けませんでした。');
}

export class LauncherWindow {
  private opening: Promise<void> | null = null;

  constructor(private readonly api: typeof chrome = chrome) {}

  open(sourceWindowId?: number): Promise<void> {
    if (!this.opening) this.opening = this.openWindow(sourceWindowId).finally(() => { this.opening = null; });
    return this.opening;
  }

  private async openWindow(sourceWindowId?: number): Promise<void> {
    const windows = await this.api.windows.getAll({ populate: true });
    const launcherUrl = this.api.runtime.getURL('launcher.html');
    const existing = windows.find((window) => window.type === 'popup' && window.tabs?.some((tab) => tab.url?.split('?')[0] === launcherUrl));
    const normal = windows.filter((window) => window.type === 'normal' && !window.incognito);
    const source = normal.find((window) => window.id === sourceWindowId)
      ?? normal.find((window) => window.focused)
      ?? normal.find((window) => window.id === Number(new URL(existing?.tabs?.[0]?.url || launcherUrl).searchParams.get('windowId')))
      ?? normal[0];
    const url = source?.id === undefined ? launcherUrl : `${launcherUrl}?windowId=${source.id}`;
    const width = Math.min(640, source?.width ?? 640);
    const height = Math.min(460, source?.height ?? 460);
    const bounds = {
      width, height,
      ...(source ? {
        left: (source.left ?? 0) + Math.round(((source.width ?? width) - width) / 2),
        top: (source.top ?? 0) + Math.round(((source.height ?? height) - height) / 2),
      } : {}),
    };
    if (existing?.id !== undefined && existing.tabs?.[0]?.id !== undefined) {
      // Updating the page also resets its query and focuses the search input.
      await this.api.tabs.update(existing.tabs[0].id, { url });
      await this.api.windows.update(existing.id, { focused: true, ...bounds, ...(existing.state === 'minimized' ? { state: 'normal' as const } : {}) });
      return;
    }
    await this.api.windows.create({
      url, type: 'popup', focused: true, ...bounds,
    });
  }
}
