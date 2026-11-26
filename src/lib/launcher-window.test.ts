import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { LauncherWindow } from './launcher-window';

const url = 'chrome-extension://test/launcher.html';
function makeApi() {
  return {
    runtime: { getURL: vi.fn().mockReturnValue(url) },
    windows: {
      getAll: vi.fn().mockResolvedValue([{ id: 42, type: 'normal', focused: true, left: -1200, top: 100, width: 1000, height: 800 }]),
      create: vi.fn().mockResolvedValue({}), update: vi.fn().mockResolvedValue({}),
    },
    tabs: { update: vi.fn().mockResolvedValue({}) },
  };
}

describe('検索ウィンドウの起動', () => {
  it('Chrome内だけのCommand+Kを登録し、既存のサイドバー用ショートカットも残す', () => {
    const manifest = JSON.parse(readFileSync(new URL('../../public/manifest.json', import.meta.url), 'utf8'));
    expect(manifest.name).toBe('arcly');
    expect(manifest.commands['open-launcher']).toMatchObject({ suggested_key: { mac: 'Command+K', default: 'Ctrl+K' }, global: false });
    expect(manifest.commands._execute_action.suggested_key.default).toBe('Alt+Shift+S');
  });
  it('呼び出し元のウィンドウ中央へ開き、負のモニター座標も維持する', async () => {
    const api = makeApi();
    await new LauncherWindow(api as unknown as typeof chrome).open(42);
    expect(api.windows.create).toHaveBeenCalledExactlyOnceWith({ url: `${url}?windowId=42`, type: 'popup', focused: true, width: 640, height: 460, left: -1020, top: 270 });
  });
  it('連打しても作成は一度だけ行う', async () => {
    const api = makeApi();
    const launcher = new LauncherWindow(api as unknown as typeof chrome);
    await Promise.all([launcher.open(42), launcher.open(42), launcher.open(42)]);
    expect(api.windows.create).toHaveBeenCalledTimes(1);
  });
  it('サービスワーカーの再起動後も既存の検索画面を再利用し、呼び出し元を更新する', async () => {
    const api = makeApi();
    api.windows.getAll.mockResolvedValueOnce([
      { id: 9, type: 'normal', focused: true },
      { id: 10, type: 'popup', tabs: [{ id: 7, url: `${url}?windowId=42` }] },
    ]);
    await new LauncherWindow(api as unknown as typeof chrome).open(9);
    expect(api.tabs.update).toHaveBeenCalledExactlyOnceWith(7, { url: `${url}?windowId=9` });
    expect(api.windows.update).toHaveBeenCalledExactlyOnceWith(10, { focused: true, width: 640, height: 460, left: 0, top: 0 });
    expect(api.windows.create).not.toHaveBeenCalled();
  });
  it('作成に失敗しても次のショートカットで再試行できる', async () => {
    const api = makeApi();
    api.windows.create.mockRejectedValueOnce(new Error('一時エラー'));
    const launcher = new LauncherWindow(api as unknown as typeof chrome);
    await expect(launcher.open()).rejects.toThrow('一時エラー');
    await expect(launcher.open()).resolves.toBeUndefined();
    expect(api.windows.create).toHaveBeenCalledTimes(2);
  });
});
