// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import App from './App';
import { TooltipProvider } from '@/components/ui/tooltip';
import { BOOKMARK_DRAG_TYPE, TAB_DRAG_TYPE } from '@/lib/bookmark-drag';
import type { BookmarkNode, TabItem } from '@/types';
import { requestLauncher } from '@/lib/launcher-window';

vi.mock('@/lib/launcher-window', () => ({ requestLauncher: vi.fn().mockResolvedValue(undefined) }));

const { adapter, data } = vi.hoisted(() => ({
  adapter: {
    isDemo: false,
    supportsSplitView: true,
    createBookmark: vi.fn().mockResolvedValue(undefined),
    updateBookmark: vi.fn().mockResolvedValue(undefined),
    renameBookmark: vi.fn().mockResolvedValue(undefined),
    moveBookmark: vi.fn().mockResolvedValue(undefined),
    deleteBookmark: vi.fn().mockResolvedValue(undefined),
    moveTab: vi.fn().mockResolvedValue(undefined),
    splitTabs: vi.fn().mockResolvedValue(undefined),
    unsplitTab: vi.fn().mockResolvedValue(undefined),
    closeTab: vi.fn().mockResolvedValue(undefined),
    closeOtherTabs: vi.fn().mockResolvedValue(undefined),
    activateTab: vi.fn().mockResolvedValue(undefined),
    openBookmark: vi.fn().mockResolvedValue(undefined),
    openBookmarkInSplit: vi.fn().mockResolvedValue(undefined),
    openUrl: vi.fn().mockResolvedValue(undefined),
  },
  data: {
    bookmarks: [{ id: '1', title: 'ブックマーク バー', readOnly: true, children: [
      { id: '10', title: '仕事', parentId: '1', children: [
        { id: '11', title: 'React', url: 'https://react.dev/', parentId: '10' },
        { id: '12', title: '資料', parentId: '10', children: [
          { id: '13', title: 'Vite', url: 'https://vite.dev/', parentId: '12' },
        ] },
      ] },
    ] },
      { id: '2', title: 'その他のブックマーク', readOnly: true, children: [
        { id: '21', title: '非表示の資料', url: 'https://hidden.example.com/', parentId: '2' },
      ] },
      { id: '3', title: 'モバイルのブックマーク', readOnly: true, children: [
        { id: '31', title: 'モバイル専用', url: 'https://mobile.example.com/', parentId: '3' },
      ] },
    ] as BookmarkNode[],
    tabs: [
      { id: 100, windowId: 1, index: 0, title: 'Vite ガイド', url: 'https://vite.dev/guide/', active: true, pinned: false, audible: false, muted: false },
      { id: 101, windowId: 1, index: 1, title: 'React タブ', url: 'https://react.dev/', active: false, pinned: false, audible: false, muted: false },
      { id: 102, windowId: 1, index: 2, title: '固定タブ', url: 'chrome://settings/', active: false, pinned: true, audible: false, muted: false },
      { id: 103, windowId: 1, index: 3, title: '読み込み中', url: '', active: false, pinned: false, audible: false, muted: false },
      { id: 104, windowId: 1, index: 4, title: '開発者ツール', url: 'devtools://devtools/bundled/inspector.html', active: false, pinned: false, audible: false, muted: false },
    ] as TabItem[],
    preferences: { expandedFolders: ['1', '10'], bookmarksCollapsed: false, tabsCollapsed: false },
    updatePreferences: vi.fn(),
    loading: false,
    error: null,
    retry: vi.fn(),
  },
}));

vi.mock('@/lib/browser', () => ({ browser: adapter }));
vi.mock('@/hooks/use-browser', () => ({ useBrowser: () => data }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  HTMLElement.prototype.hasPointerCapture ??= () => false;
  HTMLElement.prototype.setPointerCapture ??= () => {};
  HTMLElement.prototype.releasePointerCapture ??= () => {};
  HTMLElement.prototype.scrollIntoView ??= () => {};
});

function bookmarkRow(id: string) {
  return document.querySelector<HTMLElement>(`[data-bookmark-id="${id}"]`)!;
}

function tabRow(id: number) {
  return document.querySelector<HTMLElement>(`[data-tab-id="${id}"]`)!;
}

function bookmarkBarDropTarget() {
  return document.querySelector<HTMLElement>('[data-bookmark-bar-drop-target]')!;
}

function dragTransfer() {
  const values = new Map<string, string>();
  return {
    clearData: () => { values.clear(); },
    setData: (type: string, value: string) => { values.set(type, value); },
    getData: (type: string) => values.get(type) ?? '',
    setDragImage: vi.fn(),
    effectAllowed: 'none',
    dropEffect: 'none',
  };
}

function dragAt(type: 'dragOver' | 'drop', target: HTMLElement, dataTransfer: ReturnType<typeof dragTransfer>, offset = 16) {
  vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({ top: 100, left: 0, bottom: 132, right: 300, width: 300, height: 32, x: 0, y: 100, toJSON: () => ({}) });
  const event = new MouseEvent(type === 'dragOver' ? 'dragover' : 'drop', { bubbles: true, cancelable: true, clientX: 100, clientY: 100 + offset });
  Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });
  fireEvent(target, event);
}

describe('ブックマークバーの表示', () => {
  it('サイドバーのCommand+Kや検索ボタンから全体検索を開く', async () => {
    const user = userEvent.setup();
    render(<TooltipProvider><App /></TooltipProvider>);
    await user.keyboard('{Meta>}k{/Meta}');
    expect(requestLauncher).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'すべてのブックマークとタブを検索' }));
    expect(requestLauncher).toHaveBeenCalledTimes(2);
  });
  it('バーの開閉設定にかかわらず中身をセクション直下に表示し、他のルートを表示しない', () => {
    const original = data.preferences.expandedFolders;
    try {
      data.preferences.expandedFolders = ['10'];
      render(<TooltipProvider><App /></TooltipProvider>);
      expect(bookmarkRow('1')).toBeNull();
      expect(bookmarkRow('2')).toBeNull();
      expect(bookmarkRow('21')).toBeNull();
      expect(bookmarkRow('3')).toBeNull();
      expect(bookmarkRow('31')).toBeNull();
      expect(bookmarkRow('10')).toHaveStyle({ paddingLeft: '0px' });
      expect(screen.getByRole('link', { name: 'React' })).toBeVisible();
      expect(bookmarkRow('11')).toHaveStyle({ paddingLeft: '20px' });
    } finally { data.preferences.expandedFolders = original; }
  });

  it('その他・モバイルにあるブックマークは検索でも表示しない', async () => {
    const user = userEvent.setup();
    render(<TooltipProvider><App /></TooltipProvider>);
    await user.type(screen.getByRole('searchbox'), 'hidden.example');
    expect(screen.getByText('一致するブックマークがありません')).toBeVisible();
    expect(bookmarkRow('21')).toBeNull();
  });

  it.each(['ブックマークを追加', 'フォルダを追加'])('%sの保存先はバー直下が初期値で、バー内のフォルダだけを選べる', async (name) => {
    const user = userEvent.setup();
    render(<TooltipProvider><App /></TooltipProvider>);
    await user.click(screen.getByRole('button', { name }));
    const destination = screen.getByRole('combobox', { name: '保存先' });
    expect(destination).toHaveTextContent('ブックマーク バー');
    await user.click(destination);
    expect(screen.queryByRole('option', { name: /その他|モバイル/ })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'ブックマーク バー / 仕事' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    if (name === 'フォルダを追加') await user.type(screen.getByRole('textbox', { name: '名前' }), '新規フォルダ');
    await user.click(screen.getByRole('button', { name: '追加する' }));
    await waitFor(() => { expect(adapter.createBookmark).toHaveBeenCalledWith(expect.objectContaining({ parentId: '1' })); });
  });

  it('空のブックマークバーにもタブをドロップして追加できる', async () => {
    const original = data.bookmarks;
    try {
      data.bookmarks = original.map((node) => node.id === '1' ? { ...node, children: [] } : node);
      render(<TooltipProvider><App /></TooltipProvider>);
      const transfer = dragTransfer();
      fireEvent.dragStart(tabRow(100), { dataTransfer: transfer });
      dragAt('drop', screen.getByText('ブックマークがありません'), transfer);
      await waitFor(() => { expect(adapter.createBookmark).toHaveBeenCalledExactlyOnceWith({ title: 'Vite ガイド', url: 'https://vite.dev/guide/', parentId: '1', index: 0 }); });
    } finally { data.bookmarks = original; }
  });
});

describe('ブックマークのドラッグ＆ドロップ', () => {
  it('フォルダの中央へドロップすると、中の末尾へ移動してフォルダを展開する', async () => {
    render(<TooltipProvider><App /></TooltipProvider>);
    const transfer = dragTransfer();
    fireEvent.dragStart(bookmarkRow('11'), { dataTransfer: transfer });
    dragAt('dragOver', bookmarkRow('12'), transfer);
    expect(bookmarkRow('12')).toHaveAttribute('data-bookmark-drop-position', 'inside');
    dragAt('drop', bookmarkRow('12'), transfer);
    await waitFor(() => { expect(adapter.moveBookmark).toHaveBeenCalledExactlyOnceWith('11', { parentId: '12', index: 1 }); });
    expect(data.updatePreferences).toHaveBeenCalledWith({ expandedFolders: ['1', '10', '12'] });
    expect(bookmarkRow('12')).not.toHaveAttribute('data-bookmark-drop-position');
    expect(adapter.updateBookmark).not.toHaveBeenCalled();
  });

  it('項目の上下端は同じ階層への並び替えとして扱う', async () => {
    render(<TooltipProvider><App /></TooltipProvider>);
    const transfer = dragTransfer();
    fireEvent.dragStart(bookmarkRow('11'), { dataTransfer: transfer });
    dragAt('dragOver', bookmarkRow('12'), transfer, 31);
    expect(bookmarkRow('12')).toHaveAttribute('data-bookmark-drop-position', 'after');
    dragAt('drop', bookmarkRow('12'), transfer, 31);
    await waitFor(() => { expect(adapter.moveBookmark).toHaveBeenCalledExactlyOnceWith('11', { parentId: '10', index: 2 }); });
  });

  it('自分の子孫へは移動できない', () => {
    render(<TooltipProvider><App /></TooltipProvider>);
    const transfer = dragTransfer();
    fireEvent.dragStart(bookmarkRow('10'), { dataTransfer: transfer });
    dragAt('dragOver', bookmarkRow('12'), transfer);
    expect(transfer.dropEffect).toBe('none');
    expect(bookmarkRow('12')).not.toHaveAttribute('data-bookmark-drop-position');
    dragAt('drop', bookmarkRow('12'), transfer);
    expect(adapter.moveBookmark).not.toHaveBeenCalled();
  });

  it.each(['before', 'end'])('入れ子の項目をバー直下へ戻せる: %s', async (position) => {
    render(<TooltipProvider><App /></TooltipProvider>);
    const transfer = dragTransfer();
    fireEvent.dragStart(bookmarkRow('11'), { dataTransfer: transfer });
    dragAt('drop', position === 'before' ? bookmarkRow('10') : bookmarkBarDropTarget(), transfer, 1);
    await waitFor(() => { expect(adapter.moveBookmark).toHaveBeenCalledExactlyOnceWith('11', { parentId: '1', index: position === 'before' ? 0 : 1 }); });
  });

  it('ドラッグ中止や外部からのドロップではデータを変更しない', () => {
    render(<TooltipProvider><App /></TooltipProvider>);
    const transfer = dragTransfer();
    transfer.setData('text/uri-list', 'https://example.com/');
    dragAt('drop', bookmarkRow('12'), transfer);
    fireEvent.dragStart(bookmarkRow('11'), { dataTransfer: transfer });
    dragAt('dragOver', bookmarkRow('12'), transfer);
    fireEvent.dragEnd(bookmarkRow('11'));
    expect(bookmarkRow('12')).not.toHaveAttribute('data-bookmark-drop-position');
    dragAt('drop', bookmarkRow('12'), transfer);
    expect(adapter.moveBookmark).not.toHaveBeenCalled();
  });

  it('閉じたフォルダへしばらく重ねると自動で展開する', async () => {
    render(<TooltipProvider><App /></TooltipProvider>);
    const transfer = dragTransfer();
    fireEvent.dragStart(bookmarkRow('11'), { dataTransfer: transfer });
    dragAt('dragOver', bookmarkRow('12'), transfer);
    await waitFor(() => { expect(data.updatePreferences).toHaveBeenCalledWith({ expandedFolders: ['1', '10', '12'] }); });
    expect(adapter.moveBookmark).not.toHaveBeenCalled();
    fireEvent.dragEnd(bookmarkRow('11'));
  });

  it('保存中は重複移動を防ぎ、保存失敗後は再試行できる', async () => {
    let rejectMove!: (reason: Error) => void;
    adapter.moveBookmark.mockImplementationOnce(() => new Promise<void>((_, reject) => { rejectMove = reject; }));
    render(<TooltipProvider><App /></TooltipProvider>);
    const transfer = dragTransfer();
    fireEvent.dragStart(bookmarkRow('11'), { dataTransfer: transfer });
    dragAt('drop', bookmarkRow('12'), transfer);
    expect(bookmarkRow('11').closest('li')).toHaveAttribute('aria-busy', 'true');
    expect(bookmarkRow('12')).toHaveAttribute('draggable', 'false');
    rejectMove(new Error('移動に失敗しました'));
    await waitFor(() => { expect(bookmarkRow('11')).toHaveAttribute('draggable', 'true'); });
    fireEvent.dragStart(bookmarkRow('11'), { dataTransfer: transfer });
    dragAt('drop', bookmarkRow('12'), transfer);
    await waitFor(() => { expect(adapter.moveBookmark).toHaveBeenCalledTimes(2); });
    expect(adapter.moveBookmark).toHaveBeenLastCalledWith('11', { parentId: '12', index: 1 });
  });
});

describe('タブからブックマークへのドラッグ＆ドロップ', () => {
  it.each([
    { target: '11', offset: 1, parentId: '10', index: 0 },
    { target: '11', offset: 31, parentId: '10', index: 1 },
    { target: '12', offset: 16, parentId: '12', index: 1 },
  ])('タブを$targetの指定位置へコピーする: $offset', async ({ target, offset, parentId, index }) => {
    render(<TooltipProvider><App /></TooltipProvider>);
    const transfer = dragTransfer();
    fireEvent.dragStart(tabRow(100), { dataTransfer: transfer });
    expect(transfer.effectAllowed).toBe('copyMove');
    dragAt('dragOver', bookmarkRow(target), transfer, offset);
    expect(transfer.dropEffect).toBe('copy');
    dragAt('drop', bookmarkRow(target), transfer, offset);
    fireEvent.dragEnd(tabRow(100));
    await waitFor(() => { expect(adapter.createBookmark).toHaveBeenCalledExactlyOnceWith({ title: 'Vite ガイド', url: 'https://vite.dev/guide/', parentId, index }); });
    expect(adapter.moveBookmark).not.toHaveBeenCalled();
    expect(adapter.moveTab).not.toHaveBeenCalled();
    expect(adapter.closeTab).not.toHaveBeenCalled();
    expect(adapter.activateTab).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith('ブックマークに追加しました');
  });

  it('固定済みのChrome内部ページも見出しへのドロップでバー直下へ追加できる', async () => {
    render(<TooltipProvider><App /></TooltipProvider>);
    const transfer = dragTransfer();
    fireEvent.dragStart(tabRow(102), { dataTransfer: transfer });
    dragAt('drop', document.querySelector<HTMLElement>('#bookmarks-heading')!, transfer);
    fireEvent.dragEnd(tabRow(102));
    await waitFor(() => { expect(adapter.createBookmark).toHaveBeenCalledExactlyOnceWith({ title: '固定タブ', url: 'chrome://settings/', parentId: '1', index: 1 }); });
    expect(adapter.moveTab).not.toHaveBeenCalled();
  });

  it('検索中も非表示の兄弟を含む本来の末尾へ追加する', async () => {
    const user = userEvent.setup();
    render(<TooltipProvider><App /></TooltipProvider>);
    await user.type(screen.getByRole('searchbox'), 'React');
    expect(document.querySelector('[data-bookmark-id="12"]')).toBeNull();
    const transfer = dragTransfer();
    fireEvent.dragStart(tabRow(101), { dataTransfer: transfer });
    dragAt('drop', bookmarkRow('10'), transfer);
    fireEvent.dragEnd(tabRow(101));
    await waitFor(() => { expect(adapter.createBookmark).toHaveBeenCalledExactlyOnceWith({ title: 'React タブ', url: 'https://react.dev/', parentId: '10', index: 2 }); });
  });

  it('中止・不一致のデータ・外部からのドロップでは追加しない', () => {
    render(<TooltipProvider><App /></TooltipProvider>);
    const transfer = dragTransfer();
    fireEvent.dragStart(tabRow(100), { dataTransfer: transfer });
    dragAt('dragOver', bookmarkRow('12'), transfer);
    fireEvent.dragEnd(tabRow(100));
    expect(bookmarkRow('12')).not.toHaveAttribute('data-bookmark-drop-position');
    dragAt('drop', bookmarkRow('12'), transfer);
    fireEvent.dragStart(tabRow(100), { dataTransfer: transfer });
    transfer.setData(TAB_DRAG_TYPE, '101');
    dragAt('drop', bookmarkRow('12'), transfer);
    fireEvent.dragEnd(tabRow(100));
    transfer.setData(TAB_DRAG_TYPE, '100');
    dragAt('drop', bookmarkRow('12'), transfer);
    expect(adapter.createBookmark).not.toHaveBeenCalled();
  });

  it.each([103, 104])('URLを保存できないタブは追加しない: %s', (id) => {
    render(<TooltipProvider><App /></TooltipProvider>);
    const transfer = dragTransfer();
    fireEvent.dragStart(tabRow(id), { dataTransfer: transfer });
    dragAt('dragOver', bookmarkRow('12'), transfer);
    expect(transfer.dropEffect).toBe('none');
    expect(bookmarkRow('12')).not.toHaveAttribute('data-bookmark-drop-position');
    dragAt('drop', bookmarkRow('12'), transfer);
    fireEvent.dragEnd(tabRow(id));
    expect(adapter.createBookmark).not.toHaveBeenCalled();
  });

  it('保存中の重複追加を防ぎ、失敗時に通知して再試行できる', async () => {
    let rejectCreate!: (reason: Error) => void;
    adapter.createBookmark.mockImplementationOnce(() => new Promise<void>((_, reject) => { rejectCreate = reject; }));
    render(<TooltipProvider><App /></TooltipProvider>);
    const transfer = dragTransfer();
    fireEvent.dragStart(tabRow(100), { dataTransfer: transfer });
    dragAt('drop', bookmarkRow('12'), transfer);
    fireEvent.dragEnd(tabRow(100));
    expect(tabRow(100)).toHaveAttribute('aria-busy', 'true');
    expect(tabRow(100)).toHaveAttribute('draggable', 'false');
    fireEvent.dragStart(tabRow(101), { dataTransfer: transfer });
    dragAt('drop', bookmarkRow('12'), transfer);
    fireEvent.dragEnd(tabRow(101));
    expect(adapter.createBookmark).toHaveBeenCalledTimes(1);
    rejectCreate(new Error('追加に失敗しました'));
    await waitFor(() => { expect(tabRow(100)).toHaveAttribute('draggable', 'true'); });
    expect(toast.error).toHaveBeenCalledWith('追加に失敗しました');
    fireEvent.dragStart(tabRow(100), { dataTransfer: transfer });
    dragAt('drop', bookmarkRow('12'), transfer);
    fireEvent.dragEnd(tabRow(100));
    await waitFor(() => { expect(adapter.createBookmark).toHaveBeenCalledTimes(2); });
  });

  it('タブ同士のドロップは従来通り並び替え、ブックマークを追加しない', async () => {
    render(<TooltipProvider><App /></TooltipProvider>);
    const transfer = dragTransfer();
    fireEvent.dragStart(tabRow(100), { dataTransfer: transfer });
    fireEvent.dragOver(tabRow(101), { dataTransfer: transfer });
    expect(transfer.dropEffect).toBe('move');
    fireEvent.drop(tabRow(101), { dataTransfer: transfer });
    await waitFor(() => { expect(adapter.moveTab).toHaveBeenCalledExactlyOnceWith(100, 1); });
    expect(adapter.createBookmark).not.toHaveBeenCalled();
  });

  it.each(['固定タブ', 'ブックマーク'])('共通スクロール領域でも%sを通常タブの並び替え先として受け付けない', (source) => {
    render(<TooltipProvider><App /></TooltipProvider>);
    const transfer = dragTransfer();
    fireEvent.dragStart(source === '固定タブ' ? tabRow(102) : bookmarkRow('11'), { dataTransfer: transfer });
    fireEvent.dragOver(tabRow(101), { dataTransfer: transfer });
    expect(transfer.dropEffect).toBe('none');
    fireEvent.drop(tabRow(101), { dataTransfer: transfer });
    expect(adapter.moveTab).not.toHaveBeenCalled();
    expect(adapter.moveBookmark).not.toHaveBeenCalled();
    expect(adapter.createBookmark).not.toHaveBeenCalled();
  });
});
afterEach(cleanup);

describe('タブのSplit View', () => {
  it('ブックマークをタブの中央へ重ねるとコピーの表示で分割し、ブックマークを変更しない', async () => {
    render(<TooltipProvider><App /></TooltipProvider>);
    const transfer = dragTransfer();
    fireEvent.dragStart(bookmarkRow('11'), { dataTransfer: transfer });
    expect(transfer.effectAllowed).toBe('copyMove');
    dragAt('dragOver', tabRow(100), transfer);
    expect(transfer.dropEffect).toBe('copy');
    expect(tabRow(100)).toHaveAttribute('data-tab-drop-position', 'split');
    expect(screen.getByText('離してSplit Viewで表示')).toBeInTheDocument();
    dragAt('drop', tabRow(100), transfer);
    await waitFor(() => { expect(adapter.openBookmarkInSplit).toHaveBeenCalledExactlyOnceWith('https://react.dev/', 100); });
    expect(adapter.moveBookmark).not.toHaveBeenCalled();
    expect(adapter.updateBookmark).not.toHaveBeenCalled();
    expect(adapter.deleteBookmark).not.toHaveBeenCalled();
    expect(adapter.moveTab).not.toHaveBeenCalled();
    expect(adapter.splitTabs).not.toHaveBeenCalled();
  });
  it.each([1, 31])('ブックマークをタブの上下端に落としても何もしない（offset=%s）', (offset) => {
    render(<TooltipProvider><App /></TooltipProvider>);
    const transfer = dragTransfer();
    fireEvent.dragStart(bookmarkRow('11'), { dataTransfer: transfer });
    dragAt('dragOver', tabRow(100), transfer, offset);
    expect(transfer.dropEffect).toBe('none');
    dragAt('drop', tabRow(100), transfer, offset);
    expect(adapter.openBookmarkInSplit).not.toHaveBeenCalled();
    expect(adapter.moveTab).not.toHaveBeenCalled();
  });
  it('フォルダーや分割済みのタブは受け付けず、古いChromeでは新しいタブも作らない', () => {
    const original = data.tabs;
    try {
      data.tabs = original.map((tab) => ({ ...tab, ...(tab.id === 101 ? { splitViewId: 0 } : {}) }));
      const { rerender } = render(<TooltipProvider><App /></TooltipProvider>);
      const transfer = dragTransfer();
      fireEvent.dragStart(bookmarkRow('10'), { dataTransfer: transfer });
      dragAt('drop', tabRow(100), transfer);
      fireEvent.dragStart(bookmarkRow('11'), { dataTransfer: transfer });
      dragAt('drop', tabRow(101), transfer);
      adapter.supportsSplitView = false;
      rerender(<TooltipProvider><App /></TooltipProvider>);
      fireEvent.dragStart(bookmarkRow('11'), { dataTransfer: transfer });
      dragAt('drop', tabRow(100), transfer);
      expect(adapter.openBookmarkInSplit).not.toHaveBeenCalled();
      expect(adapter.openBookmark).not.toHaveBeenCalled();
      expect(adapter.openUrl).not.toHaveBeenCalled();
    } finally { data.tabs = original; adapter.supportsSplitView = true; }
  });
  it('ブックマークのドラッグを中止したら分割表示の予告を消し、不正なドラッグデータでは開かない', () => {
    render(<TooltipProvider><App /></TooltipProvider>);
    const transfer = dragTransfer();
    fireEvent.dragStart(bookmarkRow('11'), { dataTransfer: transfer });
    dragAt('dragOver', tabRow(100), transfer);
    fireEvent.dragEnd(bookmarkRow('11'));
    expect(tabRow(100)).not.toHaveAttribute('data-tab-drop-position');
    dragAt('drop', tabRow(100), transfer);
    fireEvent.dragStart(bookmarkRow('11'), { dataTransfer: transfer });
    transfer.setData(BOOKMARK_DRAG_TYPE, '13');
    dragAt('drop', tabRow(100), transfer);
    expect(adapter.openBookmarkInSplit).not.toHaveBeenCalled();
  });
  it('ブックマークからの分割中は二重操作を防ぎ、エラー後は再試行できる', async () => {
    let rejectSplit!: (reason: unknown) => void;
    adapter.openBookmarkInSplit.mockImplementationOnce(() => new Promise<void>((_, reject) => { rejectSplit = reject; }));
    render(<TooltipProvider><App /></TooltipProvider>);
    const transfer = dragTransfer();
    fireEvent.dragStart(bookmarkRow('11'), { dataTransfer: transfer });
    dragAt('drop', tabRow(100), transfer);
    expect(tabRow(100)).toHaveAttribute('aria-busy', 'true');
    expect(bookmarkRow('11')).toHaveAttribute('draggable', 'false');
    fireEvent.dragStart(bookmarkRow('11'), { dataTransfer: transfer });
    dragAt('drop', tabRow(101), transfer);
    expect(adapter.openBookmarkInSplit).toHaveBeenCalledTimes(1);
    rejectSplit(new Error('分割して開けませんでした'));
    await waitFor(() => { expect(bookmarkRow('11')).toHaveAttribute('draggable', 'true'); });
    expect(toast.error).toHaveBeenCalledWith('分割して開けませんでした');
    fireEvent.dragStart(bookmarkRow('11'), { dataTransfer: transfer });
    dragAt('drop', tabRow(100), transfer);
    await waitFor(() => { expect(adapter.openBookmarkInSplit).toHaveBeenCalledTimes(2); });
  });
  it('タブの中央へ重ねると分割し、ブックマーク追加や並び替えを実行しない', async () => {
    render(<TooltipProvider><App /></TooltipProvider>);
    const transfer = dragTransfer();
    fireEvent.dragStart(tabRow(100), { dataTransfer: transfer });
    dragAt('dragOver', tabRow(101), transfer);
    expect(tabRow(101)).toHaveAttribute('data-tab-drop-position', 'split');
    expect(screen.getByText('離してSplit Viewで表示')).toBeInTheDocument();
    expect(transfer.dropEffect).toBe('move');
    dragAt('drop', tabRow(101), transfer);
    await waitFor(() => { expect(adapter.splitTabs).toHaveBeenCalledExactlyOnceWith(100, 101); });
    expect(adapter.moveTab).not.toHaveBeenCalled();
    expect(adapter.createBookmark).not.toHaveBeenCalled();
    expect(tabRow(101)).not.toHaveAttribute('data-tab-drop-position');
  });
  it.each([{ offset: 1, position: 'before', index: 0 }, { offset: 31, position: 'after', index: 1 }])('上端・下端では分割せず並び替える: $position', async ({ offset, position, index }) => {
    render(<TooltipProvider><App /></TooltipProvider>);
    const transfer = dragTransfer();
    fireEvent.dragStart(tabRow(100), { dataTransfer: transfer });
    dragAt('dragOver', tabRow(101), transfer, offset);
    expect(tabRow(101)).toHaveAttribute('data-tab-drop-position', position);
    dragAt('drop', tabRow(101), transfer, offset);
    await waitFor(() => { expect(adapter.moveTab).toHaveBeenCalledExactlyOnceWith(100, index); });
    expect(adapter.splitTabs).not.toHaveBeenCalled();
  });
  it.each([
    { name: '分割済みの移動先', source: {}, target: { splitViewId: 0 } },
    { name: '分割済みの移動元', source: { splitViewId: 7 }, target: {} },
    { name: '別グループ', source: { groupId: 3 }, target: { groupId: 5 } },
    { name: '別ウィンドウ', source: {}, target: { windowId: 2 } },
  ])('$nameへの中央ドロップはタブを変更しない', ({ source, target }) => {
    const original = data.tabs;
    try {
      data.tabs = original.map((tab) => ({ ...tab, ...(tab.id === 100 ? source : tab.id === 101 ? target : {}) }));
      render(<TooltipProvider><App /></TooltipProvider>);
      const transfer = dragTransfer();
      fireEvent.dragStart(tabRow(100), { dataTransfer: transfer });
      dragAt('dragOver', tabRow(101), transfer);
      expect(transfer.dropEffect).toBe('none');
      expect(tabRow(101)).not.toHaveAttribute('data-tab-drop-position');
      dragAt('drop', tabRow(101), transfer);
      expect(adapter.splitTabs).not.toHaveBeenCalled();
      expect(adapter.moveTab).not.toHaveBeenCalled();
    } finally { data.tabs = original; }
  });
  it('中止したドラッグ、不正なデータ、自分自身へのドロップでは分割しない', () => {
    render(<TooltipProvider><App /></TooltipProvider>);
    const transfer = dragTransfer();
    fireEvent.dragStart(tabRow(100), { dataTransfer: transfer });
    dragAt('drop', tabRow(100), transfer);
    fireEvent.dragStart(tabRow(100), { dataTransfer: transfer });
    fireEvent.dragEnd(tabRow(100));
    dragAt('drop', tabRow(101), transfer);
    fireEvent.dragStart(tabRow(100), { dataTransfer: transfer });
    transfer.setData(TAB_DRAG_TYPE, '101');
    dragAt('drop', tabRow(101), transfer);
    expect(adapter.splitTabs).not.toHaveBeenCalled();
    expect(adapter.moveTab).not.toHaveBeenCalled();
  });
  it('未対応のChromeでは中央でも並び替えを維持する', async () => {
    try {
      adapter.supportsSplitView = false;
      render(<TooltipProvider><App /></TooltipProvider>);
      const transfer = dragTransfer();
      fireEvent.dragStart(tabRow(100), { dataTransfer: transfer });
      dragAt('drop', tabRow(101), transfer);
      await waitFor(() => { expect(adapter.moveTab).toHaveBeenCalledExactlyOnceWith(100, 1); });
      expect(adapter.splitTabs).not.toHaveBeenCalled();
    } finally { adapter.supportsSplitView = true; }
  });
  it('分割済みのどちらのタブでも右クリックから解除でき、通常タブには解除を表示しない', async () => {
    const original = data.tabs;
    const user = userEvent.setup();
    try {
      data.tabs = original.map((tab) => ({ ...tab, ...(tab.id === 100 || tab.id === 101 ? { splitViewId: 0 } : {}) }));
      render(<TooltipProvider><App /></TooltipProvider>);
      const group = screen.getByRole('group', { name: 'Split View: Vite ガイド / React タブ' });
      expect(group.querySelectorAll('[data-tab-id]')).toHaveLength(2);
      expect(tabRow(100).parentElement).toBe(group);
      expect(tabRow(101).parentElement).toBe(group);
      for (const id of [100, 101]) {
        fireEvent.contextMenu(tabRow(id), { clientX: 100, clientY: 100 });
        await user.click(await screen.findByRole('menuitem', { name: 'Split Viewを解除' }));
        await waitFor(() => { expect(adapter.unsplitTab).toHaveBeenLastCalledWith(id); });
        await waitFor(() => { expect(tabRow(id)).not.toHaveAttribute('aria-busy'); });
      }
      expect(adapter.unsplitTab).toHaveBeenCalledTimes(2);
      fireEvent.contextMenu(tabRow(103), { clientX: 100, clientY: 100 });
      expect(screen.queryByRole('menuitem', { name: 'Split Viewを解除' })).not.toBeInTheDocument();
      expect(adapter.closeTab).not.toHaveBeenCalled();
    } finally { data.tabs = original; }
  });
  it('横並びの各タブを個別に切り替え、片方だけが検索に一致してもペアで表示する', async () => {
    const original = data.tabs;
    const user = userEvent.setup();
    try {
      data.tabs = original.map((tab) => ({ ...tab, ...(tab.id === 100 || tab.id === 101 ? { splitViewId: 0 } : {}) }));
      render(<TooltipProvider><App /></TooltipProvider>);
      expect(document.querySelectorAll('[data-split-view-group]')).toHaveLength(1);
      expect(tabRow(100).tagName).toBe('DIV');
      expect(tabRow(101).tagName).toBe('DIV');
      await user.click(tabRow(101).querySelector<HTMLButtonElement>('[data-tab-activate]')!);
      expect(adapter.activateTab).toHaveBeenLastCalledWith(101);
      await user.click(tabRow(100).querySelector<HTMLButtonElement>('[data-tab-activate]')!);
      expect(adapter.activateTab).toHaveBeenLastCalledWith(100);
      await user.type(screen.getByRole('searchbox'), 'Vite ガイド');
      expect(screen.getByRole('group', { name: 'Split View: Vite ガイド / React タブ' })).toBeInTheDocument();
      expect(tabRow(101)).toBeInTheDocument();
      expect(tabRow(103)).toBeNull();
      await user.clear(screen.getByRole('searchbox'));
      await user.type(screen.getByRole('searchbox'), '一致しない検索語');
      expect(document.querySelector('[data-split-view-group]')).toBeNull();
    } finally { data.tabs = original; }
  });
  it('解除すると横並びの枠を外して通常の2行に戻す', () => {
    const original = data.tabs;
    try {
      data.tabs = original.map((tab) => ({ ...tab, ...(tab.id === 100 || tab.id === 101 ? { splitViewId: 0 } : {}) }));
      const { rerender } = render(<TooltipProvider><App /></TooltipProvider>);
      expect(document.querySelectorAll('[data-split-view-group]')).toHaveLength(1);
      data.tabs = original;
      rerender(<TooltipProvider><App /></TooltipProvider>);
      expect(document.querySelector('[data-split-view-group]')).toBeNull();
      expect(tabRow(100).tagName).toBe('LI');
      expect(tabRow(101).tagName).toBe('LI');
    } finally { data.tabs = original; }
  });
  it('分割処理中の二重操作を防ぎ、失敗後は通知して再試行できる', async () => {
    let rejectSplit!: (reason: unknown) => void;
    adapter.splitTabs.mockImplementationOnce(() => new Promise<void>((_, reject) => { rejectSplit = reject; }));
    render(<TooltipProvider><App /></TooltipProvider>);
    const transfer = dragTransfer();
    fireEvent.dragStart(tabRow(100), { dataTransfer: transfer });
    dragAt('drop', tabRow(101), transfer);
    expect(tabRow(100)).toHaveAttribute('aria-busy', 'true');
    expect(tabRow(101)).toHaveAttribute('aria-busy', 'true');
    expect(tabRow(103)).toHaveAttribute('draggable', 'false');
    fireEvent.dragStart(tabRow(103), { dataTransfer: transfer });
    dragAt('drop', tabRow(101), transfer);
    expect(adapter.splitTabs).toHaveBeenCalledTimes(1);
    rejectSplit(new Error('分割失敗'));
    await waitFor(() => { expect(tabRow(100)).toHaveAttribute('draggable', 'true'); });
    expect(toast.error).toHaveBeenCalledWith('分割失敗');
    fireEvent.dragStart(tabRow(100), { dataTransfer: transfer });
    dragAt('drop', tabRow(101), transfer);
    await waitFor(() => { expect(adapter.splitTabs).toHaveBeenCalledTimes(2); });
  });
});

describe('ブックマークを開く', () => {
  it.each([
    { name: '通常クリック', event: 'click', options: {}, active: true },
    { name: 'Commandクリック', event: 'click', options: { metaKey: true }, active: false },
    { name: 'Controlクリック', event: 'click', options: { ctrlKey: true }, active: false },
    { name: '中クリック', event: 'auxclick', options: { button: 1 }, active: false },
  ])('$nameでは既存URLを照合する経路を使う', async ({ event, options, active }) => {
    render(<TooltipProvider><App /></TooltipProvider>);
    const link = screen.getByRole('link', { name: 'React' });
    fireEvent(link, new MouseEvent(event, { ...options, bubbles: true, cancelable: true }));
    await waitFor(() => { expect(adapter.openBookmark).toHaveBeenCalledExactlyOnceWith('https://react.dev/', active); });
    expect(adapter.openUrl).not.toHaveBeenCalled();
  });

  it('新しいタブのプラスボタンは毎回新規作成する経路を使う', async () => {
    const user = userEvent.setup();
    render(<TooltipProvider><App /></TooltipProvider>);
    await user.click(screen.getByRole('button', { name: '新しいタブを開く' }));
    expect(adapter.openUrl).toHaveBeenCalledExactlyOnceWith('chrome://newtab/');
    expect(adapter.openBookmark).not.toHaveBeenCalled();
  });
});

describe('タブのクリーンアップ', () => {
  it.each(['キャンセル', 'Escape'])('確認後に%sで中止するとタブを閉じず、アイコンへフォーカスを戻す', async (action) => {
    const user = userEvent.setup();
    render(<TooltipProvider><App /></TooltipProvider>);
    const trigger = screen.getByRole('button', { name: 'タブをクリーンアップ' });
    await user.click(trigger);
    const confirmation = screen.getByRole('region', { name: 'ほかのタブを閉じますか？' });
    expect(confirmation).toHaveTextContent('ほかの4件');
    expect(confirmation).toHaveTextContent('固定済みタブも対象');
    expect(screen.getByRole('button', { name: 'キャンセル' })).toHaveFocus();
    expect(adapter.closeOtherTabs).not.toHaveBeenCalled();
    if (action === 'Escape') await user.keyboard('{Escape}');
    else await user.click(screen.getByRole('button', { name: 'キャンセル' }));
    expect(confirmation).not.toBeInTheDocument();
    expect(adapter.closeOtherTabs).not.toHaveBeenCalled();
    expect(trigger).toHaveFocus();
  });

  it('検索で非表示のタブも件数に含め、確定したときだけクリーンアップする', async () => {
    const user = userEvent.setup();
    render(<TooltipProvider><App /></TooltipProvider>);
    await user.type(screen.getByRole('searchbox'), 'React');
    expect(document.querySelector('[data-tab-id="100"]')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'タブをクリーンアップ' }));
    expect(screen.getByRole('region', { name: 'ほかのタブを閉じますか？' })).toHaveTextContent('ほかの4件');
    expect(adapter.closeOtherTabs).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '閉じる' }));
    await waitFor(() => { expect(screen.queryByRole('region', { name: 'ほかのタブを閉じますか？' })).not.toBeInTheDocument(); });
    expect(adapter.closeOtherTabs).toHaveBeenCalledExactlyOnceWith();
    expect(adapter.closeTab).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith('ほかのタブを閉じました');
    expect(screen.getByRole('searchbox')).toHaveValue('React');
    expect(document.querySelector('#tabs-heading button')).toHaveFocus();
  });

  it('実行中は重複確定を防ぎ、失敗時は確認内にエラーを表示して再試行できる', async () => {
    let rejectCleanup!: (reason: Error) => void;
    adapter.closeOtherTabs.mockImplementationOnce(() => new Promise<void>((_, reject) => { rejectCleanup = reject; }));
    const user = userEvent.setup();
    render(<TooltipProvider><App /></TooltipProvider>);
    await user.click(screen.getByRole('button', { name: 'タブをクリーンアップ' }));
    const confirmation = screen.getByRole('region', { name: 'ほかのタブを閉じますか？' });
    await user.click(screen.getByRole('button', { name: '閉じる' }));
    expect(confirmation).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: 'キャンセル' })).toBeDisabled();
    const confirm = screen.getByRole('button', { name: '閉じています…' });
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    fireEvent.keyDown(confirmation, { key: 'Escape' });
    expect(adapter.closeOtherTabs).toHaveBeenCalledTimes(1);
    expect(confirmation).toBeInTheDocument();
    rejectCleanup(new Error('タブを閉じられませんでした'));
    expect(await screen.findByRole('alert')).toHaveTextContent('タブを閉じられませんでした');
    expect(screen.getByRole('button', { name: 'キャンセル' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: '閉じる' }));
    await waitFor(() => { expect(confirmation).not.toBeInTheDocument(); });
    expect(adapter.closeOtherTabs).toHaveBeenCalledTimes(2);
  });

  it('読み込み中・タブが1つだけ・アクティブなタブ不明の場合はクリーンアップできない', () => {
    const original = { tabs: data.tabs, loading: data.loading };
    try {
      for (const change of [
        { tabs: original.tabs, loading: true },
        { tabs: original.tabs.filter((tab) => tab.active), loading: false },
        { tabs: original.tabs.map((tab) => ({ ...tab, active: false })), loading: false },
      ]) {
        Object.assign(data, change);
        render(<TooltipProvider><App /></TooltipProvider>);
        const trigger = screen.getByRole('button', { name: 'タブをクリーンアップ' });
        expect(trigger).toBeDisabled();
        fireEvent.click(trigger);
        expect(screen.queryByRole('region', { name: 'ほかのタブを閉じますか？' })).not.toBeInTheDocument();
        cleanup();
      }
      expect(adapter.closeOtherTabs).not.toHaveBeenCalled();
    } finally { Object.assign(data, original); }
  });
});

describe('サイドバー内の編集と削除', () => {
  it.each([
    { role: 'link', name: 'React', id: '11', heading: 'ブックマークを編集' },
    { role: 'button', name: '仕事', id: '10', heading: 'フォルダを編集' },
  ])('$nameの名前を行内で変更し、既存の編集画面も使える', async ({ role, name, id, heading }) => {
    const user = userEvent.setup();
    render(<TooltipProvider><App /></TooltipProvider>);
    const row = screen.getByRole(role, { name });
    fireEvent.contextMenu(row, { clientX: 100, clientY: 100 });
    await user.click(await screen.findByRole('menuitem', { name: '名前を変更' }));
    const input = await screen.findByRole('textbox', { name: '名前を変更' });
    expect(input).toHaveFocus();
    expect(screen.getByRole('searchbox')).toBeInTheDocument();
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    await user.clear(input);
    await user.type(input, '新しい名前{Enter}');
    await waitFor(() => { expect(input).not.toBeInTheDocument(); });
    expect(adapter.renameBookmark).toHaveBeenCalledExactlyOnceWith(id, '新しい名前');
    expect(adapter.updateBookmark).not.toHaveBeenCalled();
    expect(data.updatePreferences).not.toHaveBeenCalled();
    const restored = screen.getByRole(role, { name });
    expect(restored).toHaveFocus();
    fireEvent.contextMenu(restored, { clientX: 100, clientY: 100 });
    await user.click(await screen.findByRole('menuitem', { name: '編集' }));
    expect(await screen.findByRole('form', { name: heading })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '名前' })).toHaveValue(name);
  });

  it('編集から戻ると、検索・スクロール位置・操作していた行を維持する', async () => {
    const user = userEvent.setup();
    render(<TooltipProvider><App /></TooltipProvider>);
    const search = screen.getByRole('searchbox');
    await user.type(search, 'React');
    const row = screen.getByRole('link', { name: 'React' });
    const viewport = row.closest<HTMLElement>('[data-slot="scroll-area-viewport"]')!;
    expect(tabRow(101).closest('[data-slot="scroll-area-viewport"]')).toBe(viewport);
    viewport.scrollTop = 64;
    fireEvent.contextMenu(row, { clientX: 100, clientY: 100 });
    await user.click(await screen.findByRole('menuitem', { name: '編集' }));
    expect(await screen.findByRole('form', { name: 'ブックマークを編集' })).toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(search.closest('[inert]')).not.toBeNull();
    await user.click(screen.getByRole('button', { name: '一覧に戻る' }));
    expect(screen.getByRole('searchbox')).toHaveValue('React');
    expect(screen.getByRole('link', { name: 'React' })).toBe(row);
    expect(viewport.scrollTop).toBe(64);
    await waitFor(() => { expect(row).toHaveFocus(); });
    expect(adapter.updateBookmark).not.toHaveBeenCalled();
  });

  it('検索中のフォルダ削除でも全件数を示し、キャンセルすると元の行へ戻る', async () => {
    const user = userEvent.setup();
    render(<TooltipProvider><App /></TooltipProvider>);
    await user.type(screen.getByRole('searchbox'), 'React');
    const folder = screen.getByRole('button', { name: '仕事' });
    fireEvent.contextMenu(folder, { clientX: 100, clientY: 100 });
    await user.click(await screen.findByRole('menuitem', { name: '削除' }));
    const confirmation = await screen.findByRole('region', { name: '「仕事」を削除しますか？' });
    expect(confirmation).toHaveTextContent('2件のブックマーク');
    expect(screen.getByRole('searchbox')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'キャンセル' }));
    expect(confirmation).not.toBeInTheDocument();
    expect(folder).toHaveFocus();
    expect(adapter.deleteBookmark).not.toHaveBeenCalled();
  });
});
