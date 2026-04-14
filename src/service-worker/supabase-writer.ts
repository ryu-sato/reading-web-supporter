/**
 * SupabaseWriter: Supabase への INSERT操作・エラーハンドリング・リトライロジック
 * Requirements: 1.2, 1.3, 2.1, 2.2
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SaveTextOptions, SaveResult, SupabaseWriterService } from '../types/types';
import { SettingsManager } from './settings-manager';

/** リトライ設定 */
const MAX_RETRY_COUNT = 3;
const RETRY_BASE_DELAY_MS = 1000; // 1s → 2s → 4s (指数バックオフ)
const TIMEOUT_MS = 10000; // 10秒でタイムアウト

/** 認証エラーの HTTP ステータス */
const AUTH_ERROR_STATUSES = new Set([401, 403]);

/** DB エラーコードのプレフィックス（PostgreSQL SQLSTATEコード） */
const DB_ERROR_CODE_PREFIXES = ['42', '23'];

/**
 * 指定ミリ秒後に resolve する Promise を返す
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Promise にタイムアウトを設定する
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error('TIMEOUT'));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });
}

/**
 * Supabase エラーオブジェクトを SaveResult のエラーコードに分類する
 */
function classifySupabaseError(error: {
  code?: string;
  message?: string;
  status?: number;
}): SaveResult['error'] {
  const status = error.status;
  const code = error.code ?? '';

  // 401/403 → AUTH_FAILED（ただし RLS の 42501 は DB_ERROR に分類する）
  if (status && AUTH_ERROR_STATUSES.has(status) && !code.startsWith('42')) {
    return {
      code: 'AUTH_FAILED',
      message: `認証エラー: ${error.message ?? 'Invalid credentials'}`,
      recoveryHint: '設定画面でSupabase認証情報（Project URL・Anon Key）を再確認してください。',
    };
  }

  // DB エラーコード（PostgreSQL SQLSTATE）
  const isDbError = DB_ERROR_CODE_PREFIXES.some((prefix) => code.startsWith(prefix));
  if (isDbError) {
    return {
      code: 'DB_ERROR',
      message: `データベースエラー: ${error.message ?? 'Database error'}`,
      recoveryHint: 'Supabase の RLS（Row Level Security）ポリシーとテーブル構造を確認してください。',
    };
  }

  // その他のエラー
  return {
    code: 'UNKNOWN',
    message: `予期しないエラー: ${error.message ?? 'Unknown error'}`,
    recoveryHint: 'しばらく時間をおいて再試行してください。問題が続く場合は拡張機能を再起動してください。',
  };
}

/**
 * Supabase へのデータ INSERT とエラーハンドリングを一元管理するクラス
 *
 * - 認証情報が未設定の場合は NO_CREDENTIALS を返す
 * - ネットワーク障害に対して指数バックオフ（1s, 2s, 4s）で最大3回リトライ
 * - タイムアウト（10秒）で NETWORK_ERROR を返す
 * - エラー種別を自動分類: AUTH_FAILED / NETWORK_ERROR / DB_ERROR / UNKNOWN
 */
export class SupabaseWriter implements SupabaseWriterService {
  private readonly settingsManager: SettingsManager;

  constructor() {
    this.settingsManager = new SettingsManager();
  }

  /**
   * Supabase クライアントを認証情報から初期化して返す
   */
  private createSupabaseClient(projectUrl: string, anonKey: string): SupabaseClient {
    return createClient(projectUrl, anonKey);
  }

  /**
   * 選択テキスト・ページURL・タイムスタンプを Supabase の readings テーブルへ INSERT する
   * Requirement 1.2: 選択されたテキストとページURLをSupabaseへ送信
   * Requirement 2.1: 選択テキスト・ページURL・記録日時をSupabaseの指定テーブルへ書き込む
   * Requirement 2.2: Supabaseへの書き込みが失敗した場合、エラー情報を返す
   */
  async save(options: SaveTextOptions): Promise<SaveResult> {
    // 認証情報を取得
    const credentials = await this.settingsManager.getCredentials();

    if (credentials === null) {
      return {
        success: false,
        error: {
          code: 'NO_CREDENTIALS',
          message: 'Supabase認証情報が設定されていません。',
          recoveryHint: '設定画面（Options Page）でProject URLとAnon Keyを入力してください。',
        },
      };
    }

    const supabase = this.createSupabaseClient(credentials.projectUrl, credentials.anonKey);
    const record = {
      selected_text: options.selectedText,
      page_url: options.pageUrl,
      created_at: options.timestamp,
    };

    // 指数バックオフリトライ（最大3回）
    let lastNetworkError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRY_COUNT; attempt++) {
      // 2回目以降は待機してからリトライ
      if (attempt > 0) {
        const delayMs = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
        await sleep(delayMs);
      }

      try {
        type InsertResult = { data: Array<{ id: string; created_at: string }> | null; error: { code?: string; message?: string; status?: number } | null };
        const { data, error } = await withTimeout(
          supabase.from('readings').insert(record) as unknown as Promise<InsertResult>,
          TIMEOUT_MS
        );

        if (error) {
          // Supabase API エラー（ネットワークは通じているが DB/Auth エラー）
          return {
            success: false,
            error: classifySupabaseError(error),
          };
        }

        // 成功
        const inserted = Array.isArray(data) && data.length > 0 ? data[0] : data;
        return {
          success: true,
          data: {
            id: (inserted as { id: string; created_at: string }).id,
            created_at: (inserted as { id: string; created_at: string }).created_at,
          },
        };
      } catch (err) {
        // ネットワーク障害またはタイムアウト
        lastNetworkError = err instanceof Error ? err : new Error(String(err));

        // タイムアウトはリトライしない（即座にエラーを返す）
        if (lastNetworkError.message === 'TIMEOUT') {
          return {
            success: false,
            error: {
              code: 'NETWORK_ERROR',
              message: `タイムアウト: ${TIMEOUT_MS / 1000}秒以内に応答がありませんでした。`,
              recoveryHint: 'ネットワーク接続を確認して再試行してください。',
            },
          };
        }
      }
    }

    // 最大リトライ回数を超えた場合
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        message: `ネットワークエラー: ${MAX_RETRY_COUNT}回の試行後も接続できませんでした。${lastNetworkError?.message ?? ''}`,
        recoveryHint: 'インターネット接続を確認して、しばらく後に再試行してください。',
      },
    };
  }

  /**
   * Supabase への接続をテストする
   * Requirement 3.2: 保存時にSupabaseへの疎通確認を行い、結果をユーザーに表示する
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    const credentials = await this.settingsManager.getCredentials();

    if (credentials === null) {
      return {
        success: false,
        message: 'Supabase認証情報が設定されていません。設定画面で認証情報を入力してください。',
      };
    }

    const supabase = this.createSupabaseClient(credentials.projectUrl, credentials.anonKey);

    try {
      type SelectResult = { data: unknown; error: { message?: string } | null };
      const { error } = await withTimeout(
        supabase.from('readings').select('id').limit(1) as unknown as Promise<SelectResult>,
        TIMEOUT_MS
      );

      if (error) {
        const supabaseError = error as { message?: string };
        return {
          success: false,
          message: `接続エラー: ${supabaseError.message ?? 'Supabase接続に失敗しました。'}`,
        };
      }

      return {
        success: true,
        message: `接続成功: ${credentials.projectUrl} への接続が確認できました。`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        message: `接続エラー: ${message}`,
      };
    }
  }
}
