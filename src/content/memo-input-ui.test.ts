/**
 * @jest-environment jsdom
 *
 * content/memo-input-ui.ts のユニットテスト
 * タスク 10.1: MemoInputUI コンポーネント実装
 *
 * 設計書要件:
 * - Requirements: 5.1, 5.2, 5.3
 * - showMemoInput メッセージ受信時にオーバーレイが DOM に挿入されること
 * - Save ボタン押下時に saveSelection メッセージが memo フィールド付きで送信されること
 * - メモ空でも Save 可能（memo: undefined で送信）（5.3）
 * - Cancel ボタン押下時に saveSelection が送信されないこと
 * - 背景クリックで Cancel 動作すること
 * - Shadow DOM でページのグローバル CSS の影響を排除すること
 */

import { initMemoInputUI } from './memo-input-ui';

// chrome.runtime.sendMessage / onMessage のモック
const mockSendMessage = jest.fn();
const mockOnMessageAddListener = jest.fn();

beforeAll(() => {
  (global as unknown as { chrome: unknown }).chrome = {
    runtime: {
      sendMessage: mockSendMessage,
      onMessage: {
        addListener: mockOnMessageAddListener,
      },
    },
  };
});

beforeEach(() => {
  jest.clearAllMocks();
  document.body.innerHTML = '';
  mockSendMessage.mockResolvedValue(undefined);
});

afterEach(() => {
  jest.clearAllMocks();
});

// onMessage リスナーをキャプチャして手動トリガーするヘルパー
function captureMessageListener(): (message: unknown) => void {
  initMemoInputUI();
  const listener = mockOnMessageAddListener.mock.calls[0][0] as (message: unknown) => void;
  return listener;
}

describe('content/memo-input-ui.ts - メモ入力 UI', () => {
  describe('initMemoInputUI - 初期化', () => {
    it('chrome.runtime.onMessage.addListener を呼び出すこと', () => {
      initMemoInputUI();
      expect(mockOnMessageAddListener).toHaveBeenCalledTimes(1);
    });
  });

  describe('showMemoInput メッセージ受信 - オーバーレイ表示', () => {
    it('showMemoInput メッセージ受信時にオーバーレイが document.body に挿入されること（5.1）', () => {
      const listener = captureMessageListener();

      listener({
        type: 'showMemoInput',
        payload: { selectedText: 'テスト選択テキスト', pageUrl: 'https://example.com' },
      });

      // オーバーレイ要素が挿入されていること
      const overlay = document.body.querySelector('[data-testid="memo-input-overlay"]');
      expect(overlay).not.toBeNull();
    });

    it('オーバーレイ内に選択テキストのプレビューが含まれること', () => {
      const listener = captureMessageListener();
      const selectedText = 'これは選択されたテキストです';

      listener({
        type: 'showMemoInput',
        payload: { selectedText, pageUrl: 'https://example.com' },
      });

      const overlay = document.body.querySelector('[data-testid="memo-input-overlay"]');
      expect(overlay).not.toBeNull();

      // Shadow DOM 内のコンテンツを確認
      const shadowRoot = (overlay as HTMLElement).shadowRoot;
      expect(shadowRoot).not.toBeNull();
      expect(shadowRoot!.textContent).toContain(selectedText);
    });

    it('オーバーレイ内に textarea メモ入力フィールドが含まれること', () => {
      const listener = captureMessageListener();

      listener({
        type: 'showMemoInput',
        payload: { selectedText: 'test', pageUrl: 'https://example.com' },
      });

      const overlay = document.body.querySelector('[data-testid="memo-input-overlay"]');
      const shadowRoot = (overlay as HTMLElement).shadowRoot;
      const textarea = shadowRoot!.querySelector('textarea');
      expect(textarea).not.toBeNull();
    });

    it('オーバーレイ内に Save ボタンと Cancel ボタンが含まれること', () => {
      const listener = captureMessageListener();

      listener({
        type: 'showMemoInput',
        payload: { selectedText: 'test', pageUrl: 'https://example.com' },
      });

      const overlay = document.body.querySelector('[data-testid="memo-input-overlay"]');
      const shadowRoot = (overlay as HTMLElement).shadowRoot;
      const saveBtn = shadowRoot!.querySelector('[data-testid="save-button"]');
      const cancelBtn = shadowRoot!.querySelector('[data-testid="cancel-button"]');
      expect(saveBtn).not.toBeNull();
      expect(cancelBtn).not.toBeNull();
    });

    it('showMemoInput 以外のメッセージは無視されること', () => {
      const listener = captureMessageListener();

      listener({ type: 'getHighlights', payload: { pageUrl: 'https://example.com' } });

      const overlay = document.body.querySelector('[data-testid="memo-input-overlay"]');
      expect(overlay).toBeNull();
    });
  });

  describe('Save ボタン - saveSelection 送信（5.2, 5.3）', () => {
    it('Save 押下時に saveSelection メッセージが送信されること（5.2）', () => {
      const listener = captureMessageListener();

      listener({
        type: 'showMemoInput',
        payload: { selectedText: 'selected', pageUrl: 'https://example.com/page' },
      });

      const overlay = document.body.querySelector('[data-testid="memo-input-overlay"]')!;
      const shadowRoot = (overlay as HTMLElement).shadowRoot!;
      const saveBtn = shadowRoot.querySelector('[data-testid="save-button"]') as HTMLButtonElement;
      saveBtn.click();

      expect(mockSendMessage).toHaveBeenCalledTimes(1);
      const callArgs = mockSendMessage.mock.calls[0][0];
      expect(callArgs.type).toBe('saveSelection');
      expect(callArgs.payload.selectedText).toBe('selected');
      expect(callArgs.payload.pageUrl).toBe('https://example.com/page');
      expect(callArgs.payload.timestamp).toBeDefined();
    });

    it('メモあり Save 時に memo フィールドが送信されること', () => {
      const listener = captureMessageListener();

      listener({
        type: 'showMemoInput',
        payload: { selectedText: 'selected', pageUrl: 'https://example.com' },
      });

      const overlay = document.body.querySelector('[data-testid="memo-input-overlay"]')!;
      const shadowRoot = (overlay as HTMLElement).shadowRoot!;
      const textarea = shadowRoot.querySelector('textarea') as HTMLTextAreaElement;
      textarea.value = 'これはメモです';

      const saveBtn = shadowRoot.querySelector('[data-testid="save-button"]') as HTMLButtonElement;
      saveBtn.click();

      const callArgs = mockSendMessage.mock.calls[0][0];
      expect(callArgs.payload.memo).toBe('これはメモです');
    });

    it('メモ空欄のまま Save すると memo が undefined で送信されること（5.3）', () => {
      const listener = captureMessageListener();

      listener({
        type: 'showMemoInput',
        payload: { selectedText: 'selected', pageUrl: 'https://example.com' },
      });

      const overlay = document.body.querySelector('[data-testid="memo-input-overlay"]')!;
      const shadowRoot = (overlay as HTMLElement).shadowRoot!;
      const textarea = shadowRoot.querySelector('textarea') as HTMLTextAreaElement;
      textarea.value = ''; // 空のまま

      const saveBtn = shadowRoot.querySelector('[data-testid="save-button"]') as HTMLButtonElement;
      saveBtn.click();

      const callArgs = mockSendMessage.mock.calls[0][0];
      expect(callArgs.payload.memo).toBeUndefined();
    });

    it('Save 後にオーバーレイが DOM から削除されること', () => {
      const listener = captureMessageListener();

      listener({
        type: 'showMemoInput',
        payload: { selectedText: 'selected', pageUrl: 'https://example.com' },
      });

      const overlay = document.body.querySelector('[data-testid="memo-input-overlay"]')!;
      const shadowRoot = (overlay as HTMLElement).shadowRoot!;
      const saveBtn = shadowRoot.querySelector('[data-testid="save-button"]') as HTMLButtonElement;
      saveBtn.click();

      const removedOverlay = document.body.querySelector('[data-testid="memo-input-overlay"]');
      expect(removedOverlay).toBeNull();
    });
  });

  describe('Cancel ボタン - ダイアログを閉じる', () => {
    it('Cancel 押下時に saveSelection が送信されないこと', () => {
      const listener = captureMessageListener();

      listener({
        type: 'showMemoInput',
        payload: { selectedText: 'selected', pageUrl: 'https://example.com' },
      });

      const overlay = document.body.querySelector('[data-testid="memo-input-overlay"]')!;
      const shadowRoot = (overlay as HTMLElement).shadowRoot!;
      const cancelBtn = shadowRoot.querySelector(
        '[data-testid="cancel-button"]',
      ) as HTMLButtonElement;
      cancelBtn.click();

      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it('Cancel 後にオーバーレイが DOM から削除されること', () => {
      const listener = captureMessageListener();

      listener({
        type: 'showMemoInput',
        payload: { selectedText: 'selected', pageUrl: 'https://example.com' },
      });

      const overlay = document.body.querySelector('[data-testid="memo-input-overlay"]')!;
      const shadowRoot = (overlay as HTMLElement).shadowRoot!;
      const cancelBtn = shadowRoot.querySelector(
        '[data-testid="cancel-button"]',
      ) as HTMLButtonElement;
      cancelBtn.click();

      const removedOverlay = document.body.querySelector('[data-testid="memo-input-overlay"]');
      expect(removedOverlay).toBeNull();
    });
  });

  describe('背景クリック - Cancel と同等の動作', () => {
    it('オーバーレイ背景クリック時に saveSelection が送信されないこと', () => {
      const listener = captureMessageListener();

      listener({
        type: 'showMemoInput',
        payload: { selectedText: 'selected', pageUrl: 'https://example.com' },
      });

      const overlay = document.body.querySelector('[data-testid="memo-input-overlay"]') as HTMLElement;
      overlay.click();

      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it('背景クリック後にオーバーレイが DOM から削除されること', () => {
      const listener = captureMessageListener();

      listener({
        type: 'showMemoInput',
        payload: { selectedText: 'selected', pageUrl: 'https://example.com' },
      });

      const overlay = document.body.querySelector('[data-testid="memo-input-overlay"]') as HTMLElement;
      overlay.click();

      const removedOverlay = document.body.querySelector('[data-testid="memo-input-overlay"]');
      expect(removedOverlay).toBeNull();
    });

    it('ダイアログ内クリック時はオーバーレイが閉じないこと', () => {
      const listener = captureMessageListener();

      listener({
        type: 'showMemoInput',
        payload: { selectedText: 'selected', pageUrl: 'https://example.com' },
      });

      const overlay = document.body.querySelector('[data-testid="memo-input-overlay"]')!;
      const shadowRoot = (overlay as HTMLElement).shadowRoot!;
      const dialog = shadowRoot.querySelector('[data-testid="memo-input-dialog"]') as HTMLElement;
      dialog.click();

      // ダイアログ内クリックはオーバーレイを閉じない
      const stillExists = document.body.querySelector('[data-testid="memo-input-overlay"]');
      expect(stillExists).not.toBeNull();
    });
  });

  describe('Shadow DOM - スタイル分離', () => {
    it('オーバーレイ要素が Shadow DOM を持つこと', () => {
      const listener = captureMessageListener();

      listener({
        type: 'showMemoInput',
        payload: { selectedText: 'test', pageUrl: 'https://example.com' },
      });

      const overlay = document.body.querySelector('[data-testid="memo-input-overlay"]');
      expect(overlay).not.toBeNull();
      expect((overlay as HTMLElement).shadowRoot).not.toBeNull();
    });
  });
});
