/**
 * SettingsManager: Supabase認証情報の読み書き・永続化・検証
 * Requirements: 2.3, 3.1, 3.2, 3.3, 3.4, 3.5
 */

import { SupabaseCredentials, SettingsManagerService } from '../types/types';

// テスト環境でも参照できるようにグローバルchrome APIを型宣言
declare const chrome: {
  storage: {
    local: {
      get(key: string, callback: (result: Record<string, unknown>) => void): void;
      set(items: Record<string, unknown>, callback?: () => void): void;
      remove(keys: string | string[], callback?: () => void): void;
    };
  };
  runtime: {
    sendMessage(message: unknown): Promise<unknown>;
  };
};

/**
 * chrome.storage.local に保存する認証情報の内部フォーマット
 * ※ ストレージキーは design.md の "supabse_credentials"（誤字のまま）を使用する
 */
interface StoredCredentials {
  projectUrl: string;
  anonKey: string;
  lastVerified: string; // ISO8601
}

/** ストレージキー定数 */
const STORAGE_KEY = 'supabse_credentials';

/** 状態変更通知メッセージ型 */
interface CredentialsUpdatedMessage {
  type: 'credentialsUpdated';
  payload: {
    isConfigured: boolean;
  };
}

/**
 * Supabase認証情報をChrome Storage APIで管理するサービスクラス
 *
 * - HTTPS URL形式 と 40文字以上のAPIキー を検証してからストレージに保存
 * - 認証情報の変更時に chrome.runtime.sendMessage で通知を送信
 * - ブラウザ再起動後も chrome.storage.local により設定が永続化される
 */
export class SettingsManager implements SettingsManagerService {
  // ─── バリデーション ─────────────────────────────────────────────────────────

  /**
   * projectUrl が HTTPS URL形式かどうかを検証する
   */
  private validateProjectUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  /**
   * anonKey が 40文字以上かどうかを検証する
   */
  private validateAnonKey(key: string): boolean {
    return key.length >= 40;
  }

  /**
   * 認証情報全体をバリデートし、エラーメッセージを返す
   * @returns エラーメッセージ（問題なければ null）
   */
  private validate(creds: SupabaseCredentials): string | null {
    if (!this.validateProjectUrl(creds.projectUrl)) {
      return 'projectUrl は HTTPS URL形式で指定してください (例: https://xxx.supabase.co)';
    }
    if (!this.validateAnonKey(creds.anonKey)) {
      return 'anonKey は40文字以上で指定してください';
    }
    return null;
  }

  // ─── Chrome Storage ─────────────────────────────────────────────────────────

  /**
   * chrome.storage.local から認証情報を読み込む
   */
  private readFromStorage(): Promise<StoredCredentials | null> {
    return new Promise((resolve) => {
      chrome.storage.local.get(STORAGE_KEY, (result) => {
        const stored = result[STORAGE_KEY] as StoredCredentials | undefined;
        resolve(stored ?? null);
      });
    });
  }

  /**
   * chrome.storage.local に認証情報を書き込む
   */
  private writeToStorage(stored: StoredCredentials): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEY]: stored }, () => {
        resolve();
      });
    });
  }

  // ─── 状態変更通知 ────────────────────────────────────────────────────────────

  /**
   * 認証情報が更新されたことを chrome.runtime.sendMessage で通知する
   * Requirement 3.4: 認証情報変更時に即座に反映
   */
  private notifyCredentialsUpdated(isConfigured: boolean): void {
    const message: CredentialsUpdatedMessage = {
      type: 'credentialsUpdated',
      payload: { isConfigured },
    };
    // sendMessage の失敗は無視する（受信者がいない場合もある）
    chrome.runtime.sendMessage(message).catch(() => {
      // 受信者なし等のエラーは意図的に無視
    });
  }

  // ─── SettingsManagerService 実装 ─────────────────────────────────────────────

  /**
   * 保存済みの認証情報を返す
   * Requirement 3.3: ブラウザを再起動しても設定が維持される
   * @returns 認証情報、または未設定の場合は null
   */
  async getCredentials(): Promise<SupabaseCredentials | null> {
    const stored = await this.readFromStorage();
    if (stored === null) {
      return null;
    }
    return {
      projectUrl: stored.projectUrl,
      anonKey: stored.anonKey,
    };
  }

  /**
   * 認証情報を検証してから chrome.storage.local に保存する
   * Requirement 3.1: URLとAPIキーの入力・保存
   * Requirement 3.3: セキュアなローカルストレージへの永続化
   * Requirement 3.4: 変更時に即座に反映
   */
  async setCredentials(
    creds: SupabaseCredentials
  ): Promise<{ success: boolean; error?: string }> {
    const validationError = this.validate(creds);
    if (validationError !== null) {
      return { success: false, error: validationError };
    }

    const stored: StoredCredentials = {
      projectUrl: creds.projectUrl,
      anonKey: creds.anonKey,
      lastVerified: new Date().toISOString(),
    };

    await this.writeToStorage(stored);
    this.notifyCredentialsUpdated(true);

    return { success: true };
  }

  /**
   * 認証情報が設定済みかどうかを返す
   * Requirement 2.3: 認証情報未設定時に設定を促すメッセージを表示するための判定
   */
  async isConfigured(): Promise<boolean> {
    const stored = await this.readFromStorage();
    return stored !== null;
  }

  /**
   * 接続テストを実行する（簡易実装）
   * Requirement 3.2: 保存時に Supabase への疎通確認
   *
   * ※ Task 2.2 では SupabaseWriter が未実装のため、URL設定済みなら success とする簡易実装。
   *   完全実装は Task 3.3（統合）で行う。
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    const stored = await this.readFromStorage();
    if (stored === null) {
      return {
        success: false,
        message: 'Supabase接続情報が設定されていません。設定画面で認証情報を入力してください。',
      };
    }

    return {
      success: true,
      message: `接続先: ${stored.projectUrl} — 接続情報が設定されています。`,
    };
  }
}
