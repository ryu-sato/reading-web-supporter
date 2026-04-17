/**
 * SupabaseReader のユニットテスト
 * Requirements: 4.1, 4.5
 */

import { SupabaseReader } from './supabase-reader';
import { FetchHighlightsOptions, SupabaseCredentials } from '../types/types';
import { createClient } from '@supabase/supabase-js';

// @supabase/supabase-js は src/__mocks__/@supabase/supabase-js.ts でモック済み

const mockCredentials: SupabaseCredentials = {
  projectUrl: 'https://test-project.supabase.co',
  anonKey: 'test-anon-key-that-is-long-enough-for-validation-purpose',
};

const mockFetchOptions: FetchHighlightsOptions = {
  pageUrl: 'https://example.com/blog/post',
};

// SettingsManager のモック
const mockGetCredentials = jest.fn<Promise<SupabaseCredentials | null>, []>();

jest.mock('./settings-manager', () => {
  return {
    SettingsManager: jest.fn().mockImplementation(() => ({
      getCredentials: mockGetCredentials,
    })),
  };
});

// createClient のモック型
const mockSelect = jest.fn();
const mockEq = jest.fn();
const mockFrom = jest.fn();
const mockCreateClient = createClient as jest.Mock;

describe('SupabaseReader', () => {
  let reader: SupabaseReader;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // デフォルトのモック設定
    mockGetCredentials.mockResolvedValue(mockCredentials);

    // Supabase クライアントのチェーンメソッド
    mockEq.mockResolvedValue({
      data: [{ selected_text: 'テスト選択テキスト1' }, { selected_text: 'テスト選択テキスト2' }],
      error: null,
    });

    mockSelect.mockReturnValue({ eq: mockEq });
    mockFrom.mockReturnValue({ select: mockSelect });

    mockCreateClient.mockReturnValue({ from: mockFrom });

    reader = new SupabaseReader();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ─── fetchSavedTexts() - 正常系 ────────────────────────────────────────────

  describe('fetchSavedTexts() - 正常系', () => {
    it('認証情報が設定済みの場合、readings テーブルから SELECT する (Req 4.1)', async () => {
      const resultPromise = reader.fetchSavedTexts(mockFetchOptions);
      jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.texts).toBeDefined();
      expect(result.texts).toHaveLength(2);
      expect(result.error).toBeUndefined();
    });

    it('SELECT時に selected_text カラムを指定して取得する (Req 4.1)', async () => {
      const resultPromise = reader.fetchSavedTexts(mockFetchOptions);
      jest.runAllTimersAsync();
      await resultPromise;

      expect(mockFrom).toHaveBeenCalledWith('readings');
      expect(mockSelect).toHaveBeenCalledWith('selected_text');
      expect(mockEq).toHaveBeenCalledWith('page_url', mockFetchOptions.pageUrl);
    });

    it('取得成功時に success: true と texts 配列を返す (Req 4.1)', async () => {
      const resultPromise = reader.fetchSavedTexts(mockFetchOptions);
      jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.texts).toEqual(['テスト選択テキスト1', 'テスト選択テキスト2']);
    });

    it('保存済みテキストが0件の場合、空配列を返す (Req 4.1)', async () => {
      mockEq.mockResolvedValue({
        data: [],
        error: null,
      });

      const resultPromise = reader.fetchSavedTexts(mockFetchOptions);
      jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.texts).toEqual([]);
    });

    it('data が null の場合、空配列を返す', async () => {
      mockEq.mockResolvedValue({
        data: null,
        error: null,
      });

      const resultPromise = reader.fetchSavedTexts(mockFetchOptions);
      jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.texts).toEqual([]);
    });
  });

  // ─── fetchSavedTexts() - NO_CREDENTIALS エラー ───────────────────────────

  describe('fetchSavedTexts() - NO_CREDENTIALS エラー', () => {
    it('認証情報が null の場合、NO_CREDENTIALS エラーを返す (Req 4.5)', async () => {
      mockGetCredentials.mockResolvedValue(null);
      const reader2 = new SupabaseReader();

      const result = await reader2.fetchSavedTexts(mockFetchOptions);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('NO_CREDENTIALS');
      expect(result.error?.message).toBeDefined();
    });

    it('NO_CREDENTIALS の場合、Supabase クライアントを呼び出さない', async () => {
      mockGetCredentials.mockResolvedValue(null);
      const reader2 = new SupabaseReader();

      await reader2.fetchSavedTexts(mockFetchOptions);

      expect(mockFrom).not.toHaveBeenCalled();
    });
  });

  // ─── fetchSavedTexts() - AUTH_FAILED エラー ────────────────────────────

  describe('fetchSavedTexts() - AUTH_FAILED エラー', () => {
    it('401エラーが返された場合、AUTH_FAILED エラーを返す (Req 4.5)', async () => {
      mockEq.mockResolvedValue({
        data: null,
        error: { code: '401', message: 'Invalid API key', status: 401 },
      });

      const resultPromise = reader.fetchSavedTexts(mockFetchOptions);
      jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('AUTH_FAILED');
    });

    it('403エラーが返された場合、AUTH_FAILED エラーを返す (Req 4.5)', async () => {
      mockEq.mockResolvedValue({
        data: null,
        error: { code: '403', message: 'Forbidden', status: 403 },
      });

      const resultPromise = reader.fetchSavedTexts(mockFetchOptions);
      jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('AUTH_FAILED');
    });
  });

  // ─── fetchSavedTexts() - NETWORK_ERROR エラー（タイムアウト）──────────────

  describe('fetchSavedTexts() - NETWORK_ERROR エラーとタイムアウト', () => {
    it('ネットワーク障害が発生した場合、NETWORK_ERROR を返す (Req 4.5)', async () => {
      mockEq.mockRejectedValue(new Error('fetch failed'));

      const resultPromise = reader.fetchSavedTexts(mockFetchOptions);
      jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('NETWORK_ERROR');
    });

    it('タイムアウト（10秒）が発生した場合、NETWORK_ERROR を返す (Req 4.5)', async () => {
      mockEq.mockImplementation(
        () =>
          new Promise((_resolve) => {
            // 永遠にresolveしない（タイムアウトシミュレーション）
          })
      );

      const resultPromise = reader.fetchSavedTexts(mockFetchOptions);
      // タイムアウト10秒を進める
      await jest.advanceTimersByTimeAsync(10000);
      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('NETWORK_ERROR');
      expect(result.error?.message).toContain('タイムアウト');
    });
  });

  // ─── fetchSavedTexts() - DB_ERROR エラー ───────────────────────────────

  describe('fetchSavedTexts() - DB_ERROR エラー', () => {
    it('RLS拒否エラーが返された場合、DB_ERROR を返す (Req 4.5)', async () => {
      mockEq.mockResolvedValue({
        data: null,
        error: { code: '42501', message: 'permission denied for table readings', status: 403 },
      });

      const resultPromise = reader.fetchSavedTexts(mockFetchOptions);
      jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('DB_ERROR');
    });

    it('DB制約違反エラーが返された場合、DB_ERROR を返す (Req 4.5)', async () => {
      mockEq.mockResolvedValue({
        data: null,
        error: { code: '23505', message: 'duplicate key value violates unique constraint', status: 409 },
      });

      const resultPromise = reader.fetchSavedTexts(mockFetchOptions);
      jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('DB_ERROR');
    });
  });

  // ─── fetchSavedTexts() - UNKNOWN エラー ────────────────────────────────

  describe('fetchSavedTexts() - UNKNOWN エラー', () => {
    it('分類できないエラーが返された場合、UNKNOWN エラーを返す (Req 4.5)', async () => {
      mockEq.mockResolvedValue({
        data: null,
        error: { code: '999', message: 'unexpected error', status: 500 },
      });

      const resultPromise = reader.fetchSavedTexts(mockFetchOptions);
      jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('UNKNOWN');
    });
  });

  // ─── エラーレスポンスの構造 ──────────────────────────────────────────────

  describe('エラーレスポンスの構造', () => {
    it('すべてのエラーレスポンスは code と message を持つ (Req 4.5)', async () => {
      mockGetCredentials.mockResolvedValue(null);
      const reader2 = new SupabaseReader();

      const result = await reader2.fetchSavedTexts(mockFetchOptions);

      expect(result.error).toEqual(
        expect.objectContaining({
          code: expect.any(String),
          message: expect.any(String),
        })
      );
    });

    it('成功時はエラーフィールドを持たない', async () => {
      const resultPromise = reader.fetchSavedTexts(mockFetchOptions);
      jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.error).toBeUndefined();
      expect(result.success).toBe(true);
    });
  });

  // ─── 複数テキストのハイライト対応 ────────────────────────────────────────

  describe('複数テキストのハイライト対応', () => {
    it('複数の保存済みテキストをすべて返す', async () => {
      mockEq.mockResolvedValue({
        data: [
          { selected_text: 'テキスト1' },
          { selected_text: 'テキスト2' },
          { selected_text: 'テキスト3' },
        ],
        error: null,
      });

      const resultPromise = reader.fetchSavedTexts(mockFetchOptions);
      jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.texts).toHaveLength(3);
      expect(result.texts).toEqual(['テキスト1', 'テキスト2', 'テキスト3']);
    });

    it('長いテキストと短いテキストを混在して返す', async () => {
      mockEq.mockResolvedValue({
        data: [
          { selected_text: 'a' },
          { selected_text: 'これは長いテストテキストです。複数行の内容を含むことができます。' },
          { selected_text: 'b' },
        ],
        error: null,
      });

      const resultPromise = reader.fetchSavedTexts(mockFetchOptions);
      jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.texts).toHaveLength(3);
    });
  });

  // ─── URL フィルタリング ──────────────────────────────────────────────────

  describe('URL フィルタリング', () => {
    it('異なる URL に対して個別にフィルタリングする', async () => {
      const url1 = 'https://example.com/page1';
      const url2 = 'https://example.com/page2';

      mockEq.mockResolvedValue({
        data: [{ selected_text: 'テキスト1' }],
        error: null,
      });

      const result1Promise = reader.fetchSavedTexts({ pageUrl: url1 });
      jest.runAllTimersAsync();
      await result1Promise;

      const result2Promise = reader.fetchSavedTexts({ pageUrl: url2 });
      jest.runAllTimersAsync();
      await result2Promise;

      expect(mockEq).toHaveBeenCalledWith('page_url', url1);
      expect(mockEq).toHaveBeenCalledWith('page_url', url2);
    });
  });
});
