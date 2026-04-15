/**
 * Service Worker エントリポイント
 * タスク 3.1: service workerバックグラウンドオーケストレーションを配線
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2
 *
 * Chrome拡張機能のメインバックグラウンドプロセス。
 * ContextMenuHandler、MessageHandler、SettingsManager、SupabaseWriter を
 * 一元的に初期化・調整します。
 *
 * Manifest V3 のライフサイクル:
 * - モジュールレベルの初期化: service worker がアクティベートされるたびに実行
 * - onInstalled: 拡張機能のインストール/更新時に発火
 * - onStartup: ブラウザ起動時に発火
 */

import { ContextMenuHandler } from './context-menu-handler';
import { MessageHandler } from './message-handler';
import { SettingsManager } from './settings-manager';
import { SupabaseWriter } from './supabase-writer';

// ── コンポーネント初期化（モジュールレベル） ──────────────────────────────────────
// Manifest V3 では service worker がイベントごとにアクティベートされるため、
// モジュールレベルで初期化することで各アクティベーション時に確実に初期化される

/** MessageHandler: Content Script ↔ Service Worker 間のメッセージルーティング */
const messageHandler = new MessageHandler();

/** SettingsManager: Supabase 認証情報の永続化管理 */
const settingsManager = new SettingsManager();

/** SupabaseWriter: Supabase への INSERT 操作 */
const supabaseWriter = new SupabaseWriter();

/** ContextMenuHandler: Chrome コンテキストメニュー統合 */
const contextMenuHandler = new ContextMenuHandler();

// ── Manifest V3 ライフサイクルイベント ────────────────────────────────────────────

/**
 * 拡張機能インストール/更新時のハンドラー
 * Requirement 1.1: コンテキストメニューの登録
 */
chrome.runtime.onInstalled.addListener(() => {
  contextMenuHandler.register();
});

/**
 * ブラウザ起動時のハンドラー
 * Requirement 1.1: ブラウザ再起動後もコンテキストメニューを再登録
 */
chrome.runtime.onStartup.addListener(() => {
  contextMenuHandler.register();
});

// ── コンポーネント間の配線 ────────────────────────────────────────────────────────

/**
 * テキスト選択状態の変化をコンテキストメニューの有効/無効に接続する
 * Requirement 1.1: 選択テキストがある場合にメニューを有効化
 * Requirement 1.4: 選択テキストがない場合にメニューを無効化
 */
messageHandler.onSelectionChange((hasSelection: boolean) => {
  contextMenuHandler.updateMenuState(hasSelection);
});

// タスク 3.3 でオプションページと設定管理の配線が完成する。
// export によりコンポーネントは将来の配線で参照可能になる。
export { contextMenuHandler, messageHandler, settingsManager, supabaseWriter };
