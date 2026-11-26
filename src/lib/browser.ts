import type { BrowserAdapter } from '../types';
import { ChromeAdapter } from './chrome-adapter';
import { DemoAdapter } from './demo-adapter';

export const browser: BrowserAdapter = globalThis.chrome?.runtime?.id
  ? new ChromeAdapter()
  : new DemoAdapter();
