/**
 * ContextMenuHandler: Chrome コンテキストメニュー統合
 * タスク 2.4: 保存操作用のコンテキストメニューハンドラーを構築
 * タスク 10.2: showMemoInput メッセージ送信対応
 *
 * Requirements: 1.1, 1.3, 1.4, 5.1
 * - chrome.contextMenus.create() でメニュー登録
 * - onClicked イベントで showMemoInput メッセージを Content Script へ送信
 * - テキスト未選択時にエラー通知
 */

/** コンテキストメニューの ID */
const MENU_ITEM_ID = 'save-to-supabase';

/** アプリ名（通知タイトル用） */
const APP_TITLE = 'Reading Web Supporter';

// テスト環境でも参照できるようにグローバル chrome API を型宣言
declare const chrome: {
  contextMenus: {
    create(properties: {
      id: string;
      title: string;
      contexts: string[];
      documentUrlPatterns: string[];
    }): void;
    update(id: string, properties: Record<string, unknown>): void;
    onClicked: {
      addListener(
        listener: (
          info: chrome.contextMenus.OnClickData,
          tab?: chrome.tabs.Tab
        ) => void
      ): void;
      removeListener(
        listener: (
          info: chrome.contextMenus.OnClickData,
          tab?: chrome.tabs.Tab
        ) => void
      ): void;
    };
  };
  notifications: {
    create(
      notificationId: string,
      options: {
        type: string;
        iconUrl: string;
        title: string;
        message: string;
      }
    ): void;
  };
  runtime: {
    getURL(path: string): string;
  };
  tabs: {
    sendMessage(tabId: number, message: unknown): void;
  };
};

/**
 * Chrome コンテキストメニュー統合を管理するクラス
 *
 * Requirement 1.1: テキスト選択後、右クリックメニューに「Save to Supabase」を表示
 * Requirement 1.4: テキスト未選択時にエラー通知を表示
 * Requirement 5.1: onClicked イベントで showMemoInput メッセージを Content Script へ送信
 */
export class ContextMenuHandler {
  private readonly boundOnClicked: (
    info: chrome.contextMenus.OnClickData,
    tab?: chrome.tabs.Tab
  ) => void;

  constructor() {
    this.boundOnClicked = this.handleOnClicked.bind(this);
    chrome.contextMenus.onClicked.addListener(this.boundOnClicked);
  }

  /**
   * コンテキストメニュー項目を登録する
   * Requirement 1.1: 選択テキストのコンテキストメニューに保存オプションを表示
   */
  register(): void {
    chrome.contextMenus.create({
      id: MENU_ITEM_ID,
      title: 'Save to Supabase',
      contexts: ['selection'],
      documentUrlPatterns: ['<all_urls>'],
    });
  }

  /**
   * chrome.contextMenus.onClicked イベントハンドラー
   */
  private handleOnClicked(
    info: chrome.contextMenus.OnClickData,
    tab?: chrome.tabs.Tab
  ): void {
    // 対象のメニュー項目のみ処理する
    if (info.menuItemId !== MENU_ITEM_ID) {
      return;
    }

    // 非同期処理を起動（Promise はハンドラー内でキャッチ済み）
    this.processMenuClick(info, tab).catch(() => {
      // processMenuClick 内でエラーはすべてキャッチされているため、ここには到達しない
    });
  }

  /**
   * メニュークリック後の処理
   *
   * Requirement 5.1: SupabaseWriter.save() を直接呼ばず、
   * chrome.tabs.sendMessage で showMemoInput メッセージを Content Script へ送信する
   */
  private async processMenuClick(
    info: chrome.contextMenus.OnClickData,
    tab?: chrome.tabs.Tab
  ): Promise<void> {
    const selectedText = info.selectionText ?? '';
    const pageUrl = info.pageUrl ?? '';

    // テキスト未選択の場合はエラー通知を表示して終了 (Req 1.4)
    if (!selectedText) {
      this.showNotification('error', 'No text selected', 'No text selected. Please select text before saving.');
      return;
    }

    // showMemoInput メッセージを Content Script へ送信 (Req 5.1)
    const tabId = tab?.id;
    if (tabId !== undefined) {
      chrome.tabs.sendMessage(tabId, {
        type: 'showMemoInput',
        payload: {
          selectedText,
          pageUrl,
        },
      });
    }
  }

  /**
   * 選択状態に応じてコンテキストメニュー項目を有効/無効化する
   * MessageHandler からの選択状態変化通知を受けて呼び出される
   *
   * Requirement 1.1: テキスト選択時にメニューを有効化
   * Requirement 1.4: テキスト未選択時にメニューを無効化
   */
  updateMenuState(hasSelection: boolean): void {
    chrome.contextMenus.update(MENU_ITEM_ID, { enabled: hasSelection });
  }

  /**
   * Chrome 通知を表示する
   */
  private showNotification(
    _type: 'success' | 'error',
    title: string,
    message: string
  ): void {
    const notificationId = `reading-supporter-${Date.now()}`;
    chrome.notifications.create(notificationId, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
      title: `${APP_TITLE}: ${title}`,
      message,
    });
  }
}
