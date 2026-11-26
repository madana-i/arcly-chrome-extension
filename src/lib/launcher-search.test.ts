import { describe, expect, it, vi } from 'vitest';
import { ChromeLauncherAdapter, searchLauncher, type LauncherData, type LauncherResult } from './launcher-search';

vi.mock('./browser', () => ({ browser: {} }));

const data: LauncherData = {
  sourceWindowId: 10,
  tabs: [
    { id: 1, windowId: 20, active: true, title: '別窓のタブ', url: 'https://example.com/other' },
    { id: 2, windowId: 10, active: false, title: 'React ガイド', url: 'https://react.dev/learn' },
    { id: 3, windowId: 10, active: true, title: 'GitHub', url: 'https://github.com/' },
  ],
  bookmarks: [
    { id: '1', title: 'バー', children: [{ id: '11', title: 'React', url: 'https://react.dev/' }] },
    { id: '2', title: 'その他', children: [{ id: '21', title: 'AWS', url: 'https://aws.amazon.com/' }] },
    { id: '3', title: 'モバイル', children: [{ id: '31', title: 'モバイルの資料', url: 'https://mobile.example.com/' }] },
  ],
};
const bookmark: LauncherResult = { kind: 'bookmark', key: 'bookmark:11', title: 'React', url: 'https://react.dev/', detail: '' };
function makeApi() {
  return {
    runtime: { getURL: vi.fn().mockReturnValue('chrome-extension://test/launcher.html') },
    bookmarks: { getTree: vi.fn().mockResolvedValue([{ id: '0', children: data.bookmarks }]) },
    tabs: {
      query: vi.fn().mockResolvedValue([]), get: vi.fn(), update: vi.fn().mockResolvedValue({}), create: vi.fn().mockResolvedValue({}),
    },
    windows: {
      getAll: vi.fn().mockResolvedValue([{ id: 10, type: 'normal', focused: false }]),
      update: vi.fn().mockResolvedValue({}), create: vi.fn().mockResolvedValue({}),
    },
  };
}

describe('全体検索', () => {
  it('初期表示では呼び出し元のタブを優先し、他のウィンドウと全ルートのブックマークも含める', () => {
    const results = searchLauncher(data, '');
    expect(results.map((result) => result.key)).toEqual(['tab:3', 'tab:2', 'tab:1', 'bookmark:11', 'bookmark:21', 'bookmark:31']);
    expect(results[2].detail).toContain('別のウィンドウ');
  });
  it('完全一致の名前を優先し、全角英数字と大文字小文字を正規化する', () => {
    expect(searchLauncher(data, 'ＲＥＡＣＴ').map((result) => result.key)).toEqual(['bookmark:11', 'tab:2']);
  });
  it('複数の単語でURL・フォルダ階層を横断して絞り込める', () => {
    expect(searchLauncher(data, 'その他 amazon').map((result) => result.key)).toEqual(['bookmark:21']);
    expect(searchLauncher(data, 'mobile.example').map((result) => result.key)).toEqual(['bookmark:31']);
    expect(searchLauncher(data, '見つからない')).toEqual([]);
  });
  it('実行できないURLのブックマークを結果に含めない', () => {
    expect(searchLauncher({ tabs: [], bookmarks: [{ id: 'x', title: '危険', url: 'javascript:alert(1)' }] }, '')).toEqual([]);
  });
});

describe('検索からのChrome操作', () => {
  it('全ウィンドウから取得し、検索自身やシークレットのタブを含めない', async () => {
    const api = makeApi();
    api.tabs.query.mockResolvedValueOnce([{ id: 1, windowId: 20, title: '別窓', pendingUrl: 'https://example.com/new', url: 'https://example.com/old', active: true }, { id: 2, incognito: true }, { id: 3, url: 'chrome-extension://test/launcher.html?windowId=10' }]);
    const result = await new ChromeLauncherAdapter(10, api as unknown as typeof chrome).load();
    expect(api.tabs.query).toHaveBeenCalledExactlyOnceWith({});
    expect(result.tabs).toMatchObject([{ id: 1, windowId: 20, url: 'https://example.com/new' }]);
    expect(result.bookmarks).toHaveLength(3);
  });
  it('タブが別ウィンドウへ移動済みでも最新の所属先へ切り替える', async () => {
    const api = makeApi();
    api.tabs.get.mockResolvedValueOnce({ id: 1, windowId: 30, active: false });
    await new ChromeLauncherAdapter(10, api as unknown as typeof chrome).open({ ...bookmark, kind: 'tab', tabId: 1, windowId: 20 });
    expect(api.tabs.get).toHaveBeenCalledWith(1);
    expect(api.tabs.update).toHaveBeenCalledExactlyOnceWith(1, { active: true });
    expect(api.windows.update).toHaveBeenCalledExactlyOnceWith(30, { focused: true });
  });
  it('ブックマークのURLが別ウィンドウで開かれていれば再利用する', async () => {
    const api = makeApi();
    api.tabs.query.mockResolvedValueOnce([{ id: 8, windowId: 20, url: bookmark.url, active: true }]);
    await new ChromeLauncherAdapter(10, api as unknown as typeof chrome).open(bookmark);
    expect(api.windows.update).toHaveBeenCalledExactlyOnceWith(20, { focused: true });
    expect(api.tabs.create).not.toHaveBeenCalled();
  });
  it('同じURLが複数窓にあれば呼び出し元を優先する', async () => {
    const api = makeApi();
    api.tabs.query.mockResolvedValueOnce([{ id: 8, windowId: 20, url: bookmark.url, active: true }, { id: 9, windowId: 10, url: bookmark.url, active: false }]);
    await new ChromeLauncherAdapter(10, api as unknown as typeof chrome).open(bookmark);
    expect(api.tabs.update).toHaveBeenCalledExactlyOnceWith(9, { active: true });
    expect(api.windows.update).toHaveBeenCalledExactlyOnceWith(10, { focused: true });
  });
  it('別URLへ遷移中なら再利用せず、呼び出し元に新規タブを開く', async () => {
    const api = makeApi();
    api.tabs.query.mockResolvedValueOnce([{ id: 8, windowId: 20, url: bookmark.url, pendingUrl: 'https://react.dev/learn', active: true }]);
    await new ChromeLauncherAdapter(10, api as unknown as typeof chrome).open(bookmark);
    expect(api.tabs.create).toHaveBeenCalledExactlyOnceWith({ url: bookmark.url, windowId: 10, active: true });
    expect(api.windows.update).toHaveBeenCalledExactlyOnceWith(10, { focused: true });
  });
  it('呼び出し元が閉じられた場合は残っている通常ウィンドウへ開く', async () => {
    const api = makeApi();
    api.windows.getAll.mockResolvedValueOnce([{ id: 20, type: 'normal', focused: false }]);
    await new ChromeLauncherAdapter(10, api as unknown as typeof chrome).open(bookmark);
    expect(api.tabs.create).toHaveBeenCalledWith({ url: bookmark.url, windowId: 20, active: true });
  });
  it('通常ウィンドウがなければ新しく作成し、検索ポップアップには開かない', async () => {
    const api = makeApi();
    api.windows.getAll.mockResolvedValueOnce([]);
    await new ChromeLauncherAdapter(10, api as unknown as typeof chrome).open(bookmark);
    expect(api.windows.create).toHaveBeenCalledExactlyOnceWith({ url: bookmark.url, type: 'normal', focused: true });
    expect(api.tabs.create).not.toHaveBeenCalled();
  });
  it('操作失敗を画面へ返し、危険なURLはChrome APIに渡さない', async () => {
    const api = makeApi();
    const adapter = new ChromeLauncherAdapter(10, api as unknown as typeof chrome);
    api.tabs.create.mockRejectedValueOnce(new Error('作成失敗'));
    await expect(adapter.open(bookmark)).rejects.toThrow('作成失敗');
    await expect(adapter.open({ ...bookmark, url: 'javascript:alert(1)' })).rejects.toThrow();
    expect(api.tabs.create).toHaveBeenCalledTimes(1);
  });
});
