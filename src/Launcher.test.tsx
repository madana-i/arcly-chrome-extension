// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import Launcher from './Launcher';
import type { LauncherAdapter, LauncherData } from '@/lib/launcher-search';

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  HTMLElement.prototype.scrollIntoView ??= () => {};
});
afterEach(cleanup);

const data: LauncherData = {
  sourceWindowId: 10,
  tabs: [
    { id: 1, windowId: 10, title: 'GitHub', url: 'https://github.com/', active: true },
    { id: 2, windowId: 20, title: 'React ガイド', url: 'https://react.dev/learn', active: false },
  ],
  bookmarks: [{ id: '2', title: 'その他のブックマーク', children: [{ id: '21', title: 'AWS', url: 'https://aws.amazon.com/' }] }],
};
function setup() {
  const unsubscribe = vi.fn();
  const adapter = { load: vi.fn().mockResolvedValue(data), open: vi.fn().mockResolvedValue(undefined), subscribe: vi.fn().mockReturnValue(unsubscribe) } satisfies LauncherAdapter;
  const onClose = vi.fn();
  return { adapter, onClose, unsubscribe };
}

describe('arclyの検索ランチャー', () => {
  it('表示直後に入力でき、上下キーとEnterで別ウィンドウのタブを選べる', async () => {
    const user = userEvent.setup();
    const { adapter, onClose } = setup();
    render(<Launcher adapter={adapter} onClose={onClose} />);
    const input = screen.getByRole('combobox');
    expect(input).toHaveFocus();
    await screen.findByRole('option', { name: /GitHub/ });
    await user.keyboard('{ArrowDown}{Enter}');
    await waitFor(() => { expect(onClose).toHaveBeenCalledOnce(); });
    expect(adapter.open).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ kind: 'tab', tabId: 2, windowId: 20 }));
  });
  it('入力すると検索結果と選択位置を更新し、ブックマークをクリックして開ける', async () => {
    const user = userEvent.setup();
    const { adapter, onClose } = setup();
    render(<Launcher adapter={adapter} onClose={onClose} />);
    await screen.findByRole('option', { name: /GitHub/ });
    await user.keyboard('{ArrowDown}');
    await user.type(screen.getByRole('combobox'), 'aws');
    const option = screen.getByRole('option', { name: /AWS/ });
    expect(option).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByRole('option')).toHaveLength(1);
    await user.click(option);
    await waitFor(() => { expect(onClose).toHaveBeenCalledOnce(); });
    expect(adapter.open).toHaveBeenCalledWith(expect.objectContaining({ kind: 'bookmark', url: 'https://aws.amazon.com/' }));
  });
  it('検索結果がないときにEnterを押しても開かず、Escapeで閉じられる', async () => {
    const user = userEvent.setup();
    const { adapter, onClose } = setup();
    render(<Launcher adapter={adapter} onClose={onClose} />);
    await user.type(screen.getByRole('combobox'), '見つからない');
    expect(await screen.findByText('一致する項目がありません')).toBeVisible();
    await user.keyboard('{Enter}');
    expect(adapter.open).not.toHaveBeenCalled();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });
  it('日本語入力の変換確定や変換中のEscapeでは開閉しない', async () => {
    const { adapter, onClose } = setup();
    render(<Launcher adapter={adapter} onClose={onClose} />);
    await screen.findByRole('option', { name: /GitHub/ });
    const input = screen.getByRole('combobox');
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 });
    fireEvent.keyDown(input, { key: 'Escape', isComposing: true });
    expect(adapter.open).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
  it('開く処理が完了するまで重複実行と終了を防ぐ', async () => {
    const { adapter, onClose } = setup();
    let complete!: () => void;
    adapter.open.mockImplementationOnce(() => new Promise<void>((resolve) => { complete = resolve; }));
    render(<Launcher adapter={adapter} onClose={onClose} />);
    const option = await screen.findByRole('option', { name: /GitHub/ });
    fireEvent.click(option); fireEvent.click(option);
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' });
    expect(adapter.open).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    complete();
    await waitFor(() => { expect(onClose).toHaveBeenCalledOnce(); });
  });
  it('開く処理が失敗したら検索を残し、再試行できる', async () => {
    const user = userEvent.setup();
    const { adapter, onClose } = setup();
    adapter.open.mockRejectedValueOnce(new Error('タブが閉じられました'));
    render(<Launcher adapter={adapter} onClose={onClose} />);
    await screen.findByRole('option', { name: /GitHub/ });
    await user.type(screen.getByRole('combobox'), 'GitHub{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('タブが閉じられました');
    expect(screen.getByRole('combobox')).toHaveValue('GitHub');
    expect(screen.getByRole('combobox')).toHaveFocus();
    expect(onClose).not.toHaveBeenCalled();
    await user.keyboard('{Enter}');
    await waitFor(() => { expect(onClose).toHaveBeenCalledOnce(); });
    expect(adapter.open).toHaveBeenCalledTimes(2);
  });
  it('読み込みに失敗しても再読み込みでき、終了時には購読を解除する', async () => {
    const user = userEvent.setup();
    const { adapter, onClose, unsubscribe } = setup();
    adapter.load.mockRejectedValueOnce(new Error('取得失敗'));
    const { unmount } = render(<Launcher adapter={adapter} onClose={onClose} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('取得失敗');
    await user.click(screen.getByRole('button', { name: '再読み込み' }));
    expect(await screen.findByRole('option', { name: /GitHub/ })).toBeVisible();
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(2);
  });
});
