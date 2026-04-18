/**
 * Content Script エントリポイント
 * タスク 7.2: HighlightController 統合
 *
 * 責務: DOM 操作モジュール（TextSelector, HighlightController）の初期化・オーケストレーション
 *
 * 実行順序:
 * 1. TextSelector: ページ上のテキスト選択を監視し、Service Worker へ通知
 * 2. HighlightController: DOMContentLoaded 後、保存済みテキストを取得し、DOM にハイライト表示
 */

import { initTextSelector } from './text-selector';
import { HighlightController } from './highlight-controller';
import { initMemoInputUI } from './memo-input-ui';

/**
 * Content Script メインロジック
 *
 * 実行される順序:
 * - モジュールロード時に TextSelector が自動初期化
 * - HighlightController が DOMContentLoaded イベントを監視して自動初期化
 */
function initializeContentScript(): void {
  // 1. TextSelector を初期化（テキスト選択の監視を開始）
  initTextSelector();

  // 2. HighlightController をインスタンス化（DOMContentLoaded 後に保存済みテキストを取得・ハイライト）
  new HighlightController();

  // 3. MemoInputUI を初期化（showMemoInput メッセージのリスナーを登録）
  initMemoInputUI();
}

// Content Script として実行された場合に初期化
if (typeof document !== 'undefined') {
  initializeContentScript();
}

export { initializeContentScript };
