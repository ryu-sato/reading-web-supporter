/**
 * service-worker/message-handler.ts のユニットテスト
 * タスク 2.5: メッセージルーティングシステムを作成
 *
 * Requirements: 1.1, 1.2, 1.4, 2.1
 * - chrome.runtime.onMessage リスナーを登録し、型ベースにhandlerをdispatch
 * - textSelectionUpdated: 現在の選択状態を内部で保持
 * - getSelection: 保持している選択状態をレスポンスで返す
 * - 全メッセージが損失なく適切なチャネルで流れる
 */

import { MessageHandler } from './message-handler';
import type { TextSelectionMessage, ExtensionMessage } from '../types/types';

// chrome.runtime.onMessage のモック
type MessageListener = (
  message: ExtensionMessage,
  sender: Record<string, unknown>,
  sendResponse: (response?: unknown) => void
) => boolean | void;

const registeredListeners: MessageListener[] = [];

const mockOnMessage = {
  addListener: jest.fn((listener: MessageListener) => {
    registeredListeners.push(listener);
  }),
  removeListener: jest.fn((listener: MessageListener) => {
    const idx = registeredListeners.indexOf(listener);
    if (idx !== -1) registeredListeners.splice(idx, 1);
  }),
};

const mockSender: Record<string, unknown> = {};

// chrome グローバルをモック
(global as unknown as { chrome: unknown }).chrome = {
  runtime: {
    onMessage: mockOnMessage,
  },
};

/**
 * 登録済みリスナーを呼び出すヘルパー
 */
function dispatchMessage(
  message: ExtensionMessage,
  sendResponse: (response?: unknown) => void = jest.fn()
): boolean | void {
  const listener = registeredListeners[registeredListeners.length - 1];
  if (!listener) throw new Error('リスナーが登録されていません');
  return listener(message, mockSender, sendResponse);
}

describe('MessageHandler', () => {
  let handler: MessageHandler;

  beforeEach(() => {
    jest.clearAllMocks();
    registeredListeners.length = 0;
    handler = new MessageHandler();
  });

  // ── 初期化 ──────────────────────────────────────────────────────────────────

  describe('初期化', () => {
    it('chrome.runtime.onMessage.addListener が呼ばれる', () => {
      expect(mockOnMessage.addListener).toHaveBeenCalledTimes(1);
    });

    it('初期選択状態は hasSelection: false', () => {
      const selection = handler.getCurrentSelection();
      expect(selection.hasSelection).toBe(false);
      expect(selection.selectedText).toBe('');
      expect(selection.pageUrl).toBe('');
    });
  });

  // ── textSelectionUpdated ────────────────────────────────────────────────────

  describe('textSelectionUpdated メッセージの処理', () => {
    it('選択状態を内部に保持する (Req 1.1)', () => {
      const message: TextSelectionMessage = {
        type: 'textSelectionUpdated',
        payload: {
          selectedText: '重要なテキスト',
          pageUrl: 'https://example.com/blog',
          hasSelection: true,
        },
      };

      dispatchMessage(message);

      const selection = handler.getCurrentSelection();
      expect(selection.selectedText).toBe('重要なテキスト');
      expect(selection.pageUrl).toBe('https://example.com/blog');
      expect(selection.hasSelection).toBe(true);
    });

    it('テキスト未選択状態も正しく保持する (Req 1.4)', () => {
      // まず選択状態にする
      dispatchMessage({
        type: 'textSelectionUpdated',
        payload: { selectedText: 'テスト', pageUrl: 'https://example.com', hasSelection: true },
      });

      // 選択解除
      dispatchMessage({
        type: 'textSelectionUpdated',
        payload: { selectedText: '', pageUrl: 'https://example.com', hasSelection: false },
      });

      const selection = handler.getCurrentSelection();
      expect(selection.hasSelection).toBe(false);
      expect(selection.selectedText).toBe('');
    });

    it('複数回の更新で最新状態のみ保持される', () => {
      dispatchMessage({
        type: 'textSelectionUpdated',
        payload: { selectedText: '古いテキスト', pageUrl: 'https://old.com', hasSelection: true },
      });
      dispatchMessage({
        type: 'textSelectionUpdated',
        payload: { selectedText: '新しいテキスト', pageUrl: 'https://new.com', hasSelection: true },
      });

      const selection = handler.getCurrentSelection();
      expect(selection.selectedText).toBe('新しいテキスト');
      expect(selection.pageUrl).toBe('https://new.com');
    });

    it('textSelectionUpdated はレスポンス不要（false または void を返す）', () => {
      const sendResponse = jest.fn();
      const result = dispatchMessage(
        {
          type: 'textSelectionUpdated',
          payload: { selectedText: 'テスト', pageUrl: 'https://example.com', hasSelection: true },
        },
        sendResponse
      );

      expect(sendResponse).not.toHaveBeenCalled();
      expect(result).toBeFalsy();
    });
  });

  // ── getSelection ────────────────────────────────────────────────────────────

  describe('getSelection メッセージの処理', () => {
    it('保持している選択状態をレスポンスで返す (Req 1.1, 1.2)', () => {
      // まず選択状態を設定
      dispatchMessage({
        type: 'textSelectionUpdated',
        payload: { selectedText: '保存するテキスト', pageUrl: 'https://blog.example.com/article', hasSelection: true },
      });

      const sendResponse = jest.fn();
      dispatchMessage({ type: 'getSelection' }, sendResponse);

      expect(sendResponse).toHaveBeenCalledTimes(1);
      expect(sendResponse).toHaveBeenCalledWith({
        selectedText: '保存するテキスト',
        pageUrl: 'https://blog.example.com/article',
        hasSelection: true,
      });
    });

    it('選択状態が未設定の場合、hasSelection: false のレスポンスを返す (Req 1.4)', () => {
      const sendResponse = jest.fn();
      dispatchMessage({ type: 'getSelection' }, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith({
        selectedText: '',
        pageUrl: '',
        hasSelection: false,
      });
    });

    it('getSelection は true を返して非同期レスポンスチャネルを開く', () => {
      const sendResponse = jest.fn();
      const result = dispatchMessage({ type: 'getSelection' }, sendResponse);

      expect(result).toBe(true);
    });

    it('getSelection リクエスト後に選択状態が変化しても既にレスポンス済み (Req 2.1)', () => {
      // 選択状態を設定
      dispatchMessage({
        type: 'textSelectionUpdated',
        payload: { selectedText: 'original text', pageUrl: 'https://example.com', hasSelection: true },
      });

      const sendResponse = jest.fn();
      dispatchMessage({ type: 'getSelection' }, sendResponse);

      // レスポンス済みの後に状態変化
      dispatchMessage({
        type: 'textSelectionUpdated',
        payload: { selectedText: 'changed text', pageUrl: 'https://example.com', hasSelection: true },
      });

      // 最初のレスポンスは変化前のデータ
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ selectedText: 'original text' })
      );
    });
  });

  // ── 未知のメッセージタイプ ──────────────────────────────────────────────────

  describe('未知のメッセージタイプの処理', () => {
    it('未知のメッセージタイプはエラーをスローしない', () => {
      expect(() => {
        dispatchMessage({ type: 'saveSelection', payload: { selectedText: '', pageUrl: '', timestamp: '' } });
      }).not.toThrow();
    });

    it('未知のメッセージタイプは false を返す', () => {
      const result = dispatchMessage({
        type: 'saveSelection',
        payload: { selectedText: '', pageUrl: '', timestamp: '' },
      });
      expect(result).toBeFalsy();
    });
  });

  // ── getCurrentSelection ─────────────────────────────────────────────────────

  describe('getCurrentSelection - ContextMenuHandler からの読み取り', () => {
    it('選択状態をコピーで返す（参照渡しではない）', () => {
      dispatchMessage({
        type: 'textSelectionUpdated',
        payload: { selectedText: 'テスト', pageUrl: 'https://example.com', hasSelection: true },
      });

      const selection1 = handler.getCurrentSelection();
      const selection2 = handler.getCurrentSelection();

      expect(selection1).not.toBe(selection2); // 異なるオブジェクト参照
      expect(selection1).toEqual(selection2);  // 同じ値
    });

    it('選択状態を含む全フィールドを返す (Req 2.1)', () => {
      dispatchMessage({
        type: 'textSelectionUpdated',
        payload: {
          selectedText: 'Webブログの重要な一文',
          pageUrl: 'https://myblog.example.com/post/42',
          hasSelection: true,
        },
      });

      const selection = handler.getCurrentSelection();

      expect(selection).toEqual({
        selectedText: 'Webブログの重要な一文',
        pageUrl: 'https://myblog.example.com/post/42',
        hasSelection: true,
      });
    });
  });

  // ── メッセージ損失なし ──────────────────────────────────────────────────────

  describe('メッセージの損失なし', () => {
    it('複数の異なるタイプのメッセージを順番に処理できる', () => {
      const sendResponse = jest.fn();

      // 選択更新
      dispatchMessage({
        type: 'textSelectionUpdated',
        payload: { selectedText: 'テキスト1', pageUrl: 'https://example.com', hasSelection: true },
      });

      // 選択取得
      dispatchMessage({ type: 'getSelection' }, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ selectedText: 'テキスト1' })
      );

      // 別の選択更新
      dispatchMessage({
        type: 'textSelectionUpdated',
        payload: { selectedText: 'テキスト2', pageUrl: 'https://example.com', hasSelection: true },
      });

      // 再度選択取得
      const sendResponse2 = jest.fn();
      dispatchMessage({ type: 'getSelection' }, sendResponse2);
      expect(sendResponse2).toHaveBeenCalledWith(
        expect.objectContaining({ selectedText: 'テキスト2' })
      );
    });
  });
});
