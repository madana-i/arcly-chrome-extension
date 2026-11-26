import { describe, expect, it, vi } from 'vitest';
import { ChromeAdapter } from './chrome-adapter';

function makeApi() {
  const event = () => ({ addListener: vi.fn(), removeListener: vi.fn() });
  return {
    windows: { getCurrent: vi.fn().mockResolvedValue({ id: 42 }) },
    tabs: {
      query: vi.fn().mockResolvedValue([]), create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}), remove: vi.fn().mockResolvedValue(undefined), move: vi.fn().mockResolvedValue({}),
      createSplit: vi.fn().mockResolvedValue(70), unsplit: vi.fn().mockResolvedValue(undefined),
      onCreated: event(), onRemoved: event(), onUpdated: event(), onMoved: event(),
      onActivated: event(), onAttached: event(), onDetached: event(), onReplaced: event(),
    },
    bookmarks: {
      getTree: vi.fn().mockResolvedValue([{ id: '0', children: [{ id: '1', title: 'バー', parentId: '0', children: [{ id: '11', title: 'user', parentId: '1', url: 'https://example.com' }] }] }]),
      get: vi.fn().mockResolvedValue([{ id: '11', url: 'https://example.com', parentId: '1' }]),
      create: vi.fn().mockResolvedValue({}), update: vi.fn().mockResolvedValue({}), move: vi.fn().mockResolvedValue({}),
      remove: vi.fn().mockResolvedValue(undefined), removeTree: vi.fn().mockResolvedValue(undefined),
      onCreated: event(), onRemoved: event(), onChanged: event(), onMoved: event(), onChildrenReordered: event(), onImportEnded: event(),
    },
    storage: { local: { get: vi.fn().mockResolvedValue({}), set: vi.fn().mockResolvedValue(undefined) } },
  };
}

describe('Chrome API接続', () => {
  it.each([false, true])('ブックマークを対象の右隣に直接分割して開く（固定=%s）', async (pinned) => {
    const api = makeApi();
    api.tabs.query.mockResolvedValueOnce([{ id: 8, windowId: 42, index: 2, pinned, groupId: 3 }] as never);
    await new ChromeAdapter(api as unknown as typeof chrome).openBookmarkInSplit('https://react.dev/', 8);
    expect(api.tabs.create).toHaveBeenCalledExactlyOnceWith({ url: 'https://react.dev/', windowId: 42, index: 3, pinned, active: true, splitWithTabId: 8 });
    expect(api.tabs.createSplit).not.toHaveBeenCalled();
    expect(api.tabs.move).not.toHaveBeenCalled();
    expect(api.bookmarks.update).not.toHaveBeenCalled();
    expect(api.bookmarks.move).not.toHaveBeenCalled();
  });
  it('同じURLの分割できるタブがあれば新規作成せず再利用して、そのタブをアクティブにする', async () => {
    const api = makeApi();
    const tabs = [
      { id: 8, windowId: 42, index: 0, pinned: false, groupId: 3, url: 'https://example.com/' },
      { id: 7, windowId: 42, index: 1, pinned: false, groupId: 3, url: 'https://react.dev/' },
    ];
    api.tabs.query.mockResolvedValue(tabs as never);
    await new ChromeAdapter(api as unknown as typeof chrome).openBookmarkInSplit('https://react.dev/', 8);
    expect(api.tabs.create).not.toHaveBeenCalled();
    expect(api.tabs.createSplit).toHaveBeenCalledExactlyOnceWith([8, 7]);
    expect(api.tabs.update).toHaveBeenLastCalledWith(7, { active: true });
  });
  it.each([
    { name: '別のURLへ遷移中', overrides: { pendingUrl: 'https://react.dev/learn' } },
    { name: '別グループ', overrides: { groupId: 4 } },
    { name: '固定状態が異なる', overrides: { pinned: true } },
    { name: '別の分割に所属', overrides: { splitViewId: 0 } },
  ])('同じURLのタブが$nameなら、そのタブを変更せず新しく分割して開く', async ({ overrides }) => {
    const api = makeApi();
    api.tabs.query.mockResolvedValueOnce([
      { id: 8, windowId: 42, index: 0, pinned: false, groupId: -1 },
      { id: 7, windowId: 42, index: 1, pinned: false, groupId: -1, url: 'https://react.dev/', ...overrides },
    ] as never);
    await new ChromeAdapter(api as unknown as typeof chrome).openBookmarkInSplit('https://react.dev/', 8);
    expect(api.tabs.create).toHaveBeenCalledExactlyOnceWith({ url: 'https://react.dev/', windowId: 42, index: 1, pinned: false, active: true, splitWithTabId: 8 });
    expect(api.tabs.move).not.toHaveBeenCalled();
    expect(api.tabs.update).not.toHaveBeenCalled();
  });
  it.each([{ tabs: [] }, { tabs: [{ id: 8, windowId: 42, index: 0, splitViewId: 0 }] }])('既に閉じられたタブや分割済みのタブには新規作成しない', async ({ tabs }) => {
    const api = makeApi();
    api.tabs.query.mockResolvedValueOnce(tabs as never);
    await expect(new ChromeAdapter(api as unknown as typeof chrome).openBookmarkInSplit('https://react.dev/', 8)).rejects.toThrow('未分割');
    expect(api.tabs.create).not.toHaveBeenCalled();
  });
  it('未対応Chromeや開けないURLでは何も作成せず、APIエラーを呼び出し元へ伝える', async () => {
    const api = makeApi();
    const browser = new ChromeAdapter(api as unknown as typeof chrome);
    await expect(browser.openBookmarkInSplit('javascript:alert(1)', 8)).rejects.toThrow('URL');
    expect(api.tabs.query).not.toHaveBeenCalled();
    api.tabs.query.mockResolvedValueOnce([{ id: 8, windowId: 42, index: 0, pinned: false }] as never);
    api.tabs.create.mockRejectedValueOnce(new Error('作成失敗'));
    await expect(browser.openBookmarkInSplit('https://react.dev/', 8)).rejects.toThrow('作成失敗');
    Object.assign(api.tabs, { createSplit: undefined });
    await expect(browser.openBookmarkInSplit('https://react.dev/', 8)).rejects.toThrow('Chrome 155');
    expect(api.tabs.create).toHaveBeenCalledTimes(1);
  });
  it('Split Viewの両方のAPIがあるときだけ対応と判定する', () => {
    const api = makeApi();
    const browser = new ChromeAdapter(api as unknown as typeof chrome);
    expect(browser.supportsSplitView).toBe(true);
    Object.assign(api.tabs, { createSplit: undefined });
    expect(browser.supportsSplitView).toBe(false);
  });
  it('分割IDとグループをタブ一覧へ反映し、分割変更通知でも再取得する', async () => {
    const api = makeApi();
    api.tabs.query.mockResolvedValueOnce([{ id: 7, windowId: 42, index: 0, groupId: 8, splitViewId: 0 }] as never);
    const browser = new ChromeAdapter(api as unknown as typeof chrome);
    expect(await browser.getTabs()).toMatchObject([{ id: 7, groupId: 8, splitViewId: 0 }]);
    const listener = vi.fn();
    browser.subscribe(listener);
    api.tabs.onUpdated.addListener.mock.calls[0][0](7, { splitViewId: 0 });
    expect(listener).toHaveBeenCalledExactlyOnceWith('tabs');
  });
  it.each([
    { sourceIndex: 0, targetIndex: 3, moveIndex: 3 },
    { sourceIndex: 4, targetIndex: 1, moveIndex: 2 },
    { sourceIndex: 0, targetIndex: 1, moveIndex: 1 },
  ])('離れたタブを対象の右隣へ移動し、再取得してから分割する: $sourceIndex → $targetIndex', async ({ sourceIndex, targetIndex, moveIndex }) => {
    const api = makeApi();
    const source = { id: 7, windowId: 42, index: sourceIndex, pinned: false, groupId: 3, splitViewId: -1 };
    const target = { ...source, id: 8, index: targetIndex };
    api.tabs.query.mockResolvedValueOnce([source, target] as never)
      .mockResolvedValueOnce([{ ...source, index: moveIndex }, { ...target, index: moveIndex - 1 }] as never);
    await new ChromeAdapter(api as unknown as typeof chrome).splitTabs(7, 8);
    expect(api.tabs.move).toHaveBeenCalledExactlyOnceWith(7, { index: moveIndex, windowId: 42 });
    expect(api.tabs.query).toHaveBeenCalledTimes(2);
    expect(api.tabs.createSplit).toHaveBeenCalledExactlyOnceWith([8, 7]);
    expect(api.tabs.update).toHaveBeenCalledExactlyOnceWith(8, { active: true });
    expect(api.tabs.createSplit.mock.invocationCallOrder[0]).toBeGreaterThan(api.tabs.move.mock.invocationCallOrder[0]);
  });
  it('既に対象の右隣なら移動せず、そのまま分割する', async () => {
    const api = makeApi();
    api.tabs.query.mockResolvedValueOnce([
      { id: 7, windowId: 42, index: 1, pinned: true, groupId: -1 },
      { id: 8, windowId: 42, index: 0, pinned: true, groupId: -1 },
    ] as never);
    await new ChromeAdapter(api as unknown as typeof chrome).splitTabs(7, 8);
    expect(api.tabs.move).not.toHaveBeenCalled();
    expect(api.tabs.createSplit).toHaveBeenCalledExactlyOnceWith([8, 7]);
  });
  it.each([
    { name: '同じタブ', overrides: { id: 7 } },
    { name: '異なる固定状態', overrides: { pinned: true } },
    { name: '異なるグループ', overrides: { groupId: 3 } },
    { name: '分割済み', overrides: { splitViewId: 0 } },
    { name: '異なるウィンドウ', overrides: { windowId: 84 } },
    { name: '既に閉じられたタブ', overrides: { id: 99 } },
  ])('$nameの場合は移動も分割も実行しない', async ({ overrides }) => {
    const api = makeApi();
    const source = { id: 7, windowId: 42, index: 0, pinned: false, groupId: -1 };
    api.tabs.query.mockResolvedValueOnce([source, { ...source, id: 8, index: 1, ...overrides }] as never);
    await expect(new ChromeAdapter(api as unknown as typeof chrome).splitTabs(7, 8)).rejects.toThrow('分割できません');
    expect(api.tabs.move).not.toHaveBeenCalled();
    expect(api.tabs.createSplit).not.toHaveBeenCalled();
    expect(api.tabs.update).not.toHaveBeenCalled();
  });
  it('移動中にタブの固定状態や位置が変わったら分割しない', async () => {
    for (const changed of [{ index: 5 }, { pinned: true }, { splitViewId: 70 }]) {
      const api = makeApi();
      const source = { id: 7, windowId: 42, index: 3, pinned: false };
      const target = { ...source, id: 8, index: 0 };
      api.tabs.query.mockResolvedValueOnce([source, target] as never)
        .mockResolvedValueOnce([{ ...source, index: 1, ...changed }, target] as never);
      await expect(new ChromeAdapter(api as unknown as typeof chrome).splitTabs(7, 8)).rejects.toThrow();
      expect(api.tabs.createSplit).not.toHaveBeenCalled();
    }
  });
  it('解除時も最新の分割IDを使い、既に解除済みや閉じられたタブでは何もしない', async () => {
    const api = makeApi();
    const browser = new ChromeAdapter(api as unknown as typeof chrome);
    api.tabs.query.mockResolvedValueOnce([{ id: 7, windowId: 42, splitViewId: 0 }] as never)
      .mockResolvedValueOnce([{ id: 7, windowId: 42, splitViewId: -1 }] as never)
      .mockResolvedValueOnce([]);
    await browser.unsplitTab(7);
    await browser.unsplitTab(7);
    await browser.unsplitTab(7);
    expect(api.tabs.unsplit).toHaveBeenCalledExactlyOnceWith(0);
    expect(api.tabs.remove).not.toHaveBeenCalled();
  });
  it('古いChromeではAPIを呼ばず対応バージョンを通知する', async () => {
    const api = makeApi();
    Object.assign(api.tabs, { createSplit: undefined, unsplit: undefined });
    const browser = new ChromeAdapter(api as unknown as typeof chrome);
    await expect(browser.splitTabs(7, 8)).rejects.toThrow('Chrome 155');
    await expect(browser.unsplitTab(7)).rejects.toThrow('Chrome 155');
    expect(api.tabs.query).not.toHaveBeenCalled();
    expect(api.tabs.move).not.toHaveBeenCalled();
  });
  it.each([
    { change: { favIconUrl: 'https://example.com/favicon.ico' }, refreshIcons: true },
    { change: { status: 'complete' as const }, refreshIcons: true },
    { change: { status: 'loading' as const }, refreshIcons: false },
    { change: { title: '新しいタイトル' }, refreshIcons: false },
    { change: { audible: true }, refreshIcons: false },
  ])('faviconの更新と読み込み完了時だけ、画像の再取得を通知する: $change', ({ change, refreshIcons }) => {
    const api = makeApi();
    const listener = vi.fn();
    const unsubscribe = new ChromeAdapter(api as unknown as typeof chrome).subscribe(listener);
    const callback = api.tabs.onUpdated.addListener.mock.calls[0][0] as (id: number, change: chrome.tabs.OnUpdatedInfo) => void;
    callback(7, change);
    expect(listener.mock.calls).toEqual(refreshIcons ? [['tabs'], ['favicons']] : [['tabs']]);
    unsubscribe();
    expect(api.tabs.onUpdated.removeListener).toHaveBeenCalledExactlyOnceWith(callback);
  });

  it('同じURLのタブがあれば現在のウィンドウ内で切り替え、URLや固定状態は変更しない', async () => {
    const api = makeApi();
    api.tabs.query.mockResolvedValueOnce([{ id: 7, url: 'https://react.dev/', active: false, pinned: true }] as never);
    await new ChromeAdapter(api as unknown as typeof chrome).openBookmark('https://react.dev/');
    expect(api.tabs.query).toHaveBeenCalledExactlyOnceWith({ windowId: 42 });
    expect(api.tabs.update).toHaveBeenCalledExactlyOnceWith(7, { active: true });
    expect(api.tabs.create).not.toHaveBeenCalled();
  });
  it('同じURLが複数あるときは現在のタブを優先し、再読み込みや切り替えを行わない', async () => {
    const api = makeApi();
    api.tabs.query.mockResolvedValueOnce([
      { id: 7, url: 'https://react.dev/', active: false },
      { id: 8, url: 'https://react.dev/', active: true },
    ] as never);
    await new ChromeAdapter(api as unknown as typeof chrome).openBookmark('https://react.dev/');
    expect(api.tabs.create).not.toHaveBeenCalled();
    expect(api.tabs.update).not.toHaveBeenCalled();
  });
  it('ブックマークから別ページへ移動済みなら、新しいタブを開く', async () => {
    const api = makeApi();
    api.tabs.query.mockResolvedValueOnce([{ id: 7, url: 'https://react.dev/learn', active: true }] as never);
    await new ChromeAdapter(api as unknown as typeof chrome).openBookmark('https://react.dev/');
    expect(api.tabs.create).toHaveBeenCalledExactlyOnceWith({ url: 'https://react.dev/', active: true, windowId: 42 });
    expect(api.tabs.update).not.toHaveBeenCalled();
  });
  it.each([
    { name: '別URLへ移動中', tab: { id: 7, url: 'https://react.dev/', pendingUrl: 'https://react.dev/learn', active: false }, reuse: false },
    { name: '同じURLへ移動中', tab: { id: 7, url: 'https://react.dev/learn', pendingUrl: 'https://react.dev/', active: false }, reuse: true },
    { name: '新しいタブで読み込み中', tab: { id: 7, pendingUrl: 'https://react.dev/', active: false }, reuse: true },
  ])('$nameの場合は遷移先URLで判断する', async ({ tab, reuse }) => {
    const api = makeApi();
    api.tabs.query.mockResolvedValueOnce([tab] as never);
    await new ChromeAdapter(api as unknown as typeof chrome).openBookmark('https://react.dev/');
    if (reuse) {
      expect(api.tabs.update).toHaveBeenCalledExactlyOnceWith(7, { active: true });
      expect(api.tabs.create).not.toHaveBeenCalled();
    } else {
      expect(api.tabs.create).toHaveBeenCalledExactlyOnceWith({ url: 'https://react.dev/', active: true, windowId: 42 });
      expect(api.tabs.update).not.toHaveBeenCalled();
    }
  });
  it.each(['https://example.com/page?q=2#section', 'https://example.com/page?q=1#other'])('クエリやフラグメントが異なるURLは再利用しない: %s', async (url) => {
    const api = makeApi();
    api.tabs.query.mockResolvedValueOnce([{ id: 7, url, active: false }] as never);
    await new ChromeAdapter(api as unknown as typeof chrome).openBookmark('https://example.com/page?q=1#section');
    expect(api.tabs.update).not.toHaveBeenCalled();
    expect(api.tabs.create).toHaveBeenCalledExactlyOnceWith({ url: 'https://example.com/page?q=1#section', active: true, windowId: 42 });
  });
  it('ホスト名・既定ポート・ルートの末尾スラッシュは標準URL形式で照合する', async () => {
    const api = makeApi();
    api.tabs.query.mockResolvedValueOnce([{ id: 7, url: 'https://example.com/', active: false }] as never);
    await new ChromeAdapter(api as unknown as typeof chrome).openBookmark('https://EXAMPLE.com:443');
    expect(api.tabs.update).toHaveBeenCalledExactlyOnceWith(7, { active: true });
    expect(api.tabs.create).not.toHaveBeenCalled();
  });
  it.each([true, false])('背景で開く場合はフォーカスを維持する（既存タブ: %s）', async (exists) => {
    const api = makeApi();
    api.tabs.query.mockResolvedValueOnce(exists ? [{ id: 7, url: 'https://react.dev/', active: false }] as never : []);
    await new ChromeAdapter(api as unknown as typeof chrome).openBookmark('https://react.dev/', false);
    expect(api.tabs.update).not.toHaveBeenCalled();
    if (exists) expect(api.tabs.create).not.toHaveBeenCalled();
    else expect(api.tabs.create).toHaveBeenCalledExactlyOnceWith({ url: 'https://react.dev/', active: false, windowId: 42 });
  });
  it('クリック時に再取得するため、表示後に別URLへ移動したタブは再利用しない', async () => {
    const api = makeApi();
    api.tabs.query.mockResolvedValueOnce([{ id: 7, url: 'https://react.dev/', active: false }] as never)
      .mockResolvedValueOnce([{ id: 7, url: 'https://react.dev/learn', active: false }] as never);
    const browser = new ChromeAdapter(api as unknown as typeof chrome);
    await browser.getTabs();
    await browser.openBookmark('https://react.dev/');
    expect(api.tabs.query).toHaveBeenCalledTimes(2);
    expect(api.tabs.create).toHaveBeenCalledExactlyOnceWith({ url: 'https://react.dev/', active: true, windowId: 42 });
    expect(api.tabs.update).not.toHaveBeenCalled();
  });
  it('新しいタブの操作では従来通り毎回作成し、既存URLを照合しない', async () => {
    const api = makeApi();
    const browser = new ChromeAdapter(api as unknown as typeof chrome);
    await browser.openUrl('chrome://newtab/');
    await browser.openUrl('chrome://newtab/');
    expect(api.tabs.query).not.toHaveBeenCalled();
    expect(api.tabs.create).toHaveBeenCalledTimes(2);
  });
  it('クリーンアップは現在のウィンドウの非アクティブなタブだけを固定タブも含めて閉じる', async () => {
    const api = makeApi();
    const tabs = [
      { id: 7, windowId: 42, index: 0, active: true },
      { id: 8, windowId: 42, index: 1, active: false, pinned: true },
      { id: 9, windowId: 42, index: 2, active: false },
      { id: 99, windowId: 84, index: 0, active: true },
      { id: 100, windowId: 84, index: 1, active: false },
    ];
    api.tabs.query.mockImplementation(async ({ windowId }: { windowId?: number }) => tabs.filter((tab) => tab.windowId === windowId));
    const browser = new ChromeAdapter(api as unknown as typeof chrome);
    await browser.closeOtherTabs();
    expect(api.tabs.query).toHaveBeenCalledExactlyOnceWith({ windowId: 42 });
    expect(api.tabs.remove).toHaveBeenCalledExactlyOnceWith([8, 9]);
    expect(api.tabs.update).not.toHaveBeenCalled();
  });
  it('クリーンアップ確定時に再取得し、その時点のアクティブな固定タブを残す', async () => {
    const api = makeApi();
    api.tabs.query.mockResolvedValueOnce([
      { id: 7, windowId: 42, index: 0, active: true },
      { id: 8, windowId: 42, index: 1, active: false, pinned: true },
    ] as never).mockResolvedValueOnce([
      { id: 7, windowId: 42, index: 0, active: false },
      { id: 8, windowId: 42, index: 1, active: true, pinned: true },
    ] as never);
    const browser = new ChromeAdapter(api as unknown as typeof chrome);
    await browser.getTabs();
    await browser.closeOtherTabs();
    expect(api.tabs.query).toHaveBeenCalledTimes(2);
    expect(api.tabs.remove).toHaveBeenCalledExactlyOnceWith([7]);
  });
  it('アクティブなタブだけなら削除APIを呼ばない', async () => {
    const api = makeApi();
    api.tabs.query.mockResolvedValueOnce([{ id: 7, windowId: 42, active: true }] as never);
    await new ChromeAdapter(api as unknown as typeof chrome).closeOtherTabs();
    expect(api.tabs.remove).not.toHaveBeenCalled();
  });
  it.each([
    { name: 'タブなし', tabs: [] },
    { name: 'アクティブなタブなし', tabs: [{ id: 7, windowId: 42, active: false }] },
    { name: 'アクティブなタブのIDなし', tabs: [{ windowId: 42, active: true }, { id: 7, windowId: 42, active: false }] },
    { name: 'アクティブなタブが複数', tabs: [{ id: 7, windowId: 42, active: true }, { id: 8, windowId: 42, active: true }] },
  ])('$nameならクリーンアップで何も閉じない', async ({ tabs }) => {
    const api = makeApi();
    api.tabs.query.mockResolvedValueOnce(tabs as never);
    await expect(new ChromeAdapter(api as unknown as typeof chrome).closeOtherTabs()).rejects.toThrow('アクティブなタブを確認できませんでした');
    expect(api.tabs.remove).not.toHaveBeenCalled();
  });
  it('クリーンアップの取得・削除に失敗した場合は呼び出し元へ通知する', async () => {
    const api = makeApi();
    const browser = new ChromeAdapter(api as unknown as typeof chrome);
    api.tabs.query.mockRejectedValueOnce(new Error('取得失敗'));
    await expect(browser.closeOtherTabs()).rejects.toThrow('取得失敗');
    expect(api.tabs.remove).not.toHaveBeenCalled();
    api.tabs.query.mockResolvedValueOnce([{ id: 7, active: true }, { id: 8, active: false }] as never);
    api.tabs.remove.mockRejectedValueOnce(new Error('削除失敗'));
    await expect(browser.closeOtherTabs()).rejects.toThrow('削除失敗');
  });
  it('指定位置にタブのブックマークを追加し、元のタブは変更しない', async () => {
    const api = makeApi();
    const browser = new ChromeAdapter(api as unknown as typeof chrome);
    const input = { title: 'React', url: 'https://react.dev/', parentId: '10', index: 2 };
    await browser.createBookmark(input);
    expect(api.bookmarks.create).toHaveBeenCalledExactlyOnceWith(input);
    expect(api.tabs.remove).not.toHaveBeenCalled();
    expect(api.tabs.move).not.toHaveBeenCalled();
    expect(api.tabs.update).not.toHaveBeenCalled();
  });
  it('取得・新規作成・移動をサイドパネルのウィンドウに限定する', async () => {
    const api = makeApi();
    const browser = new ChromeAdapter(api as unknown as typeof chrome);
    await browser.getTabs();
    await browser.openUrl('https://example.com/', false);
    await browser.moveTab(7, 2);
    expect(api.tabs.query).toHaveBeenCalledWith({ windowId: 42 });
    expect(api.tabs.create).toHaveBeenCalledWith({ url: 'https://example.com/', active: false, windowId: 42 });
    expect(api.tabs.move).toHaveBeenCalledWith(7, { index: 2, windowId: 42 });
    expect(api.windows.getCurrent).toHaveBeenCalledTimes(1);
  });
  it('システムフォルダだけを読み取り専用にする', async () => {
    const api = makeApi();
    const browser = new ChromeAdapter(api as unknown as typeof chrome);
    const tree = await browser.getBookmarks();
    expect(tree[0].readOnly).toBe(true);
    expect(tree[0].children![0].readOnly).toBe(false);
  });
  it('ブックマークバーを特定できるようChromeのフォルダ種別を保持する', async () => {
    const api = makeApi();
    api.bookmarks.getTree.mockResolvedValueOnce([{ id: '0', children: [
      { id: '80', title: 'Bookmarks bar', parentId: '0', folderType: 'bookmarks-bar', children: [] },
      { id: '90', title: 'Other bookmarks', parentId: '0', folderType: 'other', children: [] },
    ] }] as never);
    const tree = await new ChromeAdapter(api as unknown as typeof chrome).getBookmarks();
    expect(tree.map((node) => node.folderType)).toEqual(['bookmarks-bar', 'other']);
  });
  it('フォルダ削除と単一ブックマーク削除を区別する', async () => {
    const api = makeApi();
    const browser = new ChromeAdapter(api as unknown as typeof chrome);
    await browser.deleteBookmark('11');
    api.bookmarks.get.mockResolvedValueOnce([{ id: '10', parentId: '1' }] as never);
    await browser.deleteBookmark('10');
    expect(api.bookmarks.remove).toHaveBeenCalledWith('11');
    expect(api.bookmarks.removeTree).toHaveBeenCalledWith('10');
  });
  it('リネームでは名前だけを更新し、URLや保存先を変更しない', async () => {
    const api = makeApi();
    const browser = new ChromeAdapter(api as unknown as typeof chrome);
    await browser.renameBookmark('11', '新しい名前');
    expect(api.bookmarks.update).toHaveBeenCalledExactlyOnceWith('11', { title: '新しい名前' });
    expect(api.bookmarks.get).not.toHaveBeenCalled();
    expect(api.bookmarks.move).not.toHaveBeenCalled();
  });
  it('DnDの並び順と保存先をChromeへ反映する', async () => {
    const api = makeApi();
    const browser = new ChromeAdapter(api as unknown as typeof chrome);
    await browser.moveBookmark('11', { parentId: '2', index: 3 });
    expect(api.bookmarks.move).toHaveBeenCalledExactlyOnceWith('11', { parentId: '2', index: 3 });
    expect(api.bookmarks.update).not.toHaveBeenCalled();
  });
  it('イベントの購読を解除する', () => {
    const api = makeApi();
    const browser = new ChromeAdapter(api as unknown as typeof chrome);
    const listener = vi.fn();
    const unsubscribe = browser.subscribe(listener);
    const callback = api.tabs.onCreated.addListener.mock.calls[0][0] as () => void;
    callback();
    expect(listener).toHaveBeenCalledWith('tabs');
    unsubscribe();
    expect(api.tabs.onCreated.removeListener).toHaveBeenCalledWith(callback);
  });
});
