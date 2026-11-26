// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BookmarkEditor } from './bookmark-editor';
import { BookmarkDeleteConfirmation } from './bookmark-delete-confirmation';
import type { BookmarkNode } from '@/types';

const folder: BookmarkNode = { id: '10', title: '仕事', parentId: '1', children: [
  { id: '11', title: 'React', url: 'https://react.dev/', parentId: '10' },
  { id: '12', title: '資料', parentId: '10', children: [{ id: '13', title: 'Vite', url: 'https://vite.dev/', parentId: '12' }] },
] };
const bookmarks: BookmarkNode[] = [
  { id: '1', title: 'ブックマーク バー', readOnly: true, children: [folder] },
  { id: '2', title: 'その他のブックマーク', readOnly: true, children: [] },
];

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  HTMLElement.prototype.hasPointerCapture ??= () => false;
  HTMLElement.prototype.setPointerCapture ??= () => {};
  HTMLElement.prototype.releasePointerCapture ??= () => {};
  HTMLElement.prototype.scrollIntoView ??= () => {};
});
afterEach(cleanup);

describe('shadcnのブックマーク編集画面', () => {
  it('戻る操作では保存せずに一覧へ戻る', async () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(<BookmarkEditor editor={{ kind: 'bookmark' }} bookmarks={bookmarks} onClose={onClose} onSave={onSave} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('form', { name: 'ブックマークを追加' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '一覧に戻る' }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('現在のタブを入力し、保存完了後にだけ閉じる', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(<BookmarkEditor editor={{ kind: 'bookmark' }} bookmarks={bookmarks} activeTab={{ id: 1, windowId: 1, index: 0, title: '検証ページ', url: 'https://example.com/', active: true, pinned: false, audible: false, muted: false }} onClose={onClose} onSave={onSave} />);
    await waitFor(() => { expect(screen.getByRole('textbox', { name: '名前' })).toHaveFocus(); });
    expect(screen.getByRole('textbox', { name: 'URL' })).toHaveValue('https://example.com/');
    await userEvent.click(screen.getByRole('button', { name: '追加する' }));
    await waitFor(() => { expect(onSave).toHaveBeenCalledWith({ title: '検証ページ', url: 'https://example.com/', parentId: '1' }, undefined); });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('不正なURLを保存せず、編集画面内にエラーを表示する', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(<BookmarkEditor editor={{ kind: 'bookmark' }} bookmarks={bookmarks} onClose={onClose} onSave={onSave} />);
    await user.type(screen.getByRole('textbox', { name: '名前' }), '危険なリンク');
    await user.type(screen.getByRole('textbox', { name: 'URL' }), 'javascript:alert(1)');
    await user.click(screen.getByRole('button', { name: '追加する' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('http:// または https://');
    expect(screen.getByRole('form')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('移動先のSelectから自身と子孫を除き、選んだフォルダへ保存する', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<BookmarkEditor editor={{ kind: 'folder', node: folder }} bookmarks={bookmarks} onClose={vi.fn()} onSave={onSave} />);
    await user.click(screen.getByRole('combobox', { name: '保存先' }));
    expect(screen.queryByRole('option', { name: '仕事' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /資料/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: 'その他のブックマーク' }));
    await user.click(screen.getByRole('button', { name: '保存する' }));
    await waitFor(() => { expect(onSave).toHaveBeenCalledWith({ title: '仕事', url: undefined, parentId: '2' }, '10'); });
  });

  it('保存先の選択中にEscapeを押しても、編集画面は閉じない', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<BookmarkEditor editor={{ kind: 'folder' }} bookmarks={bookmarks} onClose={onClose} onSave={vi.fn()} />);
    await user.click(screen.getByRole('combobox', { name: '保存先' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('サブフォルダの追加では、選択した親フォルダへ保存する', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<BookmarkEditor editor={{ kind: 'folder', parentId: '10' }} bookmarks={bookmarks} onClose={vi.fn()} onSave={onSave} />);
    expect(screen.queryByRole('textbox', { name: 'URL' })).not.toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: '名前' }), '新しい資料');
    await user.click(screen.getByRole('button', { name: '追加する' }));
    await waitFor(() => { expect(onSave).toHaveBeenCalledWith({ title: '新しい資料', url: undefined, parentId: '10' }, undefined); });
  });

  it('保存中の二重送信やキャンセルを防ぎ、失敗時も入力を残す', async () => {
    const user = userEvent.setup();
    let fail!: (reason: Error) => void;
    const onSave = vi.fn().mockReturnValue(new Promise<void>((_resolve, reject) => { fail = reject; }));
    const onClose = vi.fn();
    render(<BookmarkEditor editor={{ kind: 'folder', node: folder }} bookmarks={bookmarks} onClose={onClose} onSave={onSave} />);
    const name = screen.getByRole('textbox', { name: '名前' });
    await user.clear(name);
    await user.type(name, '更新後の名前');
    await user.click(screen.getByRole('button', { name: '保存する' }));
    expect(screen.getByRole('button', { name: '保存中…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'キャンセル' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '一覧に戻る' })).toBeDisabled();
    await user.keyboard('{Escape}{Control>}{Enter}{/Control}');
    expect(onSave).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
    fail(new Error('保存に失敗しました'));
    expect(await screen.findByRole('alert')).toHaveTextContent('保存に失敗しました');
    expect(name).toHaveValue('更新後の名前');
    expect(screen.getByRole('button', { name: '保存する' })).toBeEnabled();
  });
});

describe('shadcnの削除確認画面', () => {
  it('含まれる件数を示し、キャンセルで削除しない', async () => {
    const onDelete = vi.fn();
    const onCancel = vi.fn();
    render(<BookmarkDeleteConfirmation node={folder} onCancel={onCancel} onDelete={onDelete} />);
    expect(screen.getByRole('region')).toHaveTextContent('2件のブックマーク');
    await waitFor(() => { expect(screen.getByRole('button', { name: 'キャンセル' })).toHaveFocus(); });
    await userEvent.click(screen.getByRole('button', { name: 'キャンセル' }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('削除が失敗しても確認画面を閉じず、再試行できる', async () => {
    const onCancel = vi.fn();
    render(<BookmarkDeleteConfirmation node={folder} onCancel={onCancel} onDelete={vi.fn().mockRejectedValue(new Error('削除に失敗しました'))} />);
    await userEvent.click(screen.getByRole('button', { name: '削除する' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('削除に失敗しました');
    expect(screen.getByRole('region')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '削除する' })).toBeEnabled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('非同期の削除完了を待ち、その間は重複操作を防ぐ', async () => {
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => { finish = resolve; });
    const onDelete = vi.fn().mockReturnValue(pending);
    const onCancel = vi.fn();
    function DeleteHarness() {
      const [visible, setVisible] = useState(true);
      return visible ? <BookmarkDeleteConfirmation node={folder} onCancel={onCancel} onDelete={async (id) => { await onDelete(id); setVisible(false); }} /> : <p>削除完了</p>;
    }
    render(<DeleteHarness />);
    await userEvent.click(screen.getByRole('button', { name: '削除する' }));
    expect(onDelete).toHaveBeenCalledExactlyOnceWith('10');
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '削除中…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'キャンセル' })).toBeDisabled();
    finish();
    expect(await screen.findByText('削除完了')).toBeInTheDocument();
    expect(onCancel).not.toHaveBeenCalled();
  });
});
