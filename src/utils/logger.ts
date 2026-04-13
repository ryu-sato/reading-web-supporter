/**
 * ロギングユーティリティ
 *
 * 設計書要件:
 * - INFO/WARN/ERRORレベルをサポート
 * - コンポーネント名プレフィックス付きログ（例: [TextSelector] message）
 *
 * 監視ログイベント（設計書 Monitoring セクション）:
 * - Save initiated: INFO: "Saving selection..."
 * - Save successful: INFO: "Successfully saved to Supabase"
 * - Save failed: ERROR: "Save failed: {error code}"
 * - Credentials invalid: WARN: "Supabase credentials invalid"
 */

export interface Logger {
  info: (message: string, ...args: unknown[]) => void;
  warn: (message: string, ...args: unknown[]) => void;
  error: (message: string, ...args: unknown[]) => void;
}

/**
 * コンポーネント名プレフィックス付きロガーを作成する
 * @param componentName - ログに付与するコンポーネント名（例: 'TextSelector'）
 * @returns Logger インスタンス
 * @example
 * const log = createLogger('TextSelector');
 * log.info('message'); // => "[TextSelector] message"
 */
export function createLogger(componentName: string): Logger {
  const prefix = `[${componentName}]`;
  return {
    info: (message: string, ...args: unknown[]): void => {
      console.info(`${prefix} ${message}`, ...args);
    },
    warn: (message: string, ...args: unknown[]): void => {
      console.warn(`${prefix} ${message}`, ...args);
    },
    error: (message: string, ...args: unknown[]): void => {
      console.error(`${prefix} ${message}`, ...args);
    },
  };
}

/**
 * デフォルトロガー（後方互換性のため維持）
 * コンポーネント固有のログには createLogger を使用すること
 */
export const logger: Logger = createLogger('ReadingSupporter');
