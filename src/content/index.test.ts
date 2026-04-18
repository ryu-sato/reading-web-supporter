/**
 * @jest-environment jsdom
 *
 * Content Script エントリポイント（src/content/index.ts）のユニットテスト
 * タスク 11.1: 保存フロー全体を接続して動作確認
 *
 * Requirements: 5.1, 5.2, 5.3
 */

// モジュールモック: initMemoInputUI の呼び出しを検証するため事前にモック宣言
jest.mock('./memo-input-ui', () => ({
  initMemoInputUI: jest.fn(),
}));

jest.mock('./text-selector', () => ({
  initTextSelector: jest.fn(),
}));

jest.mock('./highlight-controller', () => ({
  HighlightController: jest.fn().mockImplementation(() => ({})),
}));

import { initMemoInputUI } from './memo-input-ui';
import { initTextSelector } from './text-selector';
import { initializeContentScript } from './index';

describe('initializeContentScript: MemoInputUI の統合', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('initializeContentScript() を呼ぶと initMemoInputUI() が実行される (Req 5.1)', () => {
    initializeContentScript();

    expect(initMemoInputUI).toHaveBeenCalledTimes(1);
  });

  it('initializeContentScript() を呼ぶと initTextSelector() も実行される', () => {
    initializeContentScript();

    expect(initTextSelector).toHaveBeenCalledTimes(1);
  });
});
