/**
 * utils/logger.ts のユニットテスト
 * タスク 1.3: 共有TypeScript型とユーティリティ
 *
 * 設計書要件:
 * - INFO/WARN/ERRORレベルをサポート
 * - コンポーネント名プレフィックス付きログ（例: [TextSelector] message）
 */

import { createLogger, logger } from './logger';

describe('utils/logger.ts', () => {
  let consoleInfoSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('createLogger - コンポーネント名プレフィックス付きロガー', () => {
    it('INFO レベルでコンポーネント名プレフィックスを付けてログを出力する', () => {
      const log = createLogger('TextSelector');
      log.info('テスト メッセージ');
      expect(consoleInfoSpy).toHaveBeenCalledWith('[TextSelector] テスト メッセージ');
    });

    it('WARN レベルでコンポーネント名プレフィックスを付けてログを出力する', () => {
      const log = createLogger('SettingsManager');
      log.warn('警告メッセージ');
      expect(consoleWarnSpy).toHaveBeenCalledWith('[SettingsManager] 警告メッセージ');
    });

    it('ERROR レベルでコンポーネント名プレフィックスを付けてログを出力する', () => {
      const log = createLogger('SupabaseWriter');
      log.error('エラーメッセージ');
      expect(consoleErrorSpy).toHaveBeenCalledWith('[SupabaseWriter] エラーメッセージ');
    });

    it('追加の引数を渡せる', () => {
      const log = createLogger('ContextMenuHandler');
      const extraData = { key: 'value' };
      log.info('メッセージ', extraData);
      expect(consoleInfoSpy).toHaveBeenCalledWith('[ContextMenuHandler] メッセージ', extraData);
    });

    it('複数の追加引数を渡せる', () => {
      const log = createLogger('MessageHandler');
      log.warn('メッセージ', 'arg1', 42, { foo: 'bar' });
      expect(consoleWarnSpy).toHaveBeenCalledWith('[MessageHandler] メッセージ', 'arg1', 42, { foo: 'bar' });
    });

    it('異なるコンポーネント名で独立したロガーを作成できる', () => {
      const log1 = createLogger('ComponentA');
      const log2 = createLogger('ComponentB');
      log1.info('メッセージA');
      log2.info('メッセージB');
      expect(consoleInfoSpy).toHaveBeenCalledWith('[ComponentA] メッセージA');
      expect(consoleInfoSpy).toHaveBeenCalledWith('[ComponentB] メッセージB');
    });
  });

  describe('logger - デフォルトロガー（後方互換性）', () => {
    it('INFO レベルでログを出力する', () => {
      logger.info('情報メッセージ');
      expect(consoleInfoSpy).toHaveBeenCalled();
    });

    it('WARN レベルでログを出力する', () => {
      logger.warn('警告メッセージ');
      expect(consoleWarnSpy).toHaveBeenCalled();
    });

    it('ERROR レベルでログを出力する', () => {
      logger.error('エラーメッセージ');
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('デフォルトロガーはReadingSupporterプレフィックスを持つ', () => {
      logger.info('テスト');
      const call = consoleInfoSpy.mock.calls[0][0] as string;
      expect(call).toContain('[ReadingSupporter]');
    });
  });

  describe('設計書の監視ログイベント', () => {
    it('保存開始時: INFO: "Saving selection..."', () => {
      const log = createLogger('SupabaseWriter');
      log.info('Saving selection...');
      expect(consoleInfoSpy).toHaveBeenCalledWith('[SupabaseWriter] Saving selection...');
    });

    it('保存成功時: INFO: "Successfully saved to Supabase"', () => {
      const log = createLogger('SupabaseWriter');
      log.info('Successfully saved to Supabase');
      expect(consoleInfoSpy).toHaveBeenCalledWith('[SupabaseWriter] Successfully saved to Supabase');
    });

    it('保存失敗時: ERROR: "Save failed: {error code}"', () => {
      const log = createLogger('SupabaseWriter');
      log.error('Save failed: NETWORK_ERROR');
      expect(consoleErrorSpy).toHaveBeenCalledWith('[SupabaseWriter] Save failed: NETWORK_ERROR');
    });

    it('認証情報無効時: WARN: "Supabase credentials invalid"', () => {
      const log = createLogger('SettingsManager');
      log.warn('Supabase credentials invalid');
      expect(consoleWarnSpy).toHaveBeenCalledWith('[SettingsManager] Supabase credentials invalid');
    });
  });
});
