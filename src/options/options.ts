/**
 * Options Page スクリプト
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
 *
 * Supabase認証情報の入力・保存・疎通確認を行う設定画面のロジック。
 * chrome.runtime.sendMessage を介して Service Worker (MessageHandler) と通信する。
 * Options Page は SettingsManager を直接インポートしない（責務分離）。
 */

import type { SupabaseCredentials } from '../types/types';

// テスト環境でも参照できるようにグローバルchrome APIを型宣言
declare const chrome: {
  runtime: {
    sendMessage(message: unknown): Promise<unknown>;
  };
};

/**
 * フォームから認証情報を取得する
 */
function getFormCredentials(): SupabaseCredentials {
  const projectUrl = (document.getElementById('project-url') as HTMLInputElement)?.value ?? '';
  const anonKey = (document.getElementById('anon-key') as HTMLInputElement)?.value ?? '';
  return { projectUrl, anonKey };
}

/**
 * ステータスメッセージを表示する
 */
function showStatus(message: string, isError = false): void {
  const statusEl = document.getElementById('status');
  if (statusEl) {
    statusEl.textContent = message;
    statusEl.className = isError ? 'status error' : 'status success';
  }
}

/**
 * 既存の認証情報をフォームに事前入力する
 * Requirement 3.3: ブラウザを再起動しても設定が維持される
 *
 * chrome.runtime.sendMessage({type: 'getCredentials'}) で Service Worker に問い合わせる
 */
async function loadExistingCredentials(): Promise<void> {
  const creds = (await chrome.runtime.sendMessage({ type: 'getCredentials' })) as SupabaseCredentials | null;

  if (creds) {
    const urlInput = document.getElementById('project-url') as HTMLInputElement | null;
    const keyInput = document.getElementById('anon-key') as HTMLInputElement | null;
    if (urlInput) urlInput.value = creds.projectUrl;
    if (keyInput) keyInput.value = creds.anonKey;
  }
}

/**
 * 認証情報を保存する
 * Requirement 3.1: Supabase認証情報を入力・保存できる設定画面
 * Requirement 3.4: 認証情報変更時に即座に反映
 *
 * chrome.runtime.sendMessage({type: 'setCredentials', payload: creds}) で Service Worker に送信する
 */
async function saveCredentials(): Promise<void> {
  const creds = getFormCredentials();

  if (!creds.projectUrl || !creds.anonKey) {
    showStatus('プロジェクトURLとAPIキーを入力してください', true);
    return;
  }

  const result = (await chrome.runtime.sendMessage({
    type: 'setCredentials',
    payload: creds,
  })) as { success: boolean; error?: string };

  if (!result.success) {
    showStatus(result.error ?? '設定の保存に失敗しました', true);
    return;
  }

  showStatus('設定を保存しました');
}

/**
 * 接続テストを実行する
 * Requirement 3.2: 接続先Supabaseへの疎通確認を行い、結果をユーザーに表示
 *
 * chrome.runtime.sendMessage({type: 'testConnection'}) で Service Worker に送信する
 */
async function testConnection(): Promise<void> {
  showStatus('接続テスト中...');

  const result = (await chrome.runtime.sendMessage({ type: 'testConnection' })) as {
    success: boolean;
    message: string;
  };

  if (!result.success) {
    showStatus(result.message, true);
    return;
  }

  showStatus(result.message);
}

// DOM初期化
document.addEventListener('DOMContentLoaded', () => {
  loadExistingCredentials();

  document.getElementById('save-btn')?.addEventListener('click', saveCredentials);
  document.getElementById('test-btn')?.addEventListener('click', testConnection);
});

export { getFormCredentials, loadExistingCredentials, saveCredentials, showStatus, testConnection };
