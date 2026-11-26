// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChangeScope } from '../types';
import { DEFAULT_PREFERENCES } from '../lib/bookmarks';
import { useBrowser } from './use-browser';

const adapter = vi.hoisted(() => ({
  getBookmarks: vi.fn(), getTabs: vi.fn(), getPreferences: vi.fn(),
  savePreferences: vi.fn(), subscribe: vi.fn(),
}));
vi.mock('../lib/browser', () => ({ browser: adapter }));

let notify: (scope: ChangeScope) => void;
const unsubscribe = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  adapter.getBookmarks.mockResolvedValue([]);
  adapter.getTabs.mockResolvedValue([]);
  adapter.getPreferences.mockResolvedValue({ ...DEFAULT_PREFERENCES });
  adapter.savePreferences.mockResolvedValue(undefined);
  adapter.subscribe.mockImplementation((listener: typeof notify) => {
    notify = listener;
    return unsubscribe;
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('faviconの再取得', () => {
  it('更新通知のない初回表示でも一度だけ再取得し、その後は定期取得しない', async () => {
    const { result } = renderHook(useBrowser);
    await act(async () => {});
    act(() => { vi.advanceTimersByTime(999); });
    expect(result.current.faviconRevision).toBe(0);
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current.faviconRevision).toBe(1);
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(result.current.faviconRevision).toBe(1);
  });

  it('連続する画像更新通知をまとめ、ブックマークやタブの再取得とは別に画像を更新する', async () => {
    const { result } = renderHook(useBrowser);
    await act(async () => {});
    expect(result.current.loading).toBe(false);
    expect(result.current.faviconRevision).toBe(0);

    act(() => { notify('favicons'); vi.advanceTimersByTime(200); });
    act(() => { notify('favicons'); vi.advanceTimersByTime(249); });
    expect(result.current.faviconRevision).toBe(0);
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current.faviconRevision).toBe(1);
    expect(adapter.getBookmarks).toHaveBeenCalledTimes(1);
    expect(adapter.getTabs).toHaveBeenCalledTimes(1);

    act(() => { notify('favicons'); vi.advanceTimersByTime(250); });
    expect(result.current.faviconRevision).toBe(2);
  });

  it('通常のタブやブックマーク更新では画像を読み直さない', async () => {
    const { result } = renderHook(useBrowser);
    await act(async () => {});
    act(() => { vi.advanceTimersByTime(1000); });
    const initialRevision = result.current.faviconRevision;
    await act(async () => {
      notify('tabs'); notify('tabs'); notify('bookmarks');
      vi.advanceTimersByTime(1000);
    });
    expect(adapter.getTabs).toHaveBeenCalledTimes(2);
    expect(adapter.getBookmarks).toHaveBeenCalledTimes(2);
    expect(result.current.faviconRevision).toBe(initialRevision);
  });

  it('パネルを閉じたら購読と未実行の画像更新を破棄する', async () => {
    const { unmount } = renderHook(useBrowser);
    await act(async () => {});
    act(() => { notify('favicons'); });
    unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
