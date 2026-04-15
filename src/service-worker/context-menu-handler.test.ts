/**
 * ContextMenuHandler のユニットテスト
 * タスク 2.4: 保存操作用のコンテキストメニューハンドラーを構築
 *
 * Requirements: 1.1, 1.3, 1.4
 * - chrome.contextMenus.create() でメニュー登録
 * - onClicked イベントで info.selectionText を使って保存操作を実行
 * - テキスト未選択時にエラー通知
 * - 保存成功/失敗を chrome.notifications でユーザーに通知
 */

import { ContextMenuHandler } from './context-menu-handler';
import type { SaveResult } from '../types/types';

// ── chrome API モック ──────────────────────────────────────────────────────────

type OnClickedListener = (
  info: { menuItemId: string; selectionText?: string; pageUrl: string; editable: boolean },
  tab?: unknown
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
  runtime: {
    getURL: (path: string) => `chrome-extension://test-id/${path}`,
  },
};

// ── SupabaseWriter モック ──────────────────────────────────────────────────────

const mockSave = jest.fn<Promise<SaveResult>, [unknown]>();

jest.mock('./supabase-writer', () => ({
  SupabaseWriter: jest.fn().mockImplementation(() => ({
    save: mockSave,
  })),
}));

// ── ヘルパー: onClicked イベントを発火する ────────────────────────────────────

function dispatchOnClicked(
  info: { menuItemId?: string; selectionText?: string; pageUrl?: string } = {}
): void {
  const fullInfo = {
    menuItemId: info.menuItemId ?? 'save-to-supabase',
    selectionText: info.selectionText,
    pageUrl: info.pageUrl ?? 'https://example.com',
    editable: false,
  };
  const listener = registeredOnClickedListeners[registeredOnClickedListeners.length - 1];
  if (!listener) throw new Error('onClicked リスナーが登録されていません');
  listener(fullInfo);
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

    it('SupabaseWriter が初期化される', () => {
      const { SupabaseWriter } = jest.requireMock('./supabase-writer');
      expect(handler).toBeInstanceOf(ContextMenuHandler);
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
    it('selectionText が空のとき SupabaseWriter.save() が呼ばれない', async () => {
      dispatchOnClicked({ selectionText: '' });
      await Promise.resolve();
      expect(mockSave).not.toHaveBeenCalled();
    });

    it('selectionText が未定義のとき SupabaseWriter.save() が呼ばれない', async () => {
      dispatchOnClicked({ selectionText: undefined });
      await Promise.resolve();
      expect(mockSave).not.toHaveBeenCalled();
    });

    it('"No text selected" 通知が表示される', async () => {
      dispatchOnClicked({ selectionText: '' });
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
      mockSave.mockResolvedValue({
        success: true,
        data: { id: 'test-uuid', created_at: '2026-04-13T00:00:00.000Z' },
      });
    });

    it('SupabaseWriter.save() が info.selectionText と info.pageUrl で呼ばれる (Req 1.3)', async () => {
      dispatchOnClicked({
        selectionText: '重要なテキスト',
        pageUrl: 'https://example.com/blog',
      });
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
      dispatchOnClicked({ selectionText: '重要なテキスト' });
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

      dispatchOnClicked({ selectionText: 'エラーになるテキスト' });
      await Promise.resolve();

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

      dispatchOnClicked({ selectionText: 'テキスト' });
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

      dispatchOnClicked({ selectionText: 'テキスト' });
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
      dispatchOnClicked({ menuItemId: 'other-menu-item', selectionText: 'テキスト' });
      await Promise.resolve();

      expect(mockSave).not.toHaveBeenCalled();
      expect(mockNotificationsCreate).not.toHaveBeenCalled();
    });
  });

  // ── updateMenuState ─────────────────────────────────────────────────────────

  describe('updateMenuState() - コンテキストメニュー状態管理 (Req 1.1, 1.4)', () => {
    it('hasSelection: true の場合、chrome.contextMenus.update でメニューを有効化する (Req 1.1)', () => {
      handler.updateMenuState(true);

      expect(mockContextMenusUpdate).toHaveBeenCalledTimes(1);
      expect(mockContextMenusUpdate).toHaveBeenCalledWith(
        'save-to-supabase',
        { enabled: true }
      );
    });

    it('hasSelection: false の場合、chrome.contextMenus.update でメニューを無効化する (Req 1.4)', () => {
      handler.updateMenuState(false);

      expect(mockContextMenusUpdate).toHaveBeenCalledTimes(1);
      expect(mockContextMenusUpdate).toHaveBeenCalledWith(
        'save-to-supabase',
        { enabled: false }
      );
    });
  });

  // ── 通知の構造 ──────────────────────────────────────────────────────────────

  describe('通知の構造', () => {
    it('通知には type, iconUrl, title, message が含まれる', async () => {
      dispatchOnClicked({ selectionText: '' });
      await Promise.resolve();

      expect(mockNotificationsCreate).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          type: 'basic',
          iconUrl: expect.stringContaining('icons/icon-128.png'),
          title: expect.any(String),
          message: expect.any(String),
        })
      );
    });
  });
});
