/**
 * service-worker/message-handler.ts のユニットテスト
 * タスク 2.5: メッセージルーティングシステムを作成
 * タスク 3.3: オプションページと設定管理の統合
 *
 * Requirements: 1.1, 1.2, 1.4, 2.1, 3.1, 3.2, 3.3, 3.4, 3.5
 * - chrome.runtime.onMessage リスナーを登録し、型ベースにhandlerをdispatch
 * - textSelectionUpdated: 現在の選択状態を内部で保持
 * - getSelection: 保持している選択状態をレスポンスで返す
 * - setCredentials: SettingsManager.setCredentials() に委譲してレスポンスを返す
 * - getCredentials: SettingsManager.getCredentials() に委譲してレスポンスを返す
 * - testConnection: SupabaseWriter.testConnection() に委譲してレスポンスを返す
 * - 全メッセージが損失なく適切なチャネルで流れる
 */

import { MessageHandler } from './message-handler';
import type { TextSelectionMessage, ExtensionMessage, HighlightsResponse } from '../types/types';

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

// SettingsManager モック
const mockGetCredentials = jest.fn();
const mockSetCredentials = jest.fn();
const mockIsConfigured = jest.fn();
const mockSettingsManager = {
  getCredentials: mockGetCredentials,
  setCredentials: mockSetCredentials,
  isConfigured: mockIsConfigured,
};

// SupabaseWriter モック
const mockTestConnection = jest.fn();
const mockSave = jest.fn();
const mockUpdateMemo = jest.fn();
const mockDeleteRecord = jest.fn();
const mockSupabaseWriter = {
  testConnection: mockTestConnection,
  save: mockSave,
  updateMemo: mockUpdateMemo,
  deleteRecord: mockDeleteRecord,
};

// SupabaseReader モック
const mockFetchSavedTexts = jest.fn();
const mockSupabaseReader = {
  fetchSavedTexts: mockFetchSavedTexts,
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    handler = new MessageHandler(mockSettingsManager as any, mockSupabaseWriter as any);
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

  // ── saveSelection メッセージハンドラー (Req 5.2, 5.3) ───────────────────────

  describe('saveSelection メッセージの処理 (Req 5.2, 5.3)', () => {
    it('saveSelection メッセージで SupabaseWriter.save() が呼ばれる', async () => {
      mockSave.mockResolvedValue({ success: true, data: { id: 'test-id', created_at: '2026-04-13T00:00:00.000Z' } });

      const payload = {
        selectedText: '保存するテキスト',
        pageUrl: 'https://example.com/page',
        timestamp: '2026-04-13T00:00:00.000Z',
      };
      const sendResponse = jest.fn();
      const result = dispatchMessage({ type: 'saveSelection', payload }, sendResponse);
      expect(result).toBe(true);

      await new Promise((r) => setTimeout(r, 0));
      expect(mockSave).toHaveBeenCalledWith(payload);
      expect(sendResponse).toHaveBeenCalledWith({ success: true, data: { id: 'test-id', created_at: '2026-04-13T00:00:00.000Z' } });
    });

    it('memo フィールドが SupabaseWriter.save() に渡される (Req 5.2)', async () => {
      mockSave.mockResolvedValue({ success: true, data: { id: 'test-id', created_at: '2026-04-13T00:00:00.000Z' } });

      const payloadWithMemo = {
        selectedText: 'メモ付きテキスト',
        pageUrl: 'https://example.com/page',
        timestamp: '2026-04-13T00:00:00.000Z',
        memo: '重要なメモ',
      };
      const sendResponse = jest.fn();
      dispatchMessage({ type: 'saveSelection', payload: payloadWithMemo }, sendResponse);

      await new Promise((r) => setTimeout(r, 0));
      expect(mockSave).toHaveBeenCalledWith(payloadWithMemo);
      expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({ memo: '重要なメモ' }));
    });

    it('memo なしの saveSelection も正しく動作する (Req 5.2)', async () => {
      mockSave.mockResolvedValue({ success: true, data: { id: 'test-id', created_at: '2026-04-13T00:00:00.000Z' } });

      const payloadWithoutMemo = {
        selectedText: 'メモなしテキスト',
        pageUrl: 'https://example.com/page',
        timestamp: '2026-04-13T00:00:00.000Z',
      };
      const sendResponse = jest.fn();
      dispatchMessage({ type: 'saveSelection', payload: payloadWithoutMemo }, sendResponse);

      await new Promise((r) => setTimeout(r, 0));
      expect(mockSave).toHaveBeenCalledWith(payloadWithoutMemo);
    });

    it('saveSelection 失敗時もエラーレスポンスが返される', async () => {
      mockSave.mockResolvedValue({ success: false, error: { code: 'NETWORK_ERROR', message: 'ネットワークエラー', recoveryHint: '再試行してください' } });

      const payload = {
        selectedText: 'テキスト',
        pageUrl: 'https://example.com/page',
        timestamp: '2026-04-13T00:00:00.000Z',
      };
      const sendResponse = jest.fn();
      dispatchMessage({ type: 'saveSelection', payload }, sendResponse);

      await new Promise((r) => setTimeout(r, 0));
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: false })
      );
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

  // ── onSelectionChange コールバック ─────────────────────────────────────────

  describe('onSelectionChange - 選択状態変化通知 (Req 1.1, 1.4)', () => {
    it('textSelectionUpdated 受信時にコールバックが呼ばれる (Req 1.1)', () => {
      const callback = jest.fn();
      handler.onSelectionChange(callback);

      dispatchMessage({
        type: 'textSelectionUpdated',
        payload: { selectedText: 'テキスト', pageUrl: 'https://example.com', hasSelection: true },
      });

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(true);
    });

    it('hasSelection: false の場合、false でコールバックが呼ばれる (Req 1.4)', () => {
      const callback = jest.fn();
      handler.onSelectionChange(callback);

      dispatchMessage({
        type: 'textSelectionUpdated',
        payload: { selectedText: '', pageUrl: 'https://example.com', hasSelection: false },
      });

      expect(callback).toHaveBeenCalledWith(false);
    });

    it('getSelection メッセージではコールバックが呼ばれない', () => {
      const callback = jest.fn();
      handler.onSelectionChange(callback);

      dispatchMessage({ type: 'getSelection' });

      expect(callback).not.toHaveBeenCalled();
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

  // ── setCredentials メッセージハンドラー (Task 3.3) ──────────────────────────

  describe('setCredentials メッセージの処理 (Req 3.1, 3.3, 3.4)', () => {
    it('setCredentials メッセージで SettingsManager.setCredentials() が呼ばれる', async () => {
      const creds = { projectUrl: 'https://example.supabase.co', anonKey: 'a'.repeat(40) };
      mockSetCredentials.mockResolvedValue({ success: true });

      const sendResponse = jest.fn();
      const result = dispatchMessage({ type: 'setCredentials', payload: creds }, sendResponse);
      expect(result).toBe(true); // 非同期レスポンスチャネルを維持

      // 非同期なので待機
      await new Promise((r) => setTimeout(r, 0));
      expect(mockSetCredentials).toHaveBeenCalledWith(creds);
      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });

    it('setCredentials 失敗時もエラーレスポンスが返される (Req 3.5)', async () => {
      const creds = { projectUrl: 'http://invalid.co', anonKey: 'short' };
      mockSetCredentials.mockResolvedValue({ success: false, error: '無効な認証情報です' });

      const sendResponse = jest.fn();
      dispatchMessage({ type: 'setCredentials', payload: creds }, sendResponse);

      await new Promise((r) => setTimeout(r, 0));
      expect(sendResponse).toHaveBeenCalledWith({ success: false, error: '無効な認証情報です' });
    });
  });

  // ── getCredentials メッセージハンドラー (Task 3.3) ──────────────────────────

  describe('getCredentials メッセージの処理 (Req 3.1, 3.3)', () => {
    it('getCredentials メッセージで SettingsManager.getCredentials() が呼ばれる', async () => {
      const creds = { projectUrl: 'https://example.supabase.co', anonKey: 'a'.repeat(40) };
      mockGetCredentials.mockResolvedValue(creds);

      const sendResponse = jest.fn();
      const result = dispatchMessage({ type: 'getCredentials' }, sendResponse);
      expect(result).toBe(true);

      await new Promise((r) => setTimeout(r, 0));
      expect(mockGetCredentials).toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith(creds);
    });

    it('認証情報が未設定の場合、null が返される', async () => {
      mockGetCredentials.mockResolvedValue(null);

      const sendResponse = jest.fn();
      dispatchMessage({ type: 'getCredentials' }, sendResponse);

      await new Promise((r) => setTimeout(r, 0));
      expect(sendResponse).toHaveBeenCalledWith(null);
    });
  });

  // ── testConnection メッセージハンドラー (Task 3.3) ────────────────────────────

  describe('testConnection メッセージの処理 (Req 3.2)', () => {
    it('testConnection メッセージで SupabaseWriter.testConnection() が呼ばれる', async () => {
      mockTestConnection.mockResolvedValue({ success: true, message: '接続成功' });

      const sendResponse = jest.fn();
      const result = dispatchMessage({ type: 'testConnection' }, sendResponse);
      expect(result).toBe(true);

      await new Promise((r) => setTimeout(r, 0));
      expect(mockTestConnection).toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith({ success: true, message: '接続成功' });
    });

    it('testConnection 失敗時もエラーレスポンスが返される (Req 3.5)', async () => {
      mockTestConnection.mockResolvedValue({ success: false, message: '接続に失敗しました' });

      const sendResponse = jest.fn();
      dispatchMessage({ type: 'testConnection' }, sendResponse);

      await new Promise((r) => setTimeout(r, 0));
      expect(sendResponse).toHaveBeenCalledWith({ success: false, message: '接続に失敗しました' });
    });
  });

  // ── getHighlights メッセージハンドラー (Req 4.1〜4.6) ────────────────────────

  describe('getHighlights メッセージの処理 (Req 4.1, 4.3)', () => {
    let handlerWithReader: MessageHandler;

    function dispatchMessageWithReader(
      message: ExtensionMessage,
      sendResponse: (response?: unknown) => void = jest.fn()
    ): boolean | void {
      const listener = registeredListeners[registeredListeners.length - 1];
      if (!listener) throw new Error('リスナーが登録されていません');
      return listener(message, mockSender, sendResponse);
    }

    beforeEach(() => {
      jest.clearAllMocks();
      registeredListeners.length = 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      handlerWithReader = new MessageHandler(mockSettingsManager as any, mockSupabaseWriter as any, mockSupabaseReader as any);
      void handlerWithReader; // suppress unused warning
    });

    it('getHighlights メッセージで SupabaseReader.fetchSavedTexts() が呼ばれ SavedHighlight[] を含む HighlightsResponse が返される', async () => {
      const highlights = [
        { id: 'rec-1', text: '重要な文章', memo: 'このメモが重要' },
        { id: 'rec-2', text: '別の文章' },
      ];
      const response: HighlightsResponse = { success: true, highlights };
      mockFetchSavedTexts.mockResolvedValue(response);

      const sendResponse = jest.fn();
      const result = dispatchMessageWithReader(
        { type: 'getHighlights', payload: { pageUrl: 'https://example.com/page' } },
        sendResponse
      );
      expect(result).toBe(true); // 非同期レスポンスチャネルを維持

      await new Promise((r) => setTimeout(r, 0));
      expect(mockFetchSavedTexts).toHaveBeenCalledWith({ pageUrl: 'https://example.com/page' });
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          highlights: expect.arrayContaining([
            expect.objectContaining({ text: '重要な文章', memo: 'このメモが重要' }),
            expect.objectContaining({ text: '別の文章' }),
          ]),
        })
      );
    });

    it('getHighlights でエラーが発生した場合、エラーレスポンスが返される', async () => {
      const errorResponse: HighlightsResponse = {
        success: false,
        error: { code: 'AUTH_FAILED', message: '認証エラー' },
      };
      mockFetchSavedTexts.mockResolvedValue(errorResponse);

      const sendResponse = jest.fn();
      dispatchMessageWithReader(
        { type: 'getHighlights', payload: { pageUrl: 'https://example.com/page' } },
        sendResponse
      );

      await new Promise((r) => setTimeout(r, 0));
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: expect.objectContaining({ code: 'AUTH_FAILED' }) })
      );
    });
  });

  // ── isConfigured メッセージハンドラー (Req 4.6) ───────────────────────────────

  describe('isConfigured メッセージの処理 (Req 4.6)', () => {
    let handlerWithReader: MessageHandler;

    function dispatchMessageWithReader(
      message: ExtensionMessage,
      sendResponse: (response?: unknown) => void = jest.fn()
    ): boolean | void {
      const listener = registeredListeners[registeredListeners.length - 1];
      if (!listener) throw new Error('リスナーが登録されていません');
      return listener(message, mockSender, sendResponse);
    }

    beforeEach(() => {
      jest.clearAllMocks();
      registeredListeners.length = 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      handlerWithReader = new MessageHandler(mockSettingsManager as any, mockSupabaseWriter as any, mockSupabaseReader as any);
      void handlerWithReader;
    });

    it('認証情報が設定済みの場合、{ configured: true } が返される', async () => {
      mockIsConfigured.mockResolvedValue(true);

      const sendResponse = jest.fn();
      const result = dispatchMessageWithReader({ type: 'isConfigured' }, sendResponse);
      expect(result).toBe(true);

      await new Promise((r) => setTimeout(r, 0));
      expect(mockIsConfigured).toHaveBeenCalled();
      expect(sendResponse).toHaveBeenCalledWith({ configured: true });
    });

    it('認証情報が未設定の場合、{ configured: false } が返される', async () => {
      mockIsConfigured.mockResolvedValue(false);

      const sendResponse = jest.fn();
      dispatchMessageWithReader({ type: 'isConfigured' }, sendResponse);

      await new Promise((r) => setTimeout(r, 0));
      expect(sendResponse).toHaveBeenCalledWith({ configured: false });
    });
  });

  // ── updateMemo メッセージハンドラー (Req 6.3) ────────────────────────────────

  describe('updateMemo メッセージの処理 (Req 6.3)', () => {
    let handlerForUpdate: MessageHandler;

    function dispatchUpdateMessage(
      message: ExtensionMessage,
      sendResponse: (response?: unknown) => void = jest.fn()
    ): boolean | void {
      const listener = registeredListeners[registeredListeners.length - 1];
      if (!listener) throw new Error('リスナーが登録されていません');
      return listener(message, mockSender, sendResponse);
    }

    beforeEach(() => {
      jest.clearAllMocks();
      registeredListeners.length = 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      handlerForUpdate = new MessageHandler(mockSettingsManager as any, mockSupabaseWriter as any, mockSupabaseReader as any);
      void handlerForUpdate;
    });

    it('updateMemo メッセージで SupabaseWriter.updateMemo() が呼ばれる (Req 6.3)', async () => {
      mockUpdateMemo.mockResolvedValue({ success: true });

      const sendResponse = jest.fn();
      const result = dispatchUpdateMessage(
        { type: 'updateMemo', payload: { id: 'rec-1', memo: '新しいメモ' } },
        sendResponse
      );
      expect(result).toBe(true);

      await new Promise((r) => setTimeout(r, 0));
      expect(mockUpdateMemo).toHaveBeenCalledWith('rec-1', '新しいメモ');
      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });

    it('updateMemo 失敗時もエラーレスポンスが返される (Req 6.5)', async () => {
      mockUpdateMemo.mockResolvedValue({
        success: false,
        error: { code: 'NETWORK_ERROR', message: '更新エラー', recoveryHint: '再試行' },
      });

      const sendResponse = jest.fn();
      dispatchUpdateMessage(
        { type: 'updateMemo', payload: { id: 'rec-1', memo: 'メモ' } },
        sendResponse
      );

      await new Promise((r) => setTimeout(r, 0));
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: false })
      );
    });
  });

  // ── deleteHighlight メッセージハンドラー (Req 6.4) ───────────────────────────

  describe('deleteHighlight メッセージの処理 (Req 6.4)', () => {
    let handlerForDelete: MessageHandler;

    function dispatchDeleteMessage(
      message: ExtensionMessage,
      sendResponse: (response?: unknown) => void = jest.fn()
    ): boolean | void {
      const listener = registeredListeners[registeredListeners.length - 1];
      if (!listener) throw new Error('リスナーが登録されていません');
      return listener(message, mockSender, sendResponse);
    }

    beforeEach(() => {
      jest.clearAllMocks();
      registeredListeners.length = 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      handlerForDelete = new MessageHandler(mockSettingsManager as any, mockSupabaseWriter as any, mockSupabaseReader as any);
      void handlerForDelete;
    });

    it('deleteHighlight メッセージで SupabaseWriter.deleteRecord() が呼ばれる (Req 6.4)', async () => {
      mockDeleteRecord.mockResolvedValue({ success: true });

      const sendResponse = jest.fn();
      const result = dispatchDeleteMessage(
        { type: 'deleteHighlight', payload: { id: 'rec-1' } },
        sendResponse
      );
      expect(result).toBe(true);

      await new Promise((r) => setTimeout(r, 0));
      expect(mockDeleteRecord).toHaveBeenCalledWith('rec-1');
      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });

    it('deleteHighlight 失敗時もエラーレスポンスが返される (Req 6.5)', async () => {
      mockDeleteRecord.mockResolvedValue({
        success: false,
        error: { code: 'NETWORK_ERROR', message: '削除エラー', recoveryHint: '再試行' },
      });

      const sendResponse = jest.fn();
      dispatchDeleteMessage(
        { type: 'deleteHighlight', payload: { id: 'rec-1' } },
        sendResponse
      );

      await new Promise((r) => setTimeout(r, 0));
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: false })
      );
    });
  });
});
