/**
 * ContextMenuHandler のユニットテスト
 * タスク 2.4: 保存操作用のコンテキストメニューハンドラーを構築
 *
 * Requirements: 1.1, 1.3, 1.4
 * - chrome.contextMenus.create() でメニュー登録
 * - onClicked イベントで保存操作を実行
 * - テキスト未選択時にエラー通知
 * - 保存成功/失敗を chrome.notifications でユーザーに通知
 */

import { ContextMenuHandler } from './context-menu-handler';
import type { SaveResult } from '../types/types';

// ── chrome API モック ──────────────────────────────────────────────────────────

type OnClickedListener = (
  info: chrome.contextMenus.OnClickData,
  tab?: chrome.tabs.Tab
) => void;

const registeredOnClickedListeners: OnClickedListener[] = [];

const mockContextMenusCreate = jest.fn();
const mockContextMenusUpdate = jest.fn();
const mockNotificationsCreate = jest.fn();

const mockOnClicked = {
  addListener: jest.fn((listener: OnClickedListener) => {
    registeredOnClickedListeners.push(listener);
  }),
  removeListener: jest.fn((listener: OnClickedListener) => {
    const idx = registeredOnClickedListeners.indexOf(listener);
    if (idx !== -1) registeredOnClickedListeners.splice(idx, 1);
  }),
};

(global as unknown as { chrome: unknown }).chrome = {
  contextMenus: {
    create: mockContextMenusCreate,
    update: mockContextMenusUpdate,
    onClicked: mockOnClicked,
  },
  notifications: {
    create: mockNotificationsCreate,
  },
};

// ── MessageHandler モック ──────────────────────────────────────────────────────

const mockGetCurrentSelection = jest.fn();

jest.mock('./message-handler', () => ({
  MessageHandler: jest.fn().mockImplementation(() => ({
    getCurrentSelection: mockGetCurrentSelection,
  })),
}));

// ── SupabaseWriter モック ──────────────────────────────────────────────────────

const mockSave = jest.fn<Promise<SaveResult>, [unknown]>();

jest.mock('./supabase-writer', () => ({
  SupabaseWriter: jest.fn().mockImplementation(() => ({
    save: mockSave,
  })),
}));

// ── ヘルパー: onClicked イベントを発火する ────────────────────────────────────

function dispatchOnClicked(
  info: Partial<chrome.contextMenus.OnClickData> = {},
  tab?: chrome.tabs.Tab
): void {
  const defaultInfo: chrome.contextMenus.OnClickData = {
    menuItemId: 'save-to-supabase',
    editable: false,
    pageUrl: '',
    ...info,
  };
  const listener = registeredOnClickedListeners[registeredOnClickedListeners.length - 1];
  if (!listener) throw new Error('onClicked リスナーが登録されていません');
  listener(defaultInfo, tab);
}

// ── テストスイート ──────────────────────────────────────────────────────────────

describe('ContextMenuHandler', () => {
  let handler: ContextMenuHandler;

  beforeEach(() => {
    jest.clearAllMocks();
    registeredOnClickedListeners.length = 0;
    handler = new ContextMenuHandler();
  });

  // ── 初期化 ──────────────────────────────────────────────────────────────────

  describe('初期化', () => {
    it('chrome.contextMenus.onClicked.addListener が呼ばれる', () => {
      expect(mockOnClicked.addListener).toHaveBeenCalledTimes(1);
    });

    it('MessageHandler と SupabaseWriter を依存注入で受け取ることができる', () => {
      const { MessageHandler } = jest.requireMock('./message-handler');
      const { SupabaseWriter } = jest.requireMock('./supabase-writer');
      expect(handler).toBeInstanceOf(ContextMenuHandler);
      expect(MessageHandler).toHaveBeenCalled();
      expect(SupabaseWriter).toHaveBeenCalled();
    });
  });

  // ── register() ──────────────────────────────────────────────────────────────

  describe('register()', () => {
    it('chrome.contextMenus.create() が正しいパラメータで呼ばれる (Req 1.1)', () => {
      handler.register();

      expect(mockContextMenusCreate).toHaveBeenCalledTimes(1);
      expect(mockContextMenusCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'save-to-supabase',
          title: 'Save to Supabase',
          contexts: ['selection'],
          documentUrlPatterns: ['<all_urls>'],
        })
      );
    });

    it('register() を複数回呼んでも chrome.contextMenus.create() は都度呼ばれる', () => {
      handler.register();
      handler.register();
      expect(mockContextMenusCreate).toHaveBeenCalledTimes(2);
    });
  });

  // ── onClicked: テキスト未選択 ───────────────────────────────────────────────

  describe('onClicked - テキスト未選択の場合 (Req 1.4)', () => {
    beforeEach(() => {
      mockGetCurrentSelection.mockReturnValue({
        selectedText: '',
        pageUrl: 'https://example.com',
        hasSelection: false,
      });
    });

    it('SupabaseWriter.save() が呼ばれない', async () => {
      dispatchOnClicked({ menuItemId: 'save-to-supabase' });
      // 非同期処理の完了を待つ
      await Promise.resolve();
      expect(mockSave).not.toHaveBeenCalled();
    });

    it('"No text selected" 通知が表示される', async () => {
      dispatchOnClicked({ menuItemId: 'save-to-supabase' });
      await Promise.resolve();

      expect(mockNotificationsCreate).toHaveBeenCalledTimes(1);
      expect(mockNotificationsCreate).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          message: expect.stringContaining('No text selected'),
        })
      );
    });
  });

  // ── onClicked: 保存成功 ──────────────────────────────────────────────────────

  describe('onClicked - 保存成功の場合 (Req 1.3)', () => {
    beforeEach(() => {
      mockGetCurrentSelection.mockReturnValue({
        selectedText: '重要なテキスト',
        pageUrl: 'https://example.com/blog',
        hasSelection: true,
      });
      mockSave.mockResolvedValue({
        success: true,
        data: { id: 'test-uuid', created_at: '2026-04-13T00:00:00.000Z' },
      });
    });

    it('SupabaseWriter.save() が選択テキストと URL で呼ばれる (Req 1.3)', async () => {
      dispatchOnClicked({ menuItemId: 'save-to-supabase' });
      await Promise.resolve();

      expect(mockSave).toHaveBeenCalledTimes(1);
      expect(mockSave).toHaveBeenCalledWith(
        expect.objectContaining({
          selectedText: '重要なテキスト',
          pageUrl: 'https://example.com/blog',
          timestamp: expect.any(String),
        })
      );
    });

    it('"Saved to Supabase" 成功通知が表示される (Req 1.3)', async () => {
      dispatchOnClicked({ menuItemId: 'save-to-supabase' });
      await Promise.resolve();

      expect(mockNotificationsCreate).toHaveBeenCalledTimes(1);
      expect(mockNotificationsCreate).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          message: expect.stringContaining('Saved to Supabase'),
        })
      );
    });
  });

  // ── onClicked: 保存失敗 ──────────────────────────────────────────────────────

  describe('onClicked - 保存失敗の場合 (Req 1.3, 1.4)', () => {
    beforeEach(() => {
      mockGetCurrentSelection.mockReturnValue({
        selectedText: 'エラーになるテキスト',
        pageUrl: 'https://example.com/blog',
        hasSelection: true,
      });
    });

    it('エラーメッセージを含む通知が表示される (Req 1.3)', async () => {
      const errorMessage = 'Supabase認証情報が設定されていません。';
      mockSave.mockResolvedValue({
        success: false,
        error: {
          code: 'NO_CREDENTIALS',
          message: errorMessage,
          recoveryHint: '設定画面でProject URLとAnon Keyを入力してください。',
        },
      });

      dispatchOnClicked({ menuItemId: 'save-to-supabase' });
      await Promise.resolve();

      expect(mockNotificationsCreate).toHaveBeenCalledTimes(1);
      expect(mockNotificationsCreate).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          message: expect.stringContaining(errorMessage),
        })
      );
    });

    it('NETWORK_ERROR の場合もエラー通知が表示される', async () => {
      mockSave.mockResolvedValue({
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: 'ネットワークエラーが発生しました。',
          recoveryHint: 'インターネット接続を確認してください。',
        },
      });

      dispatchOnClicked({ menuItemId: 'save-to-supabase' });
      await Promise.resolve();

      expect(mockNotificationsCreate).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          message: expect.stringContaining('ネットワークエラーが発生しました。'),
        })
      );
    });

    it('save() が例外をスローした場合もエラー通知が表示される', async () => {
      mockSave.mockRejectedValue(new Error('予期しない例外'));

      dispatchOnClicked({ menuItemId: 'save-to-supabase' });
      // Promiseの解決を待つ
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockNotificationsCreate).toHaveBeenCalledTimes(1);
      expect(mockNotificationsCreate).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          message: expect.any(String),
        })
      );
    });
  });

  // ── onClicked: 別のメニュー項目 ─────────────────────────────────────────────

  describe('onClicked - 別のメニュー項目の場合', () => {
    it('save-to-supabase 以外の menuItemId は無視される', async () => {
      mockGetCurrentSelection.mockReturnValue({
        selectedText: 'テキスト',
        pageUrl: 'https://example.com',
        hasSelection: true,
      });

      dispatchOnClicked({ menuItemId: 'other-menu-item' });
      await Promise.resolve();

      expect(mockSave).not.toHaveBeenCalled();
      expect(mockNotificationsCreate).not.toHaveBeenCalled();
    });
  });

  // ── 通知の構造 ──────────────────────────────────────────────────────────────

  describe('通知の構造', () => {
    it('通知には type, iconUrl, title, message が含まれる', async () => {
      mockGetCurrentSelection.mockReturnValue({
        selectedText: 'テキスト',
        pageUrl: 'https://example.com',
        hasSelection: false,
      });

      dispatchOnClicked({ menuItemId: 'save-to-supabase' });
      await Promise.resolve();

      expect(mockNotificationsCreate).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          type: 'basic',
          title: expect.any(String),
          message: expect.any(String),
        })
      );
    });
  });
});
