/**
 * エラーハンドリングユーティリティ
 * Requirements: 1.3, 1.4, 2.2, 2.3, 3.5
 */

import type { SaveResult } from '../types/types';

export type ErrorCode = NonNullable<SaveResult['error']>['code'];

const ERROR_MESSAGES: Record<ErrorCode, { message: string; recoveryHint: string }> = {
  NO_CREDENTIALS: {
    message: 'Supabaseの接続情報が設定されていません',
    recoveryHint: '拡張機能の設定画面からSupabase URLとAPIキーを設定してください',
  },
  AUTH_FAILED: {
    message: 'Supabaseの認証に失敗しました',
    recoveryHint: '設定画面でAPIキーを確認・更新してください',
  },
  NETWORK_ERROR: {
    message: 'ネットワークエラーが発生しました',
    recoveryHint: 'インターネット接続を確認して、再度お試しください',
  },
  DB_ERROR: {
    message: 'データベースへの書き込みに失敗しました',
    recoveryHint: 'Supabaseのテーブル設定とRLSポリシーを確認してください',
  },
  UNKNOWN: {
    message: '予期しないエラーが発生しました',
    recoveryHint: '再度お試しください。問題が続く場合はSupabaseの設定を確認してください',
  },
};

/**
 * エラーコードからユーザー向けメッセージを生成する
 */
export function getErrorInfo(code: ErrorCode): { message: string; recoveryHint: string } {
  return ERROR_MESSAGES[code] ?? ERROR_MESSAGES['UNKNOWN'];
}

/**
 * SaveResultからエラー情報を構築する
 */
export function buildSaveError(
  code: ErrorCode,
  originalMessage?: string
): NonNullable<SaveResult['error']> {
  const info = getErrorInfo(code);
  return {
    code,
    message: originalMessage ?? info.message,
    recoveryHint: info.recoveryHint,
  };
}
