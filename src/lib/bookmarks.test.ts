import { describe, expect, it } from 'vitest';
import type { BookmarkNode } from '../types';
import { assertOpenableUrl, countBookmarks, filterBookmarks, getBookmarkBarRoots, getFolderOptions, normalizeWebUrl, sanitizePreferences } from './bookmarks';

const tree: BookmarkNode[] = [{
  id: '1', title: 'バー', readOnly: true,
  children: [
    { id: '10', title: '仕事', parentId: '1', children: [
      { id: '11', title: 'React', url: 'https://react.dev/', parentId: '10' },
      { id: '12', title: '資料', parentId: '10', children: [] },
    ] },
    { id: '20', title: 'GitHub', url: 'https://github.com/', parentId: '1' },
    { id: '30', title: '管理対象', managed: true, children: [{ id: '31', title: '社内', children: [] }] },
  ],
}];

describe('ブックマークの階層', () => {
  it('ブックマークバーだけを選び、表示名や配列の順序に依存しない', () => {
    const roots: BookmarkNode[] = [
      { id: '2', title: 'その他', folderType: 'other', children: [] },
      { id: '80', title: 'Bookmarks bar', folderType: 'bookmarks-bar', children: [] },
      { id: '3', title: 'ブックマーク バー', folderType: 'mobile', children: [] },
      { id: '90', title: 'ブックマーク バー', folderType: 'bookmarks-bar', children: [] },
    ];
    expect(getBookmarkBarRoots(roots)).toEqual([roots[1], roots[3]]);
  });
  it('folderTypeのない古いChromeではIDでバーを選び、存在しない場合は他のルートで代替しない', () => {
    const roots: BookmarkNode[] = [{ id: '2', title: 'その他', children: [] }, ...tree];
    expect(getBookmarkBarRoots(roots)).toEqual(tree);
    expect(getBookmarkBarRoots([roots[0]])).toEqual([]);
    expect(getBookmarkBarRoots([{ id: '1', title: 'その他', folderType: 'other', children: [] }])).toEqual([]);
  });

  it('リンクの検索結果に祖先フォルダを残す', () => {
    const result = filterBookmarks(tree, 'REACT.DEV');
    expect(result[0].children).toHaveLength(1);
    expect(result[0].children![0].children?.map((node) => node.id)).toEqual(['11']);
    expect(tree[0].children![0].children).toHaveLength(2);
  });
  it('一致するフォルダの内容を残す', () => {
    expect(filterBookmarks(tree, '仕事')[0].children![0].children).toHaveLength(2);
  });
  it('フォルダ移動先から自分と子孫、管理対象フォルダを除外する', () => {
    expect(getFolderOptions(tree, '10').map((node) => node.id)).toEqual(['1']);
    expect(getFolderOptions(tree).map((node) => node.id)).toEqual(['1', '10', '12']);
  });
  it('フォルダを件数に含めない', () => { expect(countBookmarks(tree)).toBe(2); });
});

describe('URL検証', () => {
  it('プロトコルがないURLにhttpsを補う', () => {
    expect(normalizeWebUrl(' example.com/path?q=日本語 ')).toBe('https://example.com/path?q=%E6%97%A5%E6%9C%AC%E8%AA%9E');
  });
  it.each(['javascript:alert(1)', 'data:text/html,hello', 'https://user:password@example.com', 'https://', ''])('危険または不正なURLを拒否: %s', (url) => {
    expect(() => normalizeWebUrl(url)).toThrow();
  });
  it('ブックマークレットを実行しない', () => {
    expect(() => assertOpenableUrl('javascript:alert(1)')).toThrow();
    expect(() => assertOpenableUrl('chrome://newtab/')).not.toThrow();
  });
});

describe('保存設定の復元', () => {
  it('壊れた設定を補正し、廃止したテーマ・表示比率を適用しない', () => {
    const preferences = sanitizePreferences({ theme: 'dark', splitRatio: Infinity, expandedFolders: ['1', 3], bookmarksCollapsed: 'yes' });
    expect(preferences).not.toHaveProperty('theme');
    expect(preferences).not.toHaveProperty('splitRatio');
    expect(preferences.expandedFolders).toEqual(['1']);
    expect(preferences.bookmarksCollapsed).toBe(false);
    expect(sanitizePreferences(null).expandedFolders).toEqual(['1']);
  });
});
