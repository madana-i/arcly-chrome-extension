import { describe, expect, it } from 'vitest';
import type { BookmarkNode } from '@/types';
import { getBookmarkDropPosition, resolveBookmarkDrop, resolveBookmarkInsertion } from './bookmark-drag';

const bookmarks: BookmarkNode[] = [
  { id: '1', title: 'バー', readOnly: true, children: [
    { id: '10', title: '仕事', parentId: '1', children: [
      { id: '11', title: 'React', parentId: '10', url: 'https://react.dev/' },
      { id: '12', title: '資料', parentId: '10', children: [] },
    ] },
    { id: '20', title: 'GitHub', parentId: '1', url: 'https://github.com/' },
    { id: '30', title: 'Vite', parentId: '1', url: 'https://vite.dev/' },
  ] },
  { id: '2', title: 'その他', readOnly: true, children: [] },
  { id: '3', title: '組織', readOnly: true, managed: true, children: [
    { id: '31', title: '社内', children: [{ id: '311', title: '社内サイト', url: 'https://example.com/' }] },
  ] },
];

describe('ブックマークのドロップ先', () => {
  it('新規追加は既存項目を取り除かず、上下・フォルダ内の挿入位置を返す', () => {
    expect(resolveBookmarkInsertion(bookmarks, { id: '10', position: 'before' })).toEqual({ parentId: '1', index: 0 });
    expect(resolveBookmarkInsertion(bookmarks, { id: '20', position: 'after' })).toEqual({ parentId: '1', index: 2 });
    expect(resolveBookmarkInsertion(bookmarks, { id: '10', position: 'inside' })).toEqual({ parentId: '10', index: 2 });
    expect(resolveBookmarkInsertion(bookmarks, { id: '2', position: 'inside' })).toEqual({ parentId: '2', index: 0 });
  });
  it('新規追加でも管理対象・ルートの外側・リンクの中・存在しない保存先を拒否する', () => {
    for (const target of [
      { id: '31', position: 'inside' },
      { id: '311', position: 'before' },
      { id: '2', position: 'after' },
      { id: '20', position: 'inside' },
      { id: 'missing', position: 'inside' },
    ] as const) expect(resolveBookmarkInsertion(bookmarks, target)).toBeNull();
  });
  it('上下の並び替え位置を、Chromeが使う移動前の挿入位置として返す', () => {
    expect(resolveBookmarkDrop(bookmarks, '20', { id: '30', position: 'after' })).toEqual({ parentId: '1', index: 3 });
    expect(resolveBookmarkDrop(bookmarks, '30', { id: '20', position: 'before' })).toEqual({ parentId: '1', index: 1 });
    expect(resolveBookmarkDrop(bookmarks, '10', { id: '30', position: 'after' })).toEqual({ parentId: '1', index: 3 });
  });
  it('フォルダの中、空のルートフォルダ、別階層の項目の前へ移動できる', () => {
    expect(resolveBookmarkDrop(bookmarks, '20', { id: '10', position: 'inside' })).toEqual({ parentId: '10', index: 2 });
    expect(resolveBookmarkDrop(bookmarks, '11', { id: '2', position: 'inside' })).toEqual({ parentId: '2', index: 0 });
    expect(resolveBookmarkDrop(bookmarks, '20', { id: '11', position: 'before' })).toEqual({ parentId: '10', index: 0 });
  });
  it.each([
    ['10', '10', 'inside'],
    ['10', '12', 'inside'],
    ['10', '11', 'before'],
    ['1', '2', 'inside'],
    ['20', '2', 'before'],
    ['20', '30', 'inside'],
    ['311', '20', 'after'],
    ['20', '31', 'inside'],
    ['missing', '10', 'inside'],
  ] as const)('自分・子孫・管理対象・無効な移動を拒否: %s → %s (%s)', (source, id, position) => {
    expect(resolveBookmarkDrop(bookmarks, source, { id, position })).toBeNull();
  });
  it('現在と同じ位置になるドロップは保存しない', () => {
    expect(resolveBookmarkDrop(bookmarks, '20', { id: '30', position: 'before' })).toBeNull();
    expect(resolveBookmarkDrop(bookmarks, '30', { id: '20', position: 'after' })).toBeNull();
    expect(resolveBookmarkDrop(bookmarks, '30', { id: '1', position: 'inside' })).toBeNull();
  });
  it('フォルダの中央は子要素、上下端は兄弟への並び替えとして扱う', () => {
    expect(getBookmarkDropPosition(true, 2, 32)).toBe('before');
    expect(getBookmarkDropPosition(true, 16, 32)).toBe('inside');
    expect(getBookmarkDropPosition(true, 30, 32)).toBe('after');
    expect(getBookmarkDropPosition(false, 12, 32)).toBe('before');
    expect(getBookmarkDropPosition(false, 20, 32)).toBe('after');
  });
});
