/**
 * Options Page スクリプト
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
 *
 * Supabase認証情報の入力・保存・疎通確認を行う設定画面のロジック。
 */

import type { SupabaseCredentials } from '../types/types';

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
 */
async function loadExistingCredentials(): Promise<void> {
  const result = await chrome.storage.local.get('supabase_credentials');
  const creds = result['supabase_credentials'] as SupabaseCredentials | null;

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
 */
async function saveCredentials(): Promise<void> {
  const creds = getFormCredentials();

  if (!creds.projectUrl || !creds.anonKey) {
    showStatus('プロジェクトURLとAPIキーを入力してください', true);
    return;
  }

  // SettingsManagerへの委譲はタスク1.5で実装
  await chrome.storage.local.set({ supabase_credentials: creds });
  showStatus('設定を保存しました');
}

/**
 * 接続テストを実行する
 * Requirement 3.2: 接続先Supabaseへの疎通確認を行い、結果をユーザーに表示
 */
async function testConnection(): Promise<void> {
  showStatus('接続テスト中...');
  // SupabaseWriterへの委譲はタスク1.4で実装
  showStatus('接続テスト機能は準備中です', true);
}

// DOM初期化
document.addEventListener('DOMContentLoaded', () => {
  loadExistingCredentials();

  document.getElementById('save-btn')?.addEventListener('click', saveCredentials);
  document.getElementById('test-btn')?.addEventListener('click', testConnection);
});

export { getFormCredentials, loadExistingCredentials, saveCredentials, showStatus, testConnection };
