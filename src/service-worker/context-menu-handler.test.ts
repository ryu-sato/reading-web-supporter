/**
 * ContextMenuHandler のユニットテスト
 * タスク 2.4: 保存操作用のコンテキストメニューハンドラーを構築
 * タスク 10.2: showMemoInput メッセージ送信対応
 *
 * Requirements: 1.1, 1.3, 1.4, 5.1
 * - chrome.contextMenus.create() でメニュー登録
 * - onClicked イベントで chrome.tabs.sendMessage({ type: 'showMemoInput', ... }) を送信
 * - テキスト未選択時は chrome.tabs.sendMessage が呼ばれない
 * - SupabaseWriter の直接呼び出しが除去されている
 */

import { ContextMenuHandler } from './context-menu-handler';

// ── chrome API モック ──────────────────────────────────────────────────────────

type OnClickedListener = (
  info: { menuItemId: string; selectionText?: string; pageUrl: string; editable: boolean },
  tab?: { id?: number }
) => void;

const registeredOnClickedListeners: OnClickedListener[] = [];

const mockContextMenusCreate = jest.fn();
const mockContextMenusUpdate = jest.fn();
const mockNotificationsCreate = jest.fn();
const mockTabsSendMessage = jest.fn();

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
  tabs: {
    sendMessage: mockTabsSendMessage,
  },
};

// ── SupabaseWriter モック（使われないことを確認するため残す） ─────────────────

const mockSave = jest.fn();

jest.mock('./supabase-writer', () => ({
  SupabaseWriter: jest.fn().mockImplementation(() => ({
    save: mockSave,
  })),
}));

// ── ヘルパー: onClicked イベントを発火する ────────────────────────────────────

function dispatchOnClicked(
  info: { menuItemId?: string; selectionText?: string; pageUrl?: string } = {},
  tab: { id?: number } = { id: 42 }
): void {
  const fullInfo = {
    menuItemId: info.menuItemId ?? 'save-to-supabase',
    selectionText: info.selectionText,
    pageUrl: info.pageUrl ?? 'https://example.com',
    editable: false,
  };
  const listener = registeredOnClickedListeners[registeredOnClickedListeners.length - 1];
  if (!listener) throw new Error('onClicked リスナーが登録されていません');
  listener(fullInfo, tab);
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

    it('ContextMenuHandler のインスタンスが生成される', () => {
      expect(handler).toBeInstanceOf(ContextMenuHandler);
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

  // ── onClicked: showMemoInput メッセージ送信（Req 5.1）────────────────────────

  describe('onClicked - showMemoInput メッセージ送信 (Req 5.1)', () => {
    it('テキスト選択時に chrome.tabs.sendMessage が showMemoInput で呼ばれる', async () => {
      dispatchOnClicked({ selectionText: '重要なテキスト', pageUrl: 'https://example.com/blog' }, { id: 42 });
      await Promise.resolve();

      expect(mockTabsSendMessage).toHaveBeenCalledTimes(1);
      expect(mockTabsSendMessage).toHaveBeenCalledWith(42, {
        type: 'showMemoInput',
        payload: {
          selectedText: '重要なテキスト',
          pageUrl: 'https://example.com/blog',
        },
      });
    });

    it('SupabaseWriter.save() は直接呼ばれない (Req 5.1)', async () => {
      dispatchOnClicked({ selectionText: '重要なテキスト' }, { id: 42 });
      await Promise.resolve();

      expect(mockSave).not.toHaveBeenCalled();
    });

    it('tab.id が正しく sendMessage に渡される', async () => {
      dispatchOnClicked({ selectionText: 'テキスト' }, { id: 99 });
      await Promise.resolve();

      expect(mockTabsSendMessage).toHaveBeenCalledWith(99, expect.objectContaining({ type: 'showMemoInput' }));
    });
  });

  // ── onClicked: テキスト未選択 ───────────────────────────────────────────────

  describe('onClicked - テキスト未選択の場合 (Req 1.4)', () => {
    it('selectionText が空のとき chrome.tabs.sendMessage が呼ばれない', async () => {
      dispatchOnClicked({ selectionText: '' });
      await Promise.resolve();
      expect(mockTabsSendMessage).not.toHaveBeenCalled();
    });

    it('selectionText が未定義のとき chrome.tabs.sendMessage が呼ばれない', async () => {
      dispatchOnClicked({ selectionText: undefined });
      await Promise.resolve();
      expect(mockTabsSendMessage).not.toHaveBeenCalled();
    });

    it('selectionText が空のとき SupabaseWriter.save() が呼ばれない', async () => {
      dispatchOnClicked({ selectionText: '' });
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

  // ── onClicked: 別のメニュー項目 ─────────────────────────────────────────────

  describe('onClicked - 別のメニュー項目の場合', () => {
    it('save-to-supabase 以外の menuItemId は無視される', async () => {
      dispatchOnClicked({ menuItemId: 'other-menu-item', selectionText: 'テキスト' });
      await Promise.resolve();

      expect(mockTabsSendMessage).not.toHaveBeenCalled();
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

  // ── 通知の構造（テキスト未選択時） ─────────────────────────────────────────

  describe('通知の構造', () => {
    it('通知には type, iconUrl, title, message が含まれる（テキスト未選択時）', async () => {
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
