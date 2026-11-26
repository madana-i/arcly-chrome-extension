async function configureSidebar() {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
}

// Reapply on worker startup as well as install/update; no persistent worker needed.
void configureSidebar().catch((error: unknown) => {
  console.error('サイドパネルを設定できませんでした。', error);
});

chrome.runtime.onInstalled.addListener(() => {
  void configureSidebar().catch(console.error);
});

chrome.runtime.onStartup.addListener(() => {
  void configureSidebar().catch(console.error);
});
import { LAUNCHER_COMMAND, LAUNCHER_MESSAGE, LauncherWindow } from './lib/launcher-window';

const launcher = new LauncherWindow();

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === LAUNCHER_COMMAND) void launcher.open(tab?.windowId).catch(console.error);
});

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (!message || typeof message !== 'object' || !('type' in message) || message.type !== LAUNCHER_MESSAGE) return;
  if (sender.id !== chrome.runtime.id) return;
  void launcher.open(sender.tab?.windowId).then(
    () => { sendResponse({ ok: true }); },
    (reason: unknown) => { sendResponse({ ok: false, error: reason instanceof Error ? reason.message : '検索を開けませんでした。' }); },
  );
  return true;
});

