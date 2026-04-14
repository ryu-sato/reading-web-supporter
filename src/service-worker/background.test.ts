/**
 * Service Worker エントリポイント background.ts のユニットテスト
 * タスク 3.1: service workerバックグラウンドオーケストレーションを配線
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2
 * - 拡張機能起動時に全コンポーネントが初期化される
 * - onInstalled / onStartup でコンテキストメニューが登録される
 * - すべての chrome イベントリスナーが適切に登録される
 */

// ── chrome API モック（他のテストと同様のパターン） ─────────────────────────────

type InstalledListener = (details: chrome.runtime.InstalledDetails) => void;
type StartupListener = () => void;
type MessageListener = (
  message: unknown,
  sender: Record<string, unknown>,
  sendResponse: (response?: unknown) => void
) => boolean | void;
type OnClickedListener = (
  info: chrome.contextMenus.OnClickData,
  tab?: chrome.tabs.Tab
) => void;

const registeredInstalledListeners: InstalledListener[] = [];
const registeredStartupListeners: StartupListener[] = [];
const registeredMessageListeners: MessageListener[] = [];
const registeredOnClickedListeners: OnClickedListener[] = [];

const mockContextMenusCreate = jest.fn();
const mockContextMenusUpdate = jest.fn();
const mockNotificationsCreate = jest.fn();

(global as unknown as { chrome: unknown }).chrome = {
  runtime: {
    onInstalled: {
      addListener: jest.fn((listener: InstalledListener) => {
        registeredInstalledListeners.push(listener);
      }),
    },
    onStartup: {
      addListener: jest.fn((listener: StartupListener) => {
        registeredStartupListeners.push(listener);
      }),
    },
    onMessage: {
      addListener: jest.fn((listener: MessageListener) => {
        registeredMessageListeners.push(listener);
      }),
    },
    sendMessage: jest.fn().mockResolvedValue(undefined),
  },
  contextMenus: {
    create: mockContextMenusCreate,
    update: mockContextMenusUpdate,
    onClicked: {
      addListener: jest.fn((listener: OnClickedListener) => {
        registeredOnClickedListeners.push(listener);
      }),
      removeListener: jest.fn(),
    },
  },
  notifications: {
    create: mockNotificationsCreate,
  },
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn(),
      remove: jest.fn(),
    },
  },
};

// ── コンポーネントモック ─────────────────────────────────────────────────────────

const mockRegister = jest.fn();
const mockContextMenuHandlerConstructor = jest.fn().mockImplementation(() => ({
  register: mockRegister,
}));

const mockMessageHandlerConstructor = jest.fn().mockImplementation(() => ({}));
const mockSettingsManagerConstructor = jest.fn().mockImplementation(() => ({}));
const mockSupabaseWriterConstructor = jest.fn().mockImplementation(() => ({}));

jest.mock('./context-menu-handler', () => ({
  ContextMenuHandler: mockContextMenuHandlerConstructor,
}));

jest.mock('./message-handler', () => ({
  MessageHandler: mockMessageHandlerConstructor,
}));

jest.mock('./settings-manager', () => ({
  SettingsManager: mockSettingsManagerConstructor,
}));

jest.mock('./supabase-writer', () => ({
  SupabaseWriter: mockSupabaseWriterConstructor,
}));

// ── テストスイート ──────────────────────────────────────────────────────────────

describe('background.ts - Service Worker オーケストレーション', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    registeredInstalledListeners.length = 0;
    registeredStartupListeners.length = 0;
    registeredMessageListeners.length = 0;
    registeredOnClickedListeners.length = 0;

    // background.ts をリセットして再インポートするためにモジュールキャッシュをクリア
    jest.resetModules();

    // モックを再設定
    jest.mock('./context-menu-handler', () => ({
      ContextMenuHandler: mockContextMenuHandlerConstructor,
    }));
    jest.mock('./message-handler', () => ({
      MessageHandler: mockMessageHandlerConstructor,
    }));
    jest.mock('./settings-manager', () => ({
      SettingsManager: mockSettingsManagerConstructor,
    }));
    jest.mock('./supabase-writer', () => ({
      SupabaseWriter: mockSupabaseWriterConstructor,
    }));

    // background.ts を import してモジュールレベルの初期化を実行
    require('./background');
  });

  // ── コンポーネント初期化 ──────────────────────────────────────────────────────

  describe('コンポーネント初期化 (Req 1.1, 1.2, 2.1, 2.2)', () => {
    it('ContextMenuHandler がインスタンス化される', () => {
      expect(mockContextMenuHandlerConstructor).toHaveBeenCalledTimes(1);
    });

    it('MessageHandler がインスタンス化される', () => {
      expect(mockMessageHandlerConstructor).toHaveBeenCalledTimes(1);
    });

    it('SettingsManager がインスタンス化される', () => {
      expect(mockSettingsManagerConstructor).toHaveBeenCalledTimes(1);
    });

    it('SupabaseWriter がインスタンス化される', () => {
      expect(mockSupabaseWriterConstructor).toHaveBeenCalledTimes(1);
    });
  });

  // ── ライフサイクルイベントリスナー登録 ─────────────────────────────────────────

  describe('ライフサイクルイベントリスナー登録', () => {
    it('chrome.runtime.onInstalled にリスナーが登録される', () => {
      expect(registeredInstalledListeners.length).toBeGreaterThan(0);
    });

    it('chrome.runtime.onStartup にリスナーが登録される', () => {
      expect(registeredStartupListeners.length).toBeGreaterThan(0);
    });
  });

  // ── onInstalled でのコンテキストメニュー登録 ────────────────────────────────────

  describe('onInstalled イベント (Req 1.1)', () => {
    it('onInstalled 発火時に ContextMenuHandler.register() が呼ばれる', () => {
      // onInstalled を発火
      registeredInstalledListeners.forEach((listener) =>
        listener({ reason: 'install', previousVersion: undefined } as chrome.runtime.InstalledDetails)
      );

      expect(mockRegister).toHaveBeenCalledTimes(1);
    });
  });

  // ── onStartup でのコンテキストメニュー登録 ─────────────────────────────────────

  describe('onStartup イベント (Req 1.1)', () => {
    it('onStartup 発火時に ContextMenuHandler.register() が呼ばれる', () => {
      // onStartup を発火
      registeredStartupListeners.forEach((listener) => listener());

      expect(mockRegister).toHaveBeenCalledTimes(1);
    });
  });

  // ── 両イベントでの登録 ────────────────────────────────────────────────────────

  describe('onInstalled と onStartup の両方 (Req 1.1)', () => {
    it('onInstalled と onStartup の両方で register() が呼ばれる', () => {
      registeredInstalledListeners.forEach((listener) =>
        listener({ reason: 'install', previousVersion: undefined } as chrome.runtime.InstalledDetails)
      );
      registeredStartupListeners.forEach((listener) => listener());

      expect(mockRegister).toHaveBeenCalledTimes(2);
    });
  });
});
