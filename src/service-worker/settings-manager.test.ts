/**
 * SettingsManager のユニットテスト
 * Requirements: 2.3, 3.1, 3.2, 3.3, 3.4, 3.5
 */

import { SettingsManager } from './settings-manager';
import { SupabaseCredentials } from '../types/types';

// chrome API のグローバルモックを定義
const mockStorageData: Record<string, unknown> = {};

const mockChromeStorage = {
  local: {
    get: jest.fn((keys: string | string[] | null, callback: (result: Record<string, unknown>) => void) => {
      if (keys === null) {
        callback({ ...mockStorageData });
      } else if (typeof keys === 'string') {
        callback({ [keys]: mockStorageData[keys] });
      } else {
        const result: Record<string, unknown> = {};
        (keys as string[]).forEach((k) => {
          result[k] = mockStorageData[k];
        });
        callback(result);
      }
    }),
    set: jest.fn((items: Record<string, unknown>, callback?: () => void) => {
      Object.assign(mockStorageData, items);
      if (callback) callback();
    }),
    remove: jest.fn((keys: string | string[], callback?: () => void) => {
      if (typeof keys === 'string') {
        delete mockStorageData[keys];
      } else {
        (keys as string[]).forEach((k) => delete mockStorageData[k]);
      }
      if (callback) callback();
    }),
  },
};

const mockChromeRuntime = {
  sendMessage: jest.fn().mockResolvedValue(undefined),
  lastError: undefined,
};

// グローバル chrome オブジェクトをモック
(global as unknown as { chrome: unknown }).chrome = {
  storage: mockChromeStorage,
  runtime: mockChromeRuntime,
};

describe('SettingsManager', () => {
  let manager: SettingsManager;

  beforeEach(() => {
    // ストレージとモックをリセット
    Object.keys(mockStorageData).forEach((k) => delete mockStorageData[k]);
    jest.clearAllMocks();
    manager = new SettingsManager();
  });

  // ── getCredentials ──────────────────────────────────────────────────────────

  describe('getCredentials()', () => {
    it('認証情報が未設定の場合、null を返す', async () => {
      const result = await manager.getCredentials();
      expect(result).toBeNull();
    });

    it('保存済みの認証情報を返す', async () => {
      const creds: SupabaseCredentials = {
        projectUrl: 'https://example.supabase.co',
        anonKey: 'a'.repeat(40),
      };
      mockStorageData['supabse_credentials'] = {
        ...creds,
        lastVerified: '2024-01-01T00:00:00.000Z',
      };

      const result = await manager.getCredentials();
      expect(result).toEqual(creds);
    });
  });

  // ── setCredentials ──────────────────────────────────────────────────────────

  describe('setCredentials()', () => {
    const validCreds: SupabaseCredentials = {
      projectUrl: 'https://example.supabase.co',
      anonKey: 'a'.repeat(40),
    };

    it('有効な認証情報を保存できる', async () => {
      const result = await manager.setCredentials(validCreds);

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(mockChromeStorage.local.set).toHaveBeenCalledTimes(1);
    });

    it('保存後に chrome.storage.local にデータが格納される', async () => {
      await manager.setCredentials(validCreds);

      const storedValue = mockStorageData['supabse_credentials'] as Record<string, unknown>;
      expect(storedValue).toBeDefined();
      expect(storedValue.projectUrl).toBe(validCreds.projectUrl);
      expect(storedValue.anonKey).toBe(validCreds.anonKey);
      expect(storedValue.lastVerified).toBeDefined();
    });

    it('HTTPSでないURLは拒否される', async () => {
      const invalidCreds: SupabaseCredentials = {
        projectUrl: 'http://example.supabase.co',
        anonKey: 'a'.repeat(40),
      };

      const result = await manager.setCredentials(invalidCreds);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(mockChromeStorage.local.set).not.toHaveBeenCalled();
    });

    it('無効なURL形式は拒否される', async () => {
      const invalidCreds: SupabaseCredentials = {
        projectUrl: 'not-a-url',
        anonKey: 'a'.repeat(40),
      };

      const result = await manager.setCredentials(invalidCreds);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('40文字未満のAPIキーは拒否される', async () => {
      const invalidCreds: SupabaseCredentials = {
        projectUrl: 'https://example.supabase.co',
        anonKey: 'short',
      };

      const result = await manager.setCredentials(invalidCreds);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(mockChromeStorage.local.set).not.toHaveBeenCalled();
    });

    it('ちょうど40文字のAPIキーは受け入れられる', async () => {
      const creds: SupabaseCredentials = {
        projectUrl: 'https://example.supabase.co',
        anonKey: 'a'.repeat(40),
      };

      const result = await manager.setCredentials(creds);

      expect(result.success).toBe(true);
    });

    it('40文字を超えるAPIキーは受け入れられる', async () => {
      const creds: SupabaseCredentials = {
        projectUrl: 'https://example.supabase.co',
        anonKey: 'a'.repeat(100),
      };

      const result = await manager.setCredentials(creds);

      expect(result.success).toBe(true);
    });

    it('認証情報保存後に状態変更通知が送信される', async () => {
      await manager.setCredentials(validCreds);

      expect(mockChromeRuntime.sendMessage).toHaveBeenCalledTimes(1);
      expect(mockChromeRuntime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'credentialsUpdated' })
      );
    });

    it('認証情報を更新した場合、即座に新しい設定が反映される (Req 3.4)', async () => {
      await manager.setCredentials(validCreds);

      const updatedCreds: SupabaseCredentials = {
        projectUrl: 'https://new.supabase.co',
        anonKey: 'b'.repeat(40),
      };
      await manager.setCredentials(updatedCreds);

      const result = await manager.getCredentials();
      expect(result?.projectUrl).toBe('https://new.supabase.co');
    });
  });

  // ── isConfigured ────────────────────────────────────────────────────────────

  describe('isConfigured()', () => {
    it('認証情報が未設定の場合、false を返す (Req 2.3)', async () => {
      const result = await manager.isConfigured();
      expect(result).toBe(false);
    });

    it('認証情報が設定済みの場合、true を返す', async () => {
      mockStorageData['supabse_credentials'] = {
        projectUrl: 'https://example.supabase.co',
        anonKey: 'a'.repeat(40),
        lastVerified: '2024-01-01T00:00:00.000Z',
      };

      const result = await manager.isConfigured();
      expect(result).toBe(true);
    });
  });

  // ── testConnection ──────────────────────────────────────────────────────────

  describe('testConnection()', () => {
    it('認証情報が未設定の場合、失敗を返す', async () => {
      const result = await manager.testConnection();

      expect(result.success).toBe(false);
      expect(result.message).toBeDefined();
    });

    it('認証情報が設定済みの場合、成功を返す', async () => {
      mockStorageData['supabse_credentials'] = {
        projectUrl: 'https://example.supabase.co',
        anonKey: 'a'.repeat(40),
        lastVerified: '2024-01-01T00:00:00.000Z',
      };

      const result = await manager.testConnection();

      expect(result.success).toBe(true);
      expect(result.message).toBeDefined();
    });
  });

  // ── ブラウザ再起動後の永続化 (Req 3.3) ────────────────────────────────────

  describe('永続化 (Req 3.3)', () => {
    it('保存された認証情報は新しい SettingsManager インスタンスからも取得できる', async () => {
      const creds: SupabaseCredentials = {
        projectUrl: 'https://example.supabase.co',
        anonKey: 'a'.repeat(40),
      };

      await manager.setCredentials(creds);

      // 新しいインスタンス（ブラウザ再起動後を想定）
      const newManager = new SettingsManager();
      const result = await newManager.getCredentials();

      expect(result).toEqual(creds);
    });
  });
});
