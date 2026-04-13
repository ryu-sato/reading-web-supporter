/**
 * utils/error-handler.ts のユニットテスト
 * タスク 1.3: 共有TypeScript型とユーティリティ
 *
 * 設計書要件（Error Strategy）:
 * - NO_CREDENTIALS: Options Pageへ誘導するメッセージ
 * - NETWORK_ERROR: リトライを促すメッセージ
 * - AUTH_FAILED: 認証情報再確認を促すメッセージ
 * - DB_ERROR: RLSポリシー確認を促すメッセージ
 * - UNKNOWN: 汎用エラーメッセージ
 */

import { getErrorInfo, buildSaveError, type ErrorCode } from './error-handler';
import type { SaveResult } from '../types/types';

describe('utils/error-handler.ts', () => {
  describe('getErrorInfo', () => {
    describe('NO_CREDENTIALS', () => {
      it('Options Pageへ誘導するrecoveryHintを返す', () => {
        const info = getErrorInfo('NO_CREDENTIALS');
        expect(info.message).toBeTruthy();
        expect(info.recoveryHint).toBeTruthy();
        // Options Pageへの誘導が含まれること
        expect(info.recoveryHint.toLowerCase()).toMatch(/設定|options|オプション/i);
      });

      it('messageとrecoveryHintの両方を返す', () => {
        const info = getErrorInfo('NO_CREDENTIALS');
        expect(info).toHaveProperty('message');
        expect(info).toHaveProperty('recoveryHint');
        expect(typeof info.message).toBe('string');
        expect(typeof info.recoveryHint).toBe('string');
        expect(info.message.length).toBeGreaterThan(0);
        expect(info.recoveryHint.length).toBeGreaterThan(0);
      });
    });

    describe('NETWORK_ERROR', () => {
      it('リトライを促すmessageまたはrecoveryHintを返す', () => {
        const info = getErrorInfo('NETWORK_ERROR');
        const text = `${info.message} ${info.recoveryHint}`;
        expect(text).toMatch(/再|retry|ネットワーク|network/i);
      });

      it('messageとrecoveryHintの両方を返す', () => {
        const info = getErrorInfo('NETWORK_ERROR');
        expect(info.message.length).toBeGreaterThan(0);
        expect(info.recoveryHint.length).toBeGreaterThan(0);
      });
    });

    describe('AUTH_FAILED', () => {
      it('認証情報再確認を促すmessageまたはrecoveryHintを返す', () => {
        const info = getErrorInfo('AUTH_FAILED');
        const text = `${info.message} ${info.recoveryHint}`;
        expect(text).toMatch(/認証|auth|api|key|確認/i);
      });

      it('messageとrecoveryHintの両方を返す', () => {
        const info = getErrorInfo('AUTH_FAILED');
        expect(info.message.length).toBeGreaterThan(0);
        expect(info.recoveryHint.length).toBeGreaterThan(0);
      });
    });

    describe('DB_ERROR', () => {
      it('RLSポリシー確認を促すmessageまたはrecoveryHintを返す', () => {
        const info = getErrorInfo('DB_ERROR');
        const text = `${info.message} ${info.recoveryHint}`;
        expect(text).toMatch(/rls|ポリシー|policy|データベース|db/i);
      });

      it('messageとrecoveryHintの両方を返す', () => {
        const info = getErrorInfo('DB_ERROR');
        expect(info.message.length).toBeGreaterThan(0);
        expect(info.recoveryHint.length).toBeGreaterThan(0);
      });
    });

    describe('UNKNOWN', () => {
      it('汎用エラーメッセージを返す', () => {
        const info = getErrorInfo('UNKNOWN');
        expect(info.message.length).toBeGreaterThan(0);
        expect(info.recoveryHint.length).toBeGreaterThan(0);
      });

      it('再試行を促す内容を含む', () => {
        const info = getErrorInfo('UNKNOWN');
        const text = `${info.message} ${info.recoveryHint}`;
        expect(text).toMatch(/再|retry|エラー|error/i);
      });
    });

    describe('全エラーコードの網羅性', () => {
      const errorCodes: ErrorCode[] = [
        'NO_CREDENTIALS',
        'AUTH_FAILED',
        'NETWORK_ERROR',
        'DB_ERROR',
        'UNKNOWN',
      ];

      errorCodes.forEach((code) => {
        it(`${code} のエラー情報を返す`, () => {
          const info = getErrorInfo(code);
          expect(info).toHaveProperty('message');
          expect(info).toHaveProperty('recoveryHint');
          expect(info.message).toBeTruthy();
          expect(info.recoveryHint).toBeTruthy();
        });
      });
    });
  });

  describe('buildSaveError', () => {
    it('エラーコードから SaveResult.error を構築できる', () => {
      const error = buildSaveError('NO_CREDENTIALS');
      expect(error.code).toBe('NO_CREDENTIALS');
      expect(error.message).toBeTruthy();
      expect(error.recoveryHint).toBeTruthy();
    });

    it('カスタムメッセージを指定できる', () => {
      const customMessage = 'カスタムエラーメッセージ';
      const error = buildSaveError('NETWORK_ERROR', customMessage);
      expect(error.code).toBe('NETWORK_ERROR');
      expect(error.message).toBe(customMessage);
      // recoveryHintはデフォルトのものが使われる
      expect(error.recoveryHint).toBeTruthy();
    });

    it('カスタムメッセージなしの場合はデフォルトメッセージを使用する', () => {
      const error = buildSaveError('AUTH_FAILED');
      const defaultInfo = getErrorInfo('AUTH_FAILED');
      expect(error.message).toBe(defaultInfo.message);
    });

    it('SaveResult.error の型に準拠する', () => {
      const error = buildSaveError('DB_ERROR');
      // 型チェック: SaveResult.error として使えること
      const result: SaveResult = {
        success: false,
        error,
      };
      expect(result.error?.code).toBe('DB_ERROR');
    });

    it('全エラーコードで動作する', () => {
      const codes: ErrorCode[] = [
        'NO_CREDENTIALS',
        'AUTH_FAILED',
        'NETWORK_ERROR',
        'DB_ERROR',
        'UNKNOWN',
      ];
      codes.forEach((code) => {
        const error = buildSaveError(code);
        expect(error.code).toBe(code);
        expect(error.message).toBeTruthy();
        expect(error.recoveryHint).toBeTruthy();
      });
    });
  });

  describe('循環依存のないインポート', () => {
    it('error-handler が types から正しくインポートできる', () => {
      // インポート成功はテスト自体が証明している
      expect(getErrorInfo).toBeDefined();
      expect(buildSaveError).toBeDefined();
    });
  });
});
