/**
 * SupabaseReader: Supabase からの SELECT 操作・エラーハンドリング
 * Requirements: 4.1, 4.5
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { FetchHighlightsOptions, HighlightsResponse, SupabaseReaderService } from '../types/types';
import { SettingsManager } from './settings-manager';

/** タイムアウト（10秒） */
const TIMEOUT_MS = 10000;

/** 認証エラーの HTTP ステータス */
const AUTH_ERROR_STATUSES = new Set([401, 403]);

/** DB エラーコードのプレフィックス（PostgreSQL SQLSTATEコード） */
const DB_ERROR_CODE_PREFIXES = ['42', '23'];

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
 * Supabase エラーオブジェクトを HighlightsResponse のエラーコードに分類する
 */
function classifySupabaseError(error: {
  code?: string;
  message?: string;
  status?: number;
}): HighlightsResponse['error'] {
  const status = error.status;
  const code = error.code ?? '';

  // 401/403 → AUTH_FAILED（ただし RLS の 42501 は DB_ERROR に分類する）
  if (status && AUTH_ERROR_STATUSES.has(status) && !code.startsWith('42')) {
    return {
      code: 'AUTH_FAILED',
      message: `認証エラー: ${error.message ?? 'Invalid credentials'}`,
    };
  }

  // DB エラーコード（PostgreSQL SQLSTATE）
  const isDbError = DB_ERROR_CODE_PREFIXES.some((prefix) => code.startsWith(prefix));
  if (isDbError) {
    return {
      code: 'DB_ERROR',
      message: `データベースエラー: ${error.message ?? 'Database error'}`,
    };
  }

  // その他のエラー
  return {
    code: 'UNKNOWN',
    message: `予期しないエラー: ${error.message ?? 'Unknown error'}`,
  };
}

/**
 * Supabase からの SELECT (getHighlights) と error handling を一元管理するクラス
 *
 * - 認証情報が未設定の場合は NO_CREDENTIALS を返す
 * - タイムアウト（10秒）で NETWORK_ERROR を返す
 * - エラー種別を自動分類: AUTH_FAILED / NETWORK_ERROR / DB_ERROR / UNKNOWN
 */
export class SupabaseReader implements SupabaseReaderService {
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
   * 指定 URL の保存済みテキストを Supabase から SELECT して返す
   * Requirement 4.1: ページロード時、保存済みテキストを Supabase から取得
   * Requirement 4.5: Supabase 取得失敗時はページ表示を妨げず中断
   */
  async fetchSavedTexts(options: FetchHighlightsOptions): Promise<HighlightsResponse> {
    // 認証情報を取得
    const credentials = await this.settingsManager.getCredentials();

    if (credentials === null) {
      return {
        success: false,
        error: {
          code: 'NO_CREDENTIALS',
          message: 'Supabase認証情報が設定されていません。',
        },
      };
    }

    const supabase = this.createSupabaseClient(credentials.projectUrl, credentials.anonKey);
    const pageUrl = options.pageUrl;

    try {
      type SelectResult = {
        data: Array<{ id: string; selected_text: string; memo: string | null }> | null;
        error: { code?: string; message?: string; status?: number } | null;
      };
      const { data, error } = await withTimeout(
        supabase.from('readings').select('id, selected_text, memo').eq('page_url', pageUrl) as unknown as Promise<SelectResult>,
        TIMEOUT_MS
      );

      if (error) {
        // Supabase API エラー（ネットワークは通じているが DB/Auth エラー）
        return {
          success: false,
          error: classifySupabaseError(error),
        };
      }

      // 成功: data を highlights 配列に変換（id, selected_text と memo を含む）
      const highlights =
        data && Array.isArray(data)
          ? data.map((row) => ({
              id: row.id,
              text: row.selected_text,
              memo: row.memo ?? undefined, // NULL → undefined
            }))
          : [];
      return {
        success: true,
        highlights,
      };
    } catch (err) {
      // ネットワーク障害またはタイムアウト
      const errorMessage = err instanceof Error ? err.message : String(err);

      if (errorMessage === 'TIMEOUT') {
        return {
          success: false,
          error: {
            code: 'NETWORK_ERROR',
            message: `タイムアウト: ${TIMEOUT_MS / 1000}秒以内に応答がありませんでした。`,
          },
        };
      }

      // その他のネットワークエラー
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: `ネットワークエラー: ${errorMessage}`,
        },
      };
    }
  }
}
