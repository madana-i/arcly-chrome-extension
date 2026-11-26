// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SiteIcon } from './site-icon';

beforeEach(() => {
  vi.stubGlobal('chrome', { runtime: { id: 'test', getURL: (path: string) => `chrome-extension://test/${path}` } });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Chromeのfavicon表示', () => {
  const url = 'https://console.aws.amazon.com/console/home?region=ap-northeast-1#home';

  it('地球などの正常な画像応答も、通知後は同じページURLのまま再リクエストする', () => {
    const { container, rerender } = render(<SiteIcon url={url} />);
    const image = container.querySelector('img')!;
    const original = image.src;
    fireEvent.load(image);
    rerender(<SiteIcon url={url} revision={1} />);
    expect(image.src).not.toBe(original);
    const request = new URL(image.src);
    expect(request.searchParams.get('pageUrl')).toBe(url);
    expect(request.searchParams.get('size')).toBe('32');
    expect(request.searchParams.get('v')).toBe('1');
  });

  it('画像の読み込み失敗後も、更新通知が来たら再試行できる', () => {
    const { container, rerender } = render(<SiteIcon url={url} />);
    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('img')).toBeNull();
    rerender(<SiteIcon url={url} revision={1} />);
    expect(container.querySelector('img')).not.toBeNull();
  });
});
