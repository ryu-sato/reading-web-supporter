/**
 * 共有TypeScript型定義
 * Requirements: 1.1, 1.2, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4, 3.5
 */

/** ISO8601形式の日時文字列 */
export type ISO8601 = string;

/**
 * Content Script から Service Worker へ送信するテキスト選択メッセージ
 * Requirement 1.1: テキスト選択後、右クリックメニューに保存オプション表示
 */
export interface TextSelectionMessage {
  type: 'textSelectionUpdated';
  payload: {
    selectedText: string;   // window.getSelection().toString()
    pageUrl: string;        // window.location.href
    hasSelection: boolean;  // selectedText.length > 0
  };
}

/**
 * Supabase認証情報
 * Requirement 3.1: SupabaseプロジェクトURL・APIキー（anon key）を入力・保存できる設定画面
 * Requirement 3.3: 保存した認証情報をブラウザのセキュアなローカルストレージに保持
 */
export interface SupabaseCredentials {
  projectUrl: string;  // e.g., https://xxx.supabase.co
  anonKey: string;     // Public role API key
}

/**
 * Supabaseへの保存オプション
 * Requirement 2.1: 選択テキスト・ページURL・記録日時をSupabaseの指定テーブルへ書き込む
 */
export interface SaveTextOptions {
  selectedText: string;
  pageUrl: string;
  timestamp: ISO8601;  // e.g., new Date().toISOString()
}

/**
 * 保存操作の結果
 * Requirement 1.3: 保存が正常に完了した場合、ユーザーに保存成功のフィードバックを表示
 * Requirement 2.2: Supabaseへの書き込みが失敗した場合、ユーザーにエラーメッセージを表示
 */
export interface SaveResult {
  success: boolean;
  data?: {
    id: string;
    created_at: ISO8601;
  };
  error?: {
    code: 'NO_CREDENTIALS' | 'AUTH_FAILED' | 'NETWORK_ERROR' | 'DB_ERROR' | 'UNKNOWN';
    message: string;
    recoveryHint: string;
  };
}

/**
 * SupabaseWriterサービスインターフェース
 */
export interface SupabaseWriterService {
  save(options: SaveTextOptions): Promise<SaveResult>;
  testConnection(): Promise<{ success: boolean; message: string }>;
}

/**
 * ページ上の保存済みテキスト取得オプション
 * Requirement 4.1: ページロード時、保存済みテキストを Supabase から取得
 */
export interface FetchHighlightsOptions {
  pageUrl: string;
}

/**
 * SupabaseReaderサービスインターフェース
 * Requirement 4.1, 4.5: 保存済みテキストの取得
 */
export interface SupabaseReaderService {
  fetchSavedTexts(options: FetchHighlightsOptions): Promise<HighlightsResponse>;
}

/**
 * SettingsManagerサービスインターフェース
 * Requirement 3.1-3.5: 認証情報の管理
 */
export interface SettingsManagerService {
  getCredentials(): Promise<SupabaseCredentials | null>;
  setCredentials(creds: SupabaseCredentials): Promise<{ success: boolean; error?: string }>;
  isConfigured(): Promise<boolean>;
  testConnection(): Promise<{ success: boolean; message: string }>;
}

/**
 * Chrome Storage の状態スキーマ
 */
export interface StorageState {
  supabase_credentials: {
    projectUrl: string;
    anonKey: string;
    lastVerified: ISO8601;  // 最後に成功した接続テストの日時
  } | null;
}

/**
 * ContextMenu の設定
 * Requirement 1.1: コンテキストメニューに保存オプション表示
 */
export interface ContextMenuData {
  id: 'save-to-supabase';
  title: 'Save to Supabase';
  contexts: chrome.contextMenus.ContextType[];
  documentUrlPatterns: string[];
}

/**
 * ContextMenuクリック時の情報
 */
export interface OnClickedInfo {
  menuItemId: string;
  selectionText: string;  // ページからユーザーが選択したテキスト
  pageUrl: string;
}

/**
 * ページ上の保存済みテキスト取得リクエスト
 * Requirement 4.1: ページロード時、保存済みテキストを Supabase から取得
 */
export interface GetHighlightsMessage {
  type: 'getHighlights';
  payload: {
    pageUrl: string;  // window.location.href
  };
}

/**
 * 保存済みテキスト取得の結果
 * Requirement 4.1, 4.2: 保存済みテキストのリストを返す
 */
export interface HighlightsResponse {
  success: boolean;
  texts?: string[];  // 保存済みテキストの配列
  error?: {
    code: 'NO_CREDENTIALS' | 'AUTH_FAILED' | 'NETWORK_ERROR' | 'DB_ERROR' | 'UNKNOWN';
    message: string;
  };
}

/**
 * Chrome Runtime メッセージの共用体型
 */
export type ExtensionMessage =
  | TextSelectionMessage
  | { type: 'getSelection' }
  | { type: 'saveSelection'; payload: SaveTextOptions }
  | { type: 'getCredentials' }
  | { type: 'setCredentials'; payload: SupabaseCredentials }
  | { type: 'testConnection' }
  | { type: 'isConfigured' }
  | GetHighlightsMessage;
