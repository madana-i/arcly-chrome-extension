// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BookmarkNameInput } from './bookmark-name-input';

afterEach(cleanup);

describe('行内で名前を変更', () => {
  it('現在の名前を全選択し、Escapeで変更を保存せずに戻る', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(<BookmarkNameInput title="元の名前" onSave={onSave} onClose={onClose} />);
    const input = screen.getByRole('textbox', { name: '名前を変更' }) as HTMLInputElement;
    expect(input).toHaveFocus();
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 4]);
    await user.type(input, '未保存');
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledExactlyOnceWith(true);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('日本語の変換確定では保存せず、Enterで前後の空白を除いて保存する', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(<BookmarkNameInput title="元の名前" onSave={onSave} onClose={onClose} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '  新しい名前  ' } });
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 });
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => { expect(onClose).toHaveBeenCalledExactlyOnceWith(true); });
    expect(onSave).toHaveBeenCalledExactlyOnceWith('新しい名前');
  });

  it('空白だけの名前を保存せず、その場で入力を続けられる', async () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(<BookmarkNameInput title="元の名前" onSave={onSave} onClose={onClose} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '  ' } });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    expect(screen.getByRole('alert')).toHaveTextContent('名前を入力してください');
    expect(screen.getByRole('textbox')).toHaveFocus();
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('保存中の二重送信とキャンセルを防ぎ、失敗しても入力を残して再試行できる', async () => {
    let fail!: (reason: Error) => void;
    const onSave = vi.fn().mockReturnValueOnce(new Promise<void>((_resolve, reject) => { fail = reject; })).mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(<BookmarkNameInput title="元の名前" onSave={onSave} onClose={onClose} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '新しい名前' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.keyDown(input, { key: 'Escape' });
    fireEvent.blur(input);
    expect(onSave).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
    expect(input).toHaveAttribute('readonly');
    fail(new Error('保存に失敗しました'));
    expect(await screen.findByRole('alert')).toHaveTextContent('保存に失敗しました');
    expect(input).toHaveValue('新しい名前');
    expect(input).not.toHaveAttribute('readonly');
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => { expect(onClose).toHaveBeenCalledExactlyOnceWith(true); });
    expect(onSave).toHaveBeenCalledTimes(2);
  });

  it('フォーカスが外れた場合は、他の操作のフォーカスを奪わずにキャンセルする', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(<><BookmarkNameInput title="元の名前" onSave={onSave} onClose={onClose} /><button>別の操作</button></>);
    await user.click(screen.getByRole('button', { name: '別の操作' }));
    expect(onClose).toHaveBeenCalledExactlyOnceWith(false);
    expect(screen.getByRole('button')).toHaveFocus();
    expect(onSave).not.toHaveBeenCalled();
  });
});
