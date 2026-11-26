import { beforeEach, describe, expect, it } from 'vitest';
import { DemoAdapter } from './demo-adapter';
import { findBookmark } from './bookmarks';

describe('操作プレビュー', () => {
  let browser: DemoAdapter;
  let memory: Map<string, string>;
  beforeEach(() => {
    memory = new Map();
    browser = new DemoAdapter({ getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => { memory.set(key, value); } });
  });
  it('ブックマークを右側に分割して開き、元のブックマークとタブを維持して保存する', async () => {
    const original = await browser.getTabs();
    const bookmarks = await browser.getBookmarks();
    await browser.openBookmarkInSplit('https://example.com/new', 102);
    const tabs = await browser.getTabs();
    const target = tabs.find((tab) => tab.id === 102)!;
    const source = tabs.find((tab) => tab.url === 'https://example.com/new')!;
    expect(tabs).toHaveLength(original.length + 1);
    expect(source.index).toBe(target.index + 1);
    expect(source.splitViewId).toBe(target.splitViewId);
    expect(source.active).toBe(true);
    expect(source.pinned).toBe(target.pinned);
    expect(await browser.getBookmarks()).toEqual(bookmarks);
    const reloaded = new DemoAdapter({ getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => { memory.set(key, value); } });
    expect(await reloaded.getTabs()).toEqual(tabs);
  });
  it('分割できる同一URLタブを再利用し、分割済みのタブや不正URLでは追加しない', async () => {
    const original = await browser.getTabs();
    await browser.openBookmarkInSplit('https://react.dev/', 102);
    const tabs = await browser.getTabs();
    expect(tabs).toHaveLength(original.length);
    expect(tabs.find((tab) => tab.id === 103)?.active).toBe(true);
    expect(tabs.find((tab) => tab.id === 103)?.splitViewId).toBe(tabs.find((tab) => tab.id === 102)?.splitViewId);
    await expect(browser.openBookmarkInSplit('https://example.com/', 102)).rejects.toThrow('未分割');
    await expect(browser.openBookmarkInSplit('javascript:alert(1)', 104)).rejects.toThrow('URL');
    expect(await browser.getTabs()).toEqual(tabs);
  });
  it('分割ではタブを隣接させて同じ分割IDを保存し、どちらのタブからも解除できる', async () => {
    await browser.splitTabs(105, 102);
    const tabs = await browser.getTabs();
    const target = tabs.find((tab) => tab.id === 102)!;
    const source = tabs.find((tab) => tab.id === 105)!;
    expect(target.active).toBe(true);
    expect(source.index).toBe(target.index + 1);
    expect(source.splitViewId).toBe(target.splitViewId);
    expect(source.splitViewId).toBeGreaterThanOrEqual(0);
    const reloaded = new DemoAdapter({ getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => { memory.set(key, value); } });
    expect(await reloaded.getTabs()).toEqual(tabs);
    await reloaded.unsplitTab(105);
    expect(await reloaded.getTabs()).toEqual(tabs.map((tab) => {
      const unsplit = { ...tab };
      delete unsplit.splitViewId;
      return unsplit;
    }));
    await expect(browser.splitTabs(103, 102)).rejects.toThrow();
  });
  it('分割できないタブでは順番や固定状態を変更しない', async () => {
    const original = await browser.getTabs();
    await expect(browser.splitTabs(100, 102)).rejects.toThrow();
    await expect(browser.splitTabs(102, 102)).rejects.toThrow();
    expect(await browser.getTabs()).toEqual(original);
  });
  it.each(['close', 'cleanup', 'pin'] as const)('分割タブの%s操作で相方の分割状態を残さない', async (action) => {
    await browser.splitTabs(105, 102);
    if (action === 'close') await browser.closeTab(105);
    else if (action === 'cleanup') await browser.closeOtherTabs();
    else await browser.pinTab(105, true);
    expect((await browser.getTabs()).every((tab) => tab.splitViewId === undefined)).toBe(true);
  });
  it('同じURLの既存タブに切り替え、順番・URL・固定状態とタブ数を維持する', async () => {
    const original = await browser.getTabs();
    await browser.openBookmark('https://github.com/');
    const tabs = await browser.getTabs();
    expect(tabs).toEqual(original.map((tab) => ({ ...tab, active: tab.id === 100 })));
    await browser.openBookmark('https://github.com/');
    expect(await browser.getTabs()).toEqual(tabs);
  });
  it('URLが一致するタブがなければ新しく開き、その後はそのタブを使う', async () => {
    const original = await browser.getTabs();
    await browser.openBookmark('https://github.com/issues');
    const tabs = await browser.getTabs();
    expect(tabs).toHaveLength(original.length + 1);
    expect(tabs.at(-1)).toMatchObject({ url: 'https://github.com/issues', active: true });
    expect(tabs.find((tab) => tab.id === 100)?.url).toBe('https://github.com/');
    await browser.openBookmark('https://github.com/issues');
    expect(await browser.getTabs()).toEqual(tabs);
  });
  it('背景で開く場合は一致するタブを増やさず、未表示URLだけを背景に追加する', async () => {
    const original = await browser.getTabs();
    await browser.openBookmark('https://github.com/', false);
    expect(await browser.getTabs()).toEqual(original);
    await browser.openBookmark('https://example.com/', false);
    const tabs = await browser.getTabs();
    expect(tabs).toHaveLength(original.length + 1);
    expect(tabs.find((tab) => tab.active)?.id).toBe(102);
    expect(tabs.at(-1)).toMatchObject({ url: 'https://example.com/', active: false });
  });
  it('クリーンアップは現在のタブを残して保存し、ブックマークと表示設定を維持する', async () => {
    const bookmarks = await browser.getBookmarks();
    const preferences = await browser.getPreferences();
    const active = (await browser.getTabs()).find((tab) => tab.active)!;
    await browser.closeOtherTabs();
    const reloaded = new DemoAdapter({ getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => { memory.set(key, value); } });
    expect(await reloaded.getTabs()).toEqual([{ ...active, index: 0 }]);
    expect(await reloaded.getBookmarks()).toEqual(bookmarks);
    expect(await reloaded.getPreferences()).toEqual(preferences);
  });
  it('クリーンアップ時に固定タブがアクティブなら、その固定状態を維持して残す', async () => {
    await browser.activateTab(100);
    const active = (await browser.getTabs()).find((tab) => tab.id === 100)!;
    await browser.closeOtherTabs();
    await browser.closeOtherTabs();
    expect(await browser.getTabs()).toEqual([{ ...active, index: 0 }]);
    expect(active.pinned).toBe(true);
  });
  it('ブックマークを先頭・途中・空フォルダへ追加して保存し、タブを維持する', async () => {
    const tabs = await browser.getTabs();
    await browser.createBookmark({ title: '先頭', url: 'https://example.com/first', parentId: '1', index: 0 });
    await browser.createBookmark({ title: '途中', url: 'https://example.com/middle', parentId: '1', index: 2 });
    await browser.createBookmark({ title: '空へ', url: 'chrome://settings/', parentId: '2', index: 0 });
    const reloaded = new DemoAdapter({ getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => { memory.set(key, value); } });
    const tree = await reloaded.getBookmarks();
    expect(tree[0].children!.map((node) => node.title)).toEqual(['先頭', 'GitHub', '途中', 'Notion', 'Figma', 'インスピレーション']);
    expect(tree[1].children![0]).toMatchObject({ title: '空へ', url: 'chrome://settings/', parentId: '2' });
    expect(tree[0].children![0]).not.toHaveProperty('index');
    expect(await reloaded.getTabs()).toEqual(tabs);
  });
  it('追加位置が無効なら既存のデータを変更しない', async () => {
    const original = await browser.getBookmarks();
    for (const index of [-1, 5, 0.5]) {
      await expect(browser.createBookmark({ title: '無効', url: 'https://example.com/', parentId: '1', index })).rejects.toThrow();
    }
    expect(await browser.getBookmarks()).toEqual(original);
  });
  it('フォルダの作成・移動・再読込・削除が反映される', async () => {
    await browser.createBookmark({ title: '新フォルダ', parentId: '1' });
    const folder = (await browser.getBookmarks())[0].children!.find((node) => node.title === '新フォルダ')!;
    await browser.updateBookmark('11', { title: 'GitHub updated', url: 'https://github.com/', parentId: folder.id });
    expect(findBookmark(await browser.getBookmarks(), '11')?.parentId).toBe(folder.id);
    const reloaded = new DemoAdapter({ getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => { memory.set(key, value); } });
    expect(findBookmark(await reloaded.getBookmarks(), '11')?.title).toBe('GitHub updated');
    await browser.deleteBookmark(folder.id);
    expect(findBookmark(await browser.getBookmarks(), '11')).toBeUndefined();
  });
  it('ブックマークとフォルダのリネームを保存し、内容と保存先を維持する', async () => {
    const original = await browser.getBookmarks();
    await browser.renameBookmark('11', 'GitHubの新しい名前');
    await browser.renameBookmark('14', 'フォルダの新しい名前');
    const reloaded = new DemoAdapter({ getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => { memory.set(key, value); } });
    const renamed = await reloaded.getBookmarks();
    expect(findBookmark(renamed, '11')).toEqual({ ...findBookmark(original, '11'), title: 'GitHubの新しい名前' });
    expect(findBookmark(renamed, '14')).toEqual({ ...findBookmark(original, '14'), title: 'フォルダの新しい名前' });
    await expect(browser.renameBookmark('1', '変更不可')).rejects.toThrow();
    await expect(browser.renameBookmark('missing', '変更不可')).rejects.toThrow();
  });
  it('システムフォルダの削除とフォルダの循環移動を拒否する', async () => {
    await expect(browser.deleteBookmark('1')).rejects.toThrow();
    await expect(browser.updateBookmark('14', { title: 'cycle', parentId: '14' })).rejects.toThrow();
  });
  it('Chromeと同じ挿入位置で、同じフォルダ内を前後に並び替える', async () => {
    await browser.moveBookmark('11', { parentId: '1', index: 4 });
    expect((await browser.getBookmarks())[0].children!.map((node) => node.id)).toEqual(['12', '13', '14', '11']);
    await browser.moveBookmark('14', { parentId: '1', index: 0 });
    expect((await browser.getBookmarks())[0].children!.map((node) => node.id)).toEqual(['14', '12', '13', '11']);
    await browser.moveBookmark('14', { parentId: '1', index: 1 });
    expect((await browser.getBookmarks())[0].children!.map((node) => node.id)).toEqual(['14', '12', '13', '11']);
  });
  it('フォルダを子要素ごと移動し、再読み込み後も階層と順番を維持する', async () => {
    const original = findBookmark(await browser.getBookmarks(), '14')!;
    await browser.moveBookmark('14', { parentId: '2', index: 0 });
    await browser.moveBookmark('11', { parentId: '14', index: 1 });
    const reloaded = new DemoAdapter({ getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => { memory.set(key, value); } });
    const tree = await reloaded.getBookmarks();
    const folder = findBookmark(tree, '14')!;
    expect(folder.parentId).toBe('2');
    expect(folder.children!.map((node) => node.id)).toEqual(['141', '11', '142']);
    expect(findBookmark(tree, '141')).toEqual(original.children![0]);
    expect(findBookmark(tree, '11')?.url).toBe('https://github.com/');
    expect(findBookmark(tree, '11')?.parentId).toBe('14');
  });
  it('循環移動・システムフォルダ・無効な位置ではデータを変更しない', async () => {
    const original = await browser.getBookmarks();
    await expect(browser.moveBookmark('14', { parentId: '14', index: 0 })).rejects.toThrow();
    await expect(browser.moveBookmark('1', { parentId: '2', index: 0 })).rejects.toThrow();
    await expect(browser.moveBookmark('11', { parentId: '2', index: 5 })).rejects.toThrow();
    await expect(browser.moveBookmark('11', { parentId: '2', index: -1 })).rejects.toThrow();
    await expect(browser.moveBookmark('11', { parentId: '2', index: 0.5 })).rejects.toThrow();
    expect(await browser.getBookmarks()).toEqual(original);
  });
  it('固定切り替えと並び替えの後もタブのindexが連続する', async () => {
    await browser.pinTab(104, true);
    let tabs = await browser.getTabs();
    expect(tabs.slice(0, 3).every((tab) => tab.pinned)).toBe(true);
    await browser.moveTab(104, 0);
    tabs = await browser.getTabs();
    expect(tabs[0].id).toBe(104);
    expect(tabs.map((tab) => tab.index)).toEqual(tabs.map((_, index) => index));
  });
  it('アクティブタブを閉じると隣のタブを選ぶ', async () => {
    await browser.closeTab(102);
    const tabs = await browser.getTabs();
    expect(tabs.filter((tab) => tab.active)).toHaveLength(1);
    expect(tabs.find((tab) => tab.active)?.id).toBe(103);
  });
  it('背景で開いたタブへ切り替えない', async () => {
    await browser.openUrl('https://example.com/', false);
    expect((await browser.getTabs()).find((tab) => tab.active)?.id).toBe(102);
  });
});
