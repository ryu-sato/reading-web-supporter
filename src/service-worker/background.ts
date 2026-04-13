/**
 * Service Worker エントリポイント
 * Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3
 *
 * Chrome拡張機能のメインバックグラウンドプロセス。
 * Context Menu、Supabase通信、設定管理を統合します。
 */

import type { ExtensionMessage, TextSelectionMessage } from '../types/types';

/** 現在の選択状態をメモリに保持 */
let currentSelection: TextSelectionMessage['payload'] = {
  selectedText: '',
  pageUrl: '',
  hasSelection: false,
};

/**
 * Context Menuの初期化
 * Requirement 1.1: コンテキストメニューに保存オプション表示
 */
function initContextMenu(): void {
  chrome.contextMenus.create({
    id: 'save-to-supabase',
    title: 'Save to Supabase',
    contexts: ['selection'],
    documentUrlPatterns: ['<all_urls>'],
  });
}

/**
 * メッセージハンドラー
 */
function handleMessage(
  message: ExtensionMessage,
  _sender: chrome.runtime.MessageSender,
  _sendResponse: (response?: unknown) => void
): boolean {
  if (message.type === 'textSelectionUpdated') {
    currentSelection = message.payload;
    // テキスト未選択時はコンテキストメニューを非表示
    // Manifest V3ではenabled/disabledの動的変更が可能
  }
  return false;
}

/**
 * Context Menuクリックハンドラー
 * Requirement 1.2: 保存操作実行時、URL + テキストをSupabase送信
 * Requirement 1.4: テキスト未選択時に保存操作を無効化またはエラーメッセージを表示
 */
async function handleContextMenuClick(
  info: chrome.contextMenus.OnClickData,
  _tab?: chrome.tabs.Tab
): Promise<void> {
  if (info.menuItemId !== 'save-to-supabase') return;

  const selectionText = info.selectionText ?? currentSelection.selectedText;
  const pageUrl = _tab?.url ?? currentSelection.pageUrl;

  if (!selectionText || selectionText.trim().length === 0) {
    // Requirement 1.4: テキスト未選択時のエラー処理
    console.warn('[ReadingSupporter] テキストが選択されていません');
    return;
  }

  // SupabaseWriterへの委譲はタスク1.4で実装
  console.info('[ReadingSupporter] 保存開始:', { selectionText, pageUrl });
}

// Service Worker初期化
chrome.runtime.onInstalled.addListener(() => {
  initContextMenu();
});

chrome.runtime.onStartup.addListener(() => {
  initContextMenu();
});

chrome.contextMenus.onClicked.addListener(handleContextMenuClick);
chrome.runtime.onMessage.addListener(handleMessage);

export { handleContextMenuClick, handleMessage, initContextMenu };
