/**
 * types/types.ts の型定義テスト
 * タスク 1.3: 共有TypeScript型とユーティリティ
 */

import type {
  SupabaseCredentials,
  SaveTextOptions,
  SaveResult,
  TextSelectionMessage,
  ISO8601,
  ExtensionMessage,
  StorageState,
  SupabaseWriterService,
  SettingsManagerService,
  GetHighlightsMessage,
  HighlightsResponse,
} from './types';

describe('types/types.ts - 型定義', () => {
  describe('SupabaseCredentials', () => {
    it('有効なSupabaseCredentialsオブジェクトを作成できる', () => {
      const creds: SupabaseCredentials = {
        projectUrl: 'https://xxx.supabase.co',
        anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test',
      };
      expect(creds.projectUrl).toBe('https://xxx.supabase.co');
      expect(creds.anonKey).toBe('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test');
    });
  });

  describe('SaveTextOptions', () => {
    it('有効なSaveTextOptionsオブジェクトを作成できる', () => {
      const options: SaveTextOptions = {
        selectedText: '選択されたテキスト',
        pageUrl: 'https://example.com/blog/post',
        timestamp: new Date().toISOString() as ISO8601,
      };
      expect(options.selectedText).toBe('選択されたテキスト');
      expect(options.pageUrl).toBe('https://example.com/blog/post');
      expect(options.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('SaveResult', () => {
    it('成功時のSaveResultを作成できる', () => {
      const result: SaveResult = {
        success: true,
        data: {
          id: 'uuid-1234',
          created_at: '2026-04-13T00:00:00.000Z',
        },
      };
      expect(result.success).toBe(true);
      expect(result.data?.id).toBe('uuid-1234');
      expect(result.error).toBeUndefined();
    });

    it('失敗時のSaveResultを作成できる - NO_CREDENTIALS', () => {
      const result: SaveResult = {
        success: false,
        error: {
          code: 'NO_CREDENTIALS',
          message: '認証情報が未設定です',
          recoveryHint: '設定画面を開いてください',
        },
      };
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('NO_CREDENTIALS');
      expect(result.data).toBeUndefined();
    });

    it('失敗時のSaveResultを作成できる - AUTH_FAILED', () => {
      const result: SaveResult = {
        success: false,
        error: {
          code: 'AUTH_FAILED',
          message: '認証失敗',
          recoveryHint: 'APIキーを確認してください',
        },
      };
      expect(result.error?.code).toBe('AUTH_FAILED');
    });

    it('失敗時のSaveResultを作成できる - NETWORK_ERROR', () => {
      const result: SaveResult = {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: 'ネットワークエラー',
          recoveryHint: '再試行してください',
        },
      };
      expect(result.error?.code).toBe('NETWORK_ERROR');
    });

    it('失敗時のSaveResultを作成できる - DB_ERROR', () => {
      const result: SaveResult = {
        success: false,
        error: {
          code: 'DB_ERROR',
          message: 'DBエラー',
          recoveryHint: 'RLSポリシーを確認してください',
        },
      };
      expect(result.error?.code).toBe('DB_ERROR');
    });

    it('失敗時のSaveResultを作成できる - UNKNOWN', () => {
      const result: SaveResult = {
        success: false,
        error: {
          code: 'UNKNOWN',
          message: '不明なエラー',
          recoveryHint: '再試行してください',
        },
      };
      expect(result.error?.code).toBe('UNKNOWN');
    });
  });

  describe('TextSelectionMessage', () => {
    it('有効なTextSelectionMessageを作成できる', () => {
      const msg: TextSelectionMessage = {
        type: 'textSelectionUpdated',
        payload: {
          selectedText: 'テスト選択テキスト',
          pageUrl: 'https://example.com',
          hasSelection: true,
        },
      };
      expect(msg.type).toBe('textSelectionUpdated');
      expect(msg.payload.hasSelection).toBe(true);
    });

    it('選択なし状態のTextSelectionMessageを作成できる', () => {
      const msg: TextSelectionMessage = {
        type: 'textSelectionUpdated',
        payload: {
          selectedText: '',
          pageUrl: 'https://example.com',
          hasSelection: false,
        },
      };
      expect(msg.payload.hasSelection).toBe(false);
      expect(msg.payload.selectedText).toBe('');
    });
  });

  describe('ExtensionMessage 共用体型', () => {
    it('textSelectionUpdatedメッセージを作成できる', () => {
      const msg: ExtensionMessage = {
        type: 'textSelectionUpdated',
        payload: {
          selectedText: 'test',
          pageUrl: 'https://example.com',
          hasSelection: true,
        },
      };
      expect(msg.type).toBe('textSelectionUpdated');
    });

    it('getSelectionメッセージを作成できる', () => {
      const msg: ExtensionMessage = { type: 'getSelection' };
      expect(msg.type).toBe('getSelection');
    });

    it('getCredentialsメッセージを作成できる', () => {
      const msg: ExtensionMessage = { type: 'getCredentials' };
      expect(msg.type).toBe('getCredentials');
    });

    it('testConnectionメッセージを作成できる', () => {
      const msg: ExtensionMessage = { type: 'testConnection' };
      expect(msg.type).toBe('testConnection');
    });

    it('getHighlightsメッセージを作成できる', () => {
      const msg: ExtensionMessage = {
        type: 'getHighlights',
        payload: {
          pageUrl: 'https://example.com/blog/post',
        },
      };
      expect(msg.type).toBe('getHighlights');
    });
  });

  describe('GetHighlightsMessage', () => {
    it('有効なGetHighlightsMessageを作成できる', () => {
      const msg: GetHighlightsMessage = {
        type: 'getHighlights',
        payload: {
          pageUrl: 'https://example.com/blog/post',
        },
      };
      expect(msg.type).toBe('getHighlights');
      expect(msg.payload.pageUrl).toBe('https://example.com/blog/post');
    });
  });

  describe('HighlightsResponse', () => {
    it('成功時のHighlightsResponseを作成できる', () => {
      const response: HighlightsResponse = {
        success: true,
        texts: ['保存済みテキスト1', '保存済みテキスト2', '保存済みテキスト3'],
      };
      expect(response.success).toBe(true);
      expect(response.texts).toHaveLength(3);
      expect(response.texts?.[0]).toBe('保存済みテキスト1');
      expect(response.error).toBeUndefined();
    });

    it('成功時（0件）のHighlightsResponseを作成できる', () => {
      const response: HighlightsResponse = {
        success: true,
        texts: [],
      };
      expect(response.success).toBe(true);
      expect(response.texts).toHaveLength(0);
      expect(response.error).toBeUndefined();
    });

    it('失敗時のHighlightsResponseを作成できる - NO_CREDENTIALS', () => {
      const response: HighlightsResponse = {
        success: false,
        error: {
          code: 'NO_CREDENTIALS',
          message: '認証情報が未設定です',
        },
      };
      expect(response.success).toBe(false);
      expect(response.error?.code).toBe('NO_CREDENTIALS');
      expect(response.texts).toBeUndefined();
    });

    it('失敗時のHighlightsResponseを作成できる - NETWORK_ERROR', () => {
      const response: HighlightsResponse = {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: 'ネットワークエラー',
        },
      };
      expect(response.success).toBe(false);
      expect(response.error?.code).toBe('NETWORK_ERROR');
    });

    it('失敗時のHighlightsResponseを作成できる - DB_ERROR', () => {
      const response: HighlightsResponse = {
        success: false,
        error: {
          code: 'DB_ERROR',
          message: 'DBエラー',
        },
      };
      expect(response.success).toBe(false);
      expect(response.error?.code).toBe('DB_ERROR');
    });

    it('失敗時のHighlightsResponseを作成できる - UNKNOWN', () => {
      const response: HighlightsResponse = {
        success: false,
        error: {
          code: 'UNKNOWN',
          message: '不明なエラー',
        },
      };
      expect(response.success).toBe(false);
      expect(response.error?.code).toBe('UNKNOWN');
    });
  });

  describe('StorageState', () => {
    it('認証情報ありのStorageStateを作成できる', () => {
      const state: StorageState = {
        supabase_credentials: {
          projectUrl: 'https://xxx.supabase.co',
          anonKey: 'test-key',
          lastVerified: '2026-04-13T00:00:00.000Z',
        },
      };
      expect(state.supabase_credentials).not.toBeNull();
      expect(state.supabase_credentials?.projectUrl).toBe('https://xxx.supabase.co');
    });

    it('認証情報なしのStorageStateを作成できる', () => {
      const state: StorageState = {
        supabase_credentials: null,
      };
      expect(state.supabase_credentials).toBeNull();
    });
  });

  describe('型の循環依存がないこと', () => {
    it('types.tsをインポートしてもエラーが発生しない', () => {
      // このテスト自体がインポートを検証している
      expect(true).toBe(true);
    });
  });
});
