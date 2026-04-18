/**
 * エンドツーエンド統合テスト
 * タスク 4.2: エンドツーエンドテストシナリオ
 * Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4, 3.5
 *
 * 本テストは複数のコンポーネントが連携する完全なユーザーフローを検証します。
 * - 外部依存（Chrome API、Supabase クライアント）はモック
 * - 内部コンポーネント（MessageHandler、SettingsManager、SupabaseWriter、ContextMenuHandler）は実装を使用
 */

import { ContextMenuHandler } from '../../src/service-worker/context-menu-handler';
import { MessageHandler } from '../../src/service-worker/message-handler';
import { SettingsManager } from '../../src/service-worker/settings-manager';
import { SupabaseWriter } from '../../src/service-worker/supabase-writer';
import { createClient } from '@supabase/supabase-js';

// ── Chrome API モックのセットアップ ──────────────────────────────────────────────

/** chrome.storage.local の模擬データストア */
const mockStorageData: Record<string, unknown> = {};

/** ContextMenuHandler.onClicked で登録されたリスナー */
let capturedClickListener:
  | ((info: Record<string, unknown>, tab?: Record<string, unknown>) => void)
  | null = null;

/** MessageHandler.onMessage で登録されたリスナー */
let capturedMessageListener:
  | ((
      message: Record<string, unknown>,
      sender: Record<string, unknown>,
      sendResponse: (response: unknown) => void
    ) => boolean | void)
  | null = null;

/** Supabase insert モック */
const mockInsert = jest.fn();
/** Supabase from モック */
const mockFrom = jest.fn();
/** createClient モック参照 */
const mockCreateClient = createClient as jest.Mock;

/** chrome.contextMenus API モック */
const mockContextMenus = {
  create: jest.fn(),
  update: jest.fn(),
  onClicked: {
    addListener: jest.fn((listener: (info: Record<string, unknown>, tab?: Record<string, unknown>) => void) => {
      capturedClickListener = listener;
    }),
    removeListener: jest.fn(),
  },
};

/** chrome.notifications API モック */
const mockNotifications = {
  create: jest.fn(),
};

/** chrome.storage API モック */
const mockStorage = {
  local: {
    get: jest.fn(
      (keys: string | string[], callback: (result: Record<string, unknown>) => void) => {
        if (typeof keys === 'string') {
          callback({ [keys]: mockStorageData[keys] });
        } else {
          const result: Record<string, unknown> = {};
          (keys as string[]).forEach((k) => {
            result[k] = mockStorageData[k];
          });
          callback(result);
        }
      }
    ),
    set: jest.fn((items: Record<string, unknown>, callback?: () => void) => {
      Object.assign(mockStorageData, items);
      if (callback) callback();
    }),
    remove: jest.fn((keys: string | string[], callback?: () => void) => {
      if (typeof keys === 'string') {
        delete mockStorageData[keys];
      } else {
        (keys as string[]).forEach((k) => delete mockStorageData[k]);
      }
      if (callback) callback();
    }),
  },
};

/** chrome.runtime API モック */
const mockRuntime = {
  sendMessage: jest.fn().mockResolvedValue(undefined),
  lastError: undefined,
  getURL: jest.fn((path: string) => `chrome-extension://test/${path}`),
  onMessage: {
    addListener: jest.fn(
      (
        listener: (
          message: Record<string, unknown>,
          sender: Record<string, unknown>,
          sendResponse: (response: unknown) => void
        ) => boolean | void
      ) => {
        capturedMessageListener = listener;
      }
    ),
  },
  onInstalled: { addListener: jest.fn() },
  onStartup: { addListener: jest.fn() },
};

/** chrome.tabs API モック */
const mockTabs = {
  sendMessage: jest.fn(),
};

// グローバル chrome オブジェクトをセットアップ
(global as unknown as { chrome: unknown }).chrome = {
  contextMenus: mockContextMenus,
  notifications: mockNotifications,
  storage: mockStorage,
  runtime: mockRuntime,
  tabs: mockTabs,
};

// ── テスト用ヘルパー ──────────────────────────────────────────────────────────────

/** 有効なテスト用認証情報 */
const VALID_CREDENTIALS = {
  projectUrl: 'https://test-project.supabase.co',
  anonKey: 'test-anon-key-that-is-long-enough-for-validation-purpose',
};

/** テスト用のストレージキー（SettingsManager の定数と同じ） */
const STORAGE_KEY = 'supabse_credentials';

/**
 * テスト用認証情報をストレージに事前設定する
 */
function setUpCredentials(creds = VALID_CREDENTIALS): void {
  mockStorageData[STORAGE_KEY] = {
    ...creds,
    lastVerified: '2026-04-16T00:00:00.000Z',
  };
}

/**
 * 非同期処理（マイクロタスクキュー）を十分に消化するまで待機する
 *
 * 本プロジェクトの非同期チェーン（getCredentials → withTimeout → Promise.race → .finally など）は
 * 約7〜10 マイクロタスクの深さがあるため、余裕を持って 15 回繰り返す。
 * Promise.resolve() は タイマー API を使用しないため、jest.useFakeTimers() 下でも動作する。
 */
async function flushPromises(): Promise<void> {
  for (let i = 0; i < 15; i++) {
    await Promise.resolve();
  }
}

// ── SupabaseWriter のデフォルトモック設定 ──────────────────────────────────────────

/** 各テスト前に Supabase モックを成功状態にリセットする */
function resetSupabaseMock(): void {
  mockInsert.mockResolvedValue({
    data: [{ id: 'test-uuid', created_at: '2026-04-16T00:00:00.000Z' }],
    error: null,
  });
  mockFrom.mockReturnValue({ insert: mockInsert });
  mockCreateClient.mockReturnValue({ from: mockFrom });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Suite 1: テキスト選択 → コンテキストメニュー → 保存の完全フロー
// Requirements: 1.1, 1.2, 1.3, 2.1
// ═══════════════════════════════════════════════════════════════════════════════

describe('Suite 1: テキスト選択 → コンテキストメニュー → 保存フロー', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(mockStorageData).forEach((k) => delete mockStorageData[k]);
    capturedClickListener = null;
    resetSupabaseMock();

    // ContextMenuHandler を生成（onClicked リスナーが登録される）
    setUpCredentials();
    new ContextMenuHandler();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('テキスト選択後に保存操作を実行すると、showMemoInput メッセージが Content Script へ送信される (Req 1.2, 5.1)', async () => {
    // タスク 10.2: ContextMenuHandler は直接 Supabase に INSERT せず
    // chrome.tabs.sendMessage で showMemoInput メッセージを Content Script へ送信する
    expect(capturedClickListener).not.toBeNull();

    // コンテキストメニューのクリックイベントをシミュレート（tab.id 付き）
    capturedClickListener!(
      {
        menuItemId: 'save-to-supabase',
        selectionText: 'テスト選択テキスト',
        pageUrl: 'https://example.com/blog/post',
      },
      { id: 100 }
    );

    await flushPromises();

    // Supabase は直接呼ばれない（MemoInputUI → saveSelection のフローで実行）
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();

    // chrome.tabs.sendMessage で showMemoInput が正しいデータで送信されたことを確認
    expect(mockTabs.sendMessage).toHaveBeenCalledWith(
      100,
      expect.objectContaining({
        type: 'showMemoInput',
        payload: expect.objectContaining({
          selectedText: 'テスト選択テキスト',
          pageUrl: 'https://example.com/blog/post',
        }),
      })
    );
  });

  it('showMemoInput メッセージには selectedText と pageUrl が含まれる (Req 2.1, 5.1)', async () => {
    // タスク 10.2: メッセージのペイロードに正しいフィールドが含まれることを確認
    expect(capturedClickListener).not.toBeNull();

    capturedClickListener!(
      {
        menuItemId: 'save-to-supabase',
        selectionText: 'タイムスタンプ確認テキスト',
        pageUrl: 'https://example.com/article',
      },
      { id: 101 }
    );

    await flushPromises();

    expect(mockTabs.sendMessage).toHaveBeenCalledWith(
      101,
      expect.objectContaining({
        type: 'showMemoInput',
        payload: expect.objectContaining({
          selectedText: 'タイムスタンプ確認テキスト',
          pageUrl: 'https://example.com/article',
        }),
      })
    );
  });

  it('コンテキストメニュークリック時に chrome.tabs.sendMessage が呼ばれる (Req 1.3, 5.1)', async () => {
    // タスク 10.2: 保存成功通知は MemoInputUI 経由で実行されるため、
    // ContextMenuHandler では showMemoInput 送信のみを確認する
    expect(capturedClickListener).not.toBeNull();

    capturedClickListener!(
      {
        menuItemId: 'save-to-supabase',
        selectionText: '保存対象テキスト',
        pageUrl: 'https://example.com/page',
      },
      { id: 102 }
    );

    await flushPromises();

    // showMemoInput メッセージが送信されたことを確認
    expect(mockTabs.sendMessage).toHaveBeenCalledTimes(1);
    expect(mockTabs.sendMessage).toHaveBeenCalledWith(
      102,
      expect.objectContaining({ type: 'showMemoInput' })
    );
    // 直接 Supabase へ書き込まれない（通知も表示されない）
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockNotifications.create).not.toHaveBeenCalled();
  });

  it('「Save to Supabase」以外のメニューItemId は処理されない', async () => {
    expect(capturedClickListener).not.toBeNull();

    capturedClickListener!({
      menuItemId: 'other-menu-item',
      selectionText: '無視されるテキスト',
      pageUrl: 'https://example.com',
    });

    await flushPromises();

    // 別のメニュー項目のクリックは処理されない
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockNotifications.create).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Suite 2: 設定構成フロー（Options Page ↔ MessageHandler ↔ SettingsManager）
// Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
// ═══════════════════════════════════════════════════════════════════════════════

describe('Suite 2: 設定構成 → 認証情報入力 → 接続テスト → 永続化フロー', () => {
  let settingsManager: SettingsManager;
  let supabaseWriter: SupabaseWriter;

  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(mockStorageData).forEach((k) => delete mockStorageData[k]);
    capturedMessageListener = null;
    resetSupabaseMock();

    // 実際のコンポーネントを生成（MessageHandler が onMessage リスナーを登録する）
    settingsManager = new SettingsManager();
    supabaseWriter = new SupabaseWriter();
    new MessageHandler(settingsManager, supabaseWriter);
  });

  it('setCredentials メッセージで認証情報を保存できる (Req 3.1, 3.3)', async () => {
    expect(capturedMessageListener).not.toBeNull();

    const sendResponse = jest.fn();
    capturedMessageListener!(
      { type: 'setCredentials', payload: VALID_CREDENTIALS },
      {},
      sendResponse
    );

    await flushPromises();

    // 正常保存の確認
    expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    // chrome.storage.local.set が呼ばれた確認
    expect(mockStorage.local.set).toHaveBeenCalledTimes(1);
    // 実際にストレージに保存されているか確認
    const stored = mockStorageData[STORAGE_KEY] as Record<string, unknown>;
    expect(stored).toBeDefined();
    expect(stored.projectUrl).toBe(VALID_CREDENTIALS.projectUrl);
    expect(stored.anonKey).toBe(VALID_CREDENTIALS.anonKey);
  });

  it('保存した認証情報が getCredentials メッセージで取得できる (Req 3.3)', async () => {
    expect(capturedMessageListener).not.toBeNull();

    // まず認証情報を保存する
    const setSendResponse = jest.fn();
    capturedMessageListener!(
      { type: 'setCredentials', payload: VALID_CREDENTIALS },
      {},
      setSendResponse
    );
    await flushPromises();

    // 保存された認証情報を取得する
    const getSendResponse = jest.fn();
    capturedMessageListener!(
      { type: 'getCredentials' },
      {},
      getSendResponse
    );
    await flushPromises();

    expect(getSendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        projectUrl: VALID_CREDENTIALS.projectUrl,
        anonKey: VALID_CREDENTIALS.anonKey,
      })
    );
  });

  it('testConnection メッセージで接続テスト結果が返る (Req 3.2)', async () => {
    expect(capturedMessageListener).not.toBeNull();

    // 事前に認証情報を設定
    setUpCredentials();

    // Supabase testConnection のモック設定（select チェーン）
    const mockLimit = jest.fn().mockResolvedValue({ data: [], error: null });
    const mockSelect = jest.fn().mockReturnValue({ limit: mockLimit });
    mockFrom.mockReturnValue({ select: mockSelect, insert: mockInsert });

    const sendResponse = jest.fn();
    capturedMessageListener!(
      { type: 'testConnection' },
      {},
      sendResponse
    );

    await flushPromises();

    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({ success: true })
    );
  });

  it('認証情報を変更すると新しい設定が即座に反映される (Req 3.4)', async () => {
    expect(capturedMessageListener).not.toBeNull();

    // 初期認証情報を保存
    const firstSendResponse = jest.fn();
    capturedMessageListener!(
      { type: 'setCredentials', payload: VALID_CREDENTIALS },
      {},
      firstSendResponse
    );
    await flushPromises();

    // 更新した認証情報を保存
    const updatedCreds = {
      projectUrl: 'https://new-project.supabase.co',
      anonKey: 'updated-anon-key-that-is-long-enough-for-validation',
    };
    const secondSendResponse = jest.fn();
    capturedMessageListener!(
      { type: 'setCredentials', payload: updatedCreds },
      {},
      secondSendResponse
    );
    await flushPromises();

    // 最新の認証情報を取得して確認
    const getSendResponse = jest.fn();
    capturedMessageListener!(
      { type: 'getCredentials' },
      {},
      getSendResponse
    );
    await flushPromises();

    expect(getSendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        projectUrl: 'https://new-project.supabase.co',
        anonKey: updatedCreds.anonKey,
      })
    );
  });

  it('認証情報保存後に状態変更通知（credentialsUpdated）が送信される (Req 3.4)', async () => {
    expect(capturedMessageListener).not.toBeNull();

    const sendResponse = jest.fn();
    capturedMessageListener!(
      { type: 'setCredentials', payload: VALID_CREDENTIALS },
      {},
      sendResponse
    );

    await flushPromises();

    // chrome.runtime.sendMessage で credentialsUpdated が通知された確認
    expect(mockRuntime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'credentialsUpdated' })
    );
  });

  it('無効な URL 形式の認証情報は保存を拒否される (Req 3.5)', async () => {
    expect(capturedMessageListener).not.toBeNull();

    const invalidCreds = {
      projectUrl: 'http://not-https.supabase.co', // HTTP は不可
      anonKey: VALID_CREDENTIALS.anonKey,
    };

    const sendResponse = jest.fn();
    capturedMessageListener!(
      { type: 'setCredentials', payload: invalidCreds },
      {},
      sendResponse
    );

    await flushPromises();

    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    );
    // ストレージには保存されていないことを確認
    expect(mockStorage.local.set).not.toHaveBeenCalled();
  });

  it('40文字未満の API キーは保存を拒否される (Req 3.5)', async () => {
    expect(capturedMessageListener).not.toBeNull();

    const invalidCreds = {
      projectUrl: VALID_CREDENTIALS.projectUrl,
      anonKey: 'too-short',
    };

    const sendResponse = jest.fn();
    capturedMessageListener!(
      { type: 'setCredentials', payload: invalidCreds },
      {},
      sendResponse
    );

    await flushPromises();

    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    );
    expect(mockStorage.local.set).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Suite 3: エラーシナリオ
// Requirements: 1.4, 2.2, 2.3, 3.5
// ═══════════════════════════════════════════════════════════════════════════════

describe('Suite 3: エラーシナリオ', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(mockStorageData).forEach((k) => delete mockStorageData[k]);
    capturedClickListener = null;
    capturedMessageListener = null;
    resetSupabaseMock();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('空のテキスト選択 (Req 1.4)', () => {
    it('テキストが選択されていない状態で保存を試みると Supabase は呼ばれずエラー通知が表示される', async () => {
      setUpCredentials();
      new ContextMenuHandler();
      expect(capturedClickListener).not.toBeNull();

      // selectionText が空のクリックイベントをシミュレート
      capturedClickListener!({
        menuItemId: 'save-to-supabase',
        selectionText: '',
        pageUrl: 'https://example.com',
      });

      await flushPromises();

      // Supabase には書き込まれない
      expect(mockInsert).not.toHaveBeenCalled();
      // エラー通知が表示される
      expect(mockNotifications.create).toHaveBeenCalledTimes(1);
      const [_id, options] = mockNotifications.create.mock.calls[0];
      expect(options.message).toContain('No text selected');
    });

    it('selectionText が undefined の場合もエラー通知が表示される', async () => {
      setUpCredentials();
      new ContextMenuHandler();
      expect(capturedClickListener).not.toBeNull();

      // selectionText がないクリックイベントをシミュレート
      capturedClickListener!({
        menuItemId: 'save-to-supabase',
        pageUrl: 'https://example.com',
      });

      await flushPromises();

      expect(mockInsert).not.toHaveBeenCalled();
      expect(mockNotifications.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('認証情報未設定 (Req 2.3)', () => {
    it('認証情報が未設定でも、ContextMenuHandler は showMemoInput を送信する（保存検証は MemoInputUI → MessageHandler フローで行われる）', async () => {
      // タスク 10.2: ContextMenuHandler は認証情報をチェックしない。
      // showMemoInput を送信するのみ。実際の認証情報チェックは
      // MemoInputUI からの saveSelection メッセージを MessageHandler が処理する際に行われる (Req 2.3)
      new ContextMenuHandler();
      expect(capturedClickListener).not.toBeNull();

      capturedClickListener!(
        {
          menuItemId: 'save-to-supabase',
          selectionText: '認証情報なしのテキスト',
          pageUrl: 'https://example.com',
        },
        { id: 200 }
      );

      await flushPromises();

      // Supabase クライアントは ContextMenuHandler から直接呼ばれない
      expect(mockFrom).not.toHaveBeenCalled();
      // showMemoInput メッセージが送信される
      expect(mockTabs.sendMessage).toHaveBeenCalledWith(
        200,
        expect.objectContaining({ type: 'showMemoInput' })
      );
    });
  });

  describe('ネットワーク障害 (Req 2.2)', () => {
    it('ネットワーク障害時でも ContextMenuHandler は showMemoInput を送信する（リトライは SupabaseWriter が担当）', async () => {
      // タスク 10.2: ContextMenuHandler は Supabase を直接呼ばないため、
      // ネットワーク障害の影響を受けない。ネットワークエラーとリトライは
      // SupabaseWriter が担当し、MessageHandler 経由で呼ばれる (Req 2.2)
      setUpCredentials();
      new ContextMenuHandler();
      expect(capturedClickListener).not.toBeNull();

      capturedClickListener!(
        {
          menuItemId: 'save-to-supabase',
          selectionText: 'ネットワークエラーテスト',
          pageUrl: 'https://example.com',
        },
        { id: 201 }
      );

      await flushPromises();

      // ContextMenuHandler は Supabase を直接呼ばない
      expect(mockInsert).not.toHaveBeenCalled();
      // showMemoInput メッセージが正常に送信される
      expect(mockTabs.sendMessage).toHaveBeenCalledWith(
        201,
        expect.objectContaining({ type: 'showMemoInput' })
      );
    });
  });

  describe('無効な認証情報（AUTH_FAILED） (Req 3.5)', () => {
    it('認証情報が設定されていても ContextMenuHandler は showMemoInput を送信する（認証検証は MessageHandler フローで行われる）', async () => {
      // タスク 10.2: ContextMenuHandler は認証情報の有効性をチェックしない。
      // AUTH_FAILED エラーは MessageHandler が saveSelection を処理する際に SupabaseWriter から返される (Req 3.5)
      setUpCredentials();
      new ContextMenuHandler();
      expect(capturedClickListener).not.toBeNull();

      capturedClickListener!(
        {
          menuItemId: 'save-to-supabase',
          selectionText: '認証エラーテスト',
          pageUrl: 'https://example.com',
        },
        { id: 202 }
      );

      await flushPromises();

      // Supabase INSERT は直接実行されない
      expect(mockInsert).not.toHaveBeenCalled();
      // showMemoInput メッセージが送信される
      expect(mockTabs.sendMessage).toHaveBeenCalledWith(
        202,
        expect.objectContaining({ type: 'showMemoInput' })
      );
    });
  });

  describe('データベースエラー (Req 2.2)', () => {
    it('ContextMenuHandler は showMemoInput を送信するのみで、DB エラーは SupabaseWriter が処理する', async () => {
      // タスク 10.2: ContextMenuHandler は直接 Supabase を呼ばないため DB エラーの影響を受けない。
      // DB エラー（RLS ポリシー違反など）は SupabaseWriter.save() が返す SaveResult で通知される (Req 2.2)

      // SupabaseWriter が RLS エラーを返すように設定（ContextMenuHandler には影響しない）
      mockInsert.mockResolvedValue({
        data: null,
        error: {
          code: '42501',
          message: 'permission denied for table readings',
          status: 403,
        },
      });
      mockFrom.mockReturnValue({ insert: mockInsert });
      mockCreateClient.mockReturnValue({ from: mockFrom });

      setUpCredentials();
      new ContextMenuHandler();
      expect(capturedClickListener).not.toBeNull();

      capturedClickListener!(
        {
          menuItemId: 'save-to-supabase',
          selectionText: 'RLSエラーテスト',
          pageUrl: 'https://example.com',
        },
        { id: 203 }
      );

      await flushPromises();

      // ContextMenuHandler は Supabase を直接呼ばない（DB エラーに影響されない）
      expect(mockInsert).not.toHaveBeenCalled();
      // showMemoInput メッセージは正常に送信される
      expect(mockTabs.sendMessage).toHaveBeenCalledWith(
        203,
        expect.objectContaining({ type: 'showMemoInput' })
      );
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Suite 4: テキスト選択状態の伝播（Content Script → Service Worker）
// Requirements: 1.1, 1.4
// ═══════════════════════════════════════════════════════════════════════════════

describe('Suite 4: テキスト選択状態の伝播フロー', () => {
  let messageHandler: MessageHandler;

  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(mockStorageData).forEach((k) => delete mockStorageData[k]);
    capturedMessageListener = null;
    capturedClickListener = null;
    resetSupabaseMock();

    // MessageHandler と ContextMenuHandler を協調させる（background.ts と同様の配線）
    const settingsManager = new SettingsManager();
    const supabaseWriter = new SupabaseWriter();
    messageHandler = new MessageHandler(settingsManager, supabaseWriter);
    const contextMenuHandler = new ContextMenuHandler();

    // background.ts と同様に選択状態の変化をコンテキストメニューに接続する
    messageHandler.onSelectionChange((hasSelection: boolean) => {
      contextMenuHandler.updateMenuState(hasSelection);
    });
  });

  it('textSelectionUpdated メッセージを受信すると選択状態が MessageHandler に保持される (Req 1.1)', () => {
    expect(capturedMessageListener).not.toBeNull();

    // Content Script からの選択通知をシミュレート
    capturedMessageListener!(
      {
        type: 'textSelectionUpdated',
        payload: {
          selectedText: '選択されたテキスト',
          pageUrl: 'https://example.com',
          hasSelection: true,
        },
      },
      {},
      jest.fn()
    );

    // 選択状態が正しく保持されているか確認
    const selection = messageHandler.getCurrentSelection();
    expect(selection.selectedText).toBe('選択されたテキスト');
    expect(selection.hasSelection).toBe(true);
  });

  it('テキスト選択ありの通知を受けるとコンテキストメニューが有効化される (Req 1.1)', () => {
    expect(capturedMessageListener).not.toBeNull();

    capturedMessageListener!(
      {
        type: 'textSelectionUpdated',
        payload: {
          selectedText: 'テキスト',
          pageUrl: 'https://example.com',
          hasSelection: true,
        },
      },
      {},
      jest.fn()
    );

    // メニュー有効化が呼ばれた確認
    expect(mockContextMenus.update).toHaveBeenCalledWith(
      'save-to-supabase',
      expect.objectContaining({ enabled: true })
    );
  });

  it('テキスト選択なしの通知を受けるとコンテキストメニューが無効化される (Req 1.4)', () => {
    expect(capturedMessageListener).not.toBeNull();

    capturedMessageListener!(
      {
        type: 'textSelectionUpdated',
        payload: {
          selectedText: '',
          pageUrl: 'https://example.com',
          hasSelection: false,
        },
      },
      {},
      jest.fn()
    );

    // メニュー無効化が呼ばれた確認
    expect(mockContextMenus.update).toHaveBeenCalledWith(
      'save-to-supabase',
      expect.objectContaining({ enabled: false })
    );
  });

  it('getSelection メッセージで保持している選択状態を取得できる (Req 1.2)', () => {
    expect(capturedMessageListener).not.toBeNull();

    // 選択状態を設定
    capturedMessageListener!(
      {
        type: 'textSelectionUpdated',
        payload: {
          selectedText: '取得確認テキスト',
          pageUrl: 'https://example.com/article',
          hasSelection: true,
        },
      },
      {},
      jest.fn()
    );

    // getSelection で状態を取得
    const sendResponse = jest.fn();
    capturedMessageListener!(
      { type: 'getSelection' },
      {},
      sendResponse
    );

    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedText: '取得確認テキスト',
        pageUrl: 'https://example.com/article',
        hasSelection: true,
      })
    );
  });
});
