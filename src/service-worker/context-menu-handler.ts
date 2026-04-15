/**
 * ContextMenuHandler: Chrome コンテキストメニュー統合
 * タスク 2.4: 保存操作用のコンテキストメニューハンドラーを構築
 *
 * Requirements: 1.1, 1.3, 1.4
 * - chrome.contextMenus.create() でメニュー登録
 * - onClicked イベントで保存操作を実行
 * - テキスト未選択時にエラー通知
 * - 保存成功/失敗を chrome.notifications でユーザーに通知
 */

import { MessageHandler } from './message-handler';
import { SupabaseWriter } from './supabase-writer';
import type { SaveTextOptions } from '../types/types';

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
};

/**
 * Chrome コンテキストメニュー統合を管理するクラス
 *
 * Requirement 1.1: テキスト選択後、右クリックメニューに「Save to Supabase」を表示
 * Requirement 1.3: 保存完了/失敗をユーザーに通知
 * Requirement 1.4: テキスト未選択時にエラー通知を表示
 */
export class ContextMenuHandler {
  private readonly messageHandler: MessageHandler;
  private readonly writer: SupabaseWriter;
  private readonly boundOnClicked: (
    info: chrome.contextMenus.OnClickData,
    tab?: chrome.tabs.Tab
  ) => void;

  constructor() {
    this.messageHandler = new MessageHandler();
    this.writer = new SupabaseWriter();
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
    _tab?: chrome.tabs.Tab
  ): void {
    // 対象のメニュー項目のみ処理する
    if (info.menuItemId !== MENU_ITEM_ID) {
      return;
    }

    // 非同期処理を起動（Promise はハンドラー内でキャッチ済み）
    this.processMenuClick().catch(() => {
      // processMenuClick 内でエラーはすべてキャッチされているため、ここには到達しない
    });
  }

  /**
   * メニュークリック後の非同期保存処理
   */
  private async processMenuClick(): Promise<void> {
    const selection = this.messageHandler.getCurrentSelection();

    // テキスト未選択の場合はエラー通知を表示して終了
    if (!selection.hasSelection || selection.selectedText === '') {
      this.showNotification('error', 'No text selected', 'No text selected. Please select text before saving.');
      return;
    }

    const options: SaveTextOptions = {
      selectedText: selection.selectedText,
      pageUrl: selection.pageUrl,
      timestamp: new Date().toISOString(),
    };

    try {
      const result = await this.writer.save(options);

      if (result.success) {
        this.showNotification('success', 'Saved to Supabase', 'Saved to Supabase successfully.');
      } else {
        const message = result.error?.message ?? 'Failed to save.';
        this.showNotification('error', 'Save Failed', message);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.showNotification('error', 'Save Failed', `An unexpected error occurred: ${message}`);
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
