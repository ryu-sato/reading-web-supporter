/**
 * SupabaseWriter のユニットテスト
 * Requirements: 1.2, 1.3, 2.1, 2.2
 */

import { SupabaseWriter } from './supabase-writer';
import { SaveTextOptions, SupabaseCredentials } from '../types/types';
import { createClient } from '@supabase/supabase-js';

// @supabase/supabase-js は src/__mocks__/@supabase/supabase-js.ts でモック済み

const mockCredentials: SupabaseCredentials = {
  projectUrl: 'https://test-project.supabase.co',
  anonKey: 'test-anon-key-that-is-long-enough-for-validation-purpose',
};

const mockSaveOptions: SaveTextOptions = {
  selectedText: 'テスト選択テキスト',
  pageUrl: 'https://example.com/blog/post',
  timestamp: '2026-04-13T00:00:00.000Z',
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
const mockInsert = jest.fn();
const mockFrom = jest.fn();
const mockCreateClient = createClient as jest.Mock;

describe('SupabaseWriter', () => {
  let writer: SupabaseWriter;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // デフォルトのモック設定
    mockGetCredentials.mockResolvedValue(mockCredentials);

    mockInsert.mockResolvedValue({
      data: [{ id: 'test-uuid', created_at: '2026-04-13T00:00:00.000Z' }],
      error: null,
    });

    mockFrom.mockReturnValue({ insert: mockInsert });

    mockCreateClient.mockReturnValue({ from: mockFrom });

    writer = new SupabaseWriter();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ─── save() - 正常系 ──────────────────────────────────────────────────────────

  describe('save() - 正常系', () => {
    it('認証情報が設定済みの場合、readings テーブルへ正常に INSERT する (Req 2.1)', async () => {
      const resultPromise = writer.save(mockSaveOptions);
      jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.id).toBe('test-uuid');
      expect(result.error).toBeUndefined();
    });

    it('INSERT時に selected_text, page_url, created_at, memo(null) を渡す (Req 2.1, 5.2)', async () => {
      const resultPromise = writer.save(mockSaveOptions);
      jest.runAllTimersAsync();
      await resultPromise;

      expect(mockFrom).toHaveBeenCalledWith('readings');
      expect(mockInsert).toHaveBeenCalledWith({
        selected_text: mockSaveOptions.selectedText,
        page_url: mockSaveOptions.pageUrl,
        created_at: mockSaveOptions.timestamp,
        memo: null,
      });
    });

    it('memo あり: INSERT 時に memo カラムに値が格納される (Req 5.2)', async () => {
      const optionsWithMemo: SaveTextOptions = {
        ...mockSaveOptions,
        memo: 'これは重要なメモです',
      };
      const resultPromise = writer.save(optionsWithMemo);
      jest.runAllTimersAsync();
      await resultPromise;

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({ memo: 'これは重要なメモです' })
      );
    });

    it('memo なし (undefined): INSERT 時に memo カラムが null になる (Req 5.2)', async () => {
      const optionsWithoutMemo: SaveTextOptions = {
        selectedText: 'テキスト',
        pageUrl: 'https://example.com',
        timestamp: '2026-04-13T00:00:00.000Z',
        // memo は未定義
      };
      const resultPromise = writer.save(optionsWithoutMemo);
      jest.runAllTimersAsync();
      await resultPromise;

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({ memo: null })
      );
    });

    it('保存成功時に success: true と data を返す (Req 1.3)', async () => {
      const resultPromise = writer.save(mockSaveOptions);
      jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        id: 'test-uuid',
        created_at: '2026-04-13T00:00:00.000Z',
      });
    });
  });

  // ─── save() - 認証情報未設定 ─────────────────────────────────────────────────

  describe('save() - NO_CREDENTIALS エラー', () => {
    it('認証情報が null の場合、NO_CREDENTIALS エラーを返す (Req 2.2)', async () => {
      mockGetCredentials.mockResolvedValue(null);
      const writer2 = new SupabaseWriter();

      const result = await writer2.save(mockSaveOptions);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('NO_CREDENTIALS');
      expect(result.error?.message).toBeDefined();
      expect(result.error?.recoveryHint).toBeDefined();
    });

    it('NO_CREDENTIALS の場合、Supabase クライアントを呼び出さない', async () => {
      mockGetCredentials.mockResolvedValue(null);
      const writer2 = new SupabaseWriter();

      await writer2.save(mockSaveOptions);

      expect(mockFrom).not.toHaveBeenCalled();
    });
  });

  // ─── save() - AUTH_FAILED エラー ─────────────────────────────────────────────

  describe('save() - AUTH_FAILED エラー', () => {
    it('401エラーが返された場合、AUTH_FAILED エラーを返す (Req 2.2)', async () => {
      mockInsert.mockResolvedValue({
        data: null,
        error: { code: '401', message: 'Invalid API key', status: 401 },
      });

      const resultPromise = writer.save(mockSaveOptions);
      jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('AUTH_FAILED');
    });

    it('403エラーが返された場合、AUTH_FAILED エラーを返す (Req 2.2)', async () => {
      mockInsert.mockResolvedValue({
        data: null,
        error: { code: '403', message: 'Forbidden', status: 403 },
      });

      const resultPromise = writer.save(mockSaveOptions);
      jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('AUTH_FAILED');
    });
  });

  // ─── save() - NETWORK_ERROR エラー（リトライロジック）────────────────────────

  describe('save() - NETWORK_ERROR エラーとリトライ', () => {
    it('ネットワーク障害が発生した場合、最大3回リトライして NETWORK_ERROR を返す (Req 2.2)', async () => {
      mockInsert.mockRejectedValue(new Error('fetch failed'));

      const resultPromise = writer.save(mockSaveOptions);
      // 指数バックオフ（1s, 2s, 4s）を進める
      await jest.advanceTimersByTimeAsync(1000);
      await jest.advanceTimersByTimeAsync(2000);
      await jest.advanceTimersByTimeAsync(4000);
      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('NETWORK_ERROR');
      // 3回リトライ（計3回試行）
      expect(mockInsert).toHaveBeenCalledTimes(3);
    });

    it('最初の試行は失敗し2回目で成功した場合、success: true を返す', async () => {
      mockInsert
        .mockRejectedValueOnce(new Error('fetch failed'))
        .mockResolvedValueOnce({
          data: [{ id: 'retry-uuid', created_at: '2026-04-13T00:00:00.000Z' }],
          error: null,
        });

      const resultPromise = writer.save(mockSaveOptions);
      await jest.advanceTimersByTimeAsync(1000);
      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(mockInsert).toHaveBeenCalledTimes(2);
    });

    it('タイムアウト（10秒）が発生した場合、NETWORK_ERROR を返す', async () => {
      mockInsert.mockImplementation(
        () => new Promise((_resolve) => {
          // 永遠にresolveしない（タイムアウトシミュレーション）
        })
      );

      const resultPromise = writer.save(mockSaveOptions);
      // タイムアウト10秒を進める
      await jest.advanceTimersByTimeAsync(10000);
      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('NETWORK_ERROR');
    });
  });

  // ─── save() - DB_ERROR エラー ─────────────────────────────────────────────────

  describe('save() - DB_ERROR エラー', () => {
    it('RLS拒否エラーが返された場合、DB_ERROR を返す (Req 2.2)', async () => {
      mockInsert.mockResolvedValue({
        data: null,
        error: { code: '42501', message: 'permission denied for table readings', status: 403 },
      });

      const resultPromise = writer.save(mockSaveOptions);
      jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('DB_ERROR');
    });

    it('DB制約違反エラーが返された場合、DB_ERROR を返す (Req 2.2)', async () => {
      mockInsert.mockResolvedValue({
        data: null,
        error: { code: '23505', message: 'duplicate key value violates unique constraint', status: 409 },
      });

      const resultPromise = writer.save(mockSaveOptions);
      jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('DB_ERROR');
    });
  });

  // ─── save() - UNKNOWN エラー ──────────────────────────────────────────────────

  describe('save() - UNKNOWN エラー', () => {
    it('分類できないエラーが返された場合、UNKNOWN エラーを返す (Req 2.2)', async () => {
      mockInsert.mockResolvedValue({
        data: null,
        error: { code: '999', message: 'unexpected error', status: 500 },
      });

      const resultPromise = writer.save(mockSaveOptions);
      jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('UNKNOWN');
    });
  });

  // ─── testConnection() ─────────────────────────────────────────────────────────

  describe('testConnection()', () => {
    it('認証情報が設定済みの場合、success: true を返す (Req 3.2)', async () => {
      // testConnection は select().limit() のチェーンで接続確認を行う
      const mockLimit = jest.fn().mockResolvedValue({ data: [], error: null });
      const mockSelect = jest.fn().mockReturnValue({ limit: mockLimit });
      mockFrom.mockReturnValue({ select: mockSelect });

      const result = await writer.testConnection();

      expect(result.success).toBe(true);
      expect(result.message).toBeDefined();
    });

    it('認証情報が未設定の場合、success: false を返す (Req 2.3)', async () => {
      mockGetCredentials.mockResolvedValue(null);
      const writer2 = new SupabaseWriter();

      const result = await writer2.testConnection();

      expect(result.success).toBe(false);
      expect(result.message).toBeDefined();
    });

    it('Supabase接続エラーが発生した場合、success: false を返す', async () => {
      const mockSelect = jest.fn().mockResolvedValue({
        data: null,
        error: { message: 'connection refused' },
      });
      mockFrom.mockReturnValue({ select: mockSelect });

      const result = await writer.testConnection();

      expect(result.success).toBe(false);
    });
  });

  // ─── エラーレスポンスの構造 ───────────────────────────────────────────────────

  describe('エラーレスポンスの構造', () => {
    it('すべてのエラーレスポンスは code, message, recoveryHint を持つ (Req 2.2)', async () => {
      mockGetCredentials.mockResolvedValue(null);
      const writer2 = new SupabaseWriter();

      const result = await writer2.save(mockSaveOptions);

      expect(result.error).toEqual(
        expect.objectContaining({
          code: expect.any(String),
          message: expect.any(String),
          recoveryHint: expect.any(String),
        })
      );
    });
  });
});
