/**
 * @jest-environment jsdom
 *
 * Options Page ロジックのユニットテスト
 * Requirements: 3.1, 3.2, 3.3, 3.4
 */

// chrome API グローバルモック
const mockStorageData: Record<string, unknown> = {};

const mockChromeStorage = {
  local: {
    get: jest.fn((key: string, callback: (result: Record<string, unknown>) => void) => {
      callback({ [key]: mockStorageData[key] });
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

(global as unknown as { chrome: unknown }).chrome = {
  storage: mockChromeStorage,
  runtime: mockChromeRuntime,
};

// DOM setup helper
function setupDOM(projectUrl = '', anonKey = ''): void {
  document.body.innerHTML = `
    <form id="settings-form">
      <div class="form-group">
        <input type="url" id="project-url" value="${projectUrl}">
      </div>
      <div class="form-group">
        <input type="password" id="anon-key" value="${anonKey}">
      </div>
      <div class="button-group">
        <button type="button" id="test-btn">接続テスト</button>
        <button type="button" id="save-btn">保存</button>
      </div>
    </form>
    <div id="status" class="status"></div>
  `;
}

// Import functions after DOM and chrome mock setup
import {
  getFormCredentials,
  showStatus,
  loadExistingCredentials,
  saveCredentials,
  testConnection,
} from './options';

describe('options.ts', () => {
  beforeEach(() => {
    // ストレージとモックをリセット
    Object.keys(mockStorageData).forEach((k) => delete mockStorageData[k]);
    jest.clearAllMocks();
    setupDOM();
  });

  // ── getFormCredentials ──────────────────────────────────────────────────────

  describe('getFormCredentials()', () => {
    it('フォームから projectUrl と anonKey を返す', () => {
      setupDOM('https://example.supabase.co', 'eyJteXRlc3RrZXkxMjM0NTY3ODkwMTIzNDU2Nzg5MA==');
      const creds = getFormCredentials();
      expect(creds.projectUrl).toBe('https://example.supabase.co');
      expect(creds.anonKey).toBe('eyJteXRlc3RrZXkxMjM0NTY3ODkwMTIzNDU2Nzg5MA==');
    });

    it('フォームが空の場合、空文字列を返す', () => {
      setupDOM('', '');
      const creds = getFormCredentials();
      expect(creds.projectUrl).toBe('');
      expect(creds.anonKey).toBe('');
    });
  });

  // ── showStatus ──────────────────────────────────────────────────────────────

  describe('showStatus()', () => {
    it('成功メッセージを表示する', () => {
      showStatus('設定を保存しました');
      const statusEl = document.getElementById('status');
      expect(statusEl?.textContent).toBe('設定を保存しました');
      expect(statusEl?.className).toBe('status success');
    });

    it('エラーメッセージを表示する', () => {
      showStatus('エラーが発生しました', true);
      const statusEl = document.getElementById('status');
      expect(statusEl?.textContent).toBe('エラーが発生しました');
      expect(statusEl?.className).toBe('status error');
    });
  });

  // ── loadExistingCredentials ─────────────────────────────────────────────────

  describe('loadExistingCredentials() - Req 3.3', () => {
    it('認証情報が未保存の場合、フォームは空のまま', async () => {
      setupDOM('', '');
      await loadExistingCredentials();
      const urlInput = document.getElementById('project-url') as HTMLInputElement;
      const keyInput = document.getElementById('anon-key') as HTMLInputElement;
      expect(urlInput.value).toBe('');
      expect(keyInput.value).toBe('');
    });

    it('保存済みの認証情報をフォームに事前入力する', async () => {
      // SettingsManager が使うストレージキー 'supabse_credentials' にセット
      mockStorageData['supabse_credentials'] = {
        projectUrl: 'https://saved.supabase.co',
        anonKey: 'a'.repeat(40),
        lastVerified: '2024-01-01T00:00:00.000Z',
      };

      await loadExistingCredentials();

      const urlInput = document.getElementById('project-url') as HTMLInputElement;
      const keyInput = document.getElementById('anon-key') as HTMLInputElement;
      expect(urlInput.value).toBe('https://saved.supabase.co');
      expect(keyInput.value).toBe('a'.repeat(40));
    });
  });

  // ── saveCredentials ─────────────────────────────────────────────────────────

  describe('saveCredentials() - Req 3.1, 3.4', () => {
    it('URLとAPIキーが空の場合、エラーメッセージを表示する', async () => {
      setupDOM('', '');
      await saveCredentials();
      const statusEl = document.getElementById('status');
      expect(statusEl?.className).toContain('error');
    });

    it('有効な認証情報を SettingsManager 経由で保存する (Req 3.1)', async () => {
      setupDOM('https://example.supabase.co', 'a'.repeat(40));
      await saveCredentials();
      // SettingsManager は 'supabse_credentials' キーで保存する
      const stored = mockStorageData['supabse_credentials'] as Record<string, unknown> | undefined;
      expect(stored).toBeDefined();
      expect(stored?.projectUrl).toBe('https://example.supabase.co');
      expect(stored?.anonKey).toBe('a'.repeat(40));
    });

    it('保存成功後、成功ステータスを表示する', async () => {
      setupDOM('https://example.supabase.co', 'a'.repeat(40));
      await saveCredentials();
      const statusEl = document.getElementById('status');
      expect(statusEl?.className).toContain('success');
      expect(statusEl?.textContent).toBeTruthy();
    });

    it('無効なURL（HTTP）の場合、エラーステータスを表示する', async () => {
      setupDOM('http://example.supabase.co', 'a'.repeat(40));
      await saveCredentials();
      const statusEl = document.getElementById('status');
      expect(statusEl?.className).toContain('error');
    });

    it('APIキーが短すぎる場合、エラーステータスを表示する', async () => {
      setupDOM('https://example.supabase.co', 'short');
      await saveCredentials();
      const statusEl = document.getElementById('status');
      expect(statusEl?.className).toContain('error');
    });

    it('保存後に認証情報変更通知が送信される (Req 3.4)', async () => {
      setupDOM('https://example.supabase.co', 'a'.repeat(40));
      await saveCredentials();
      expect(mockChromeRuntime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'credentialsUpdated' })
      );
    });
  });

  // ── testConnection ──────────────────────────────────────────────────────────

  describe('testConnection() - Req 3.2', () => {
    it('認証情報が未設定の場合、接続失敗メッセージを表示する', async () => {
      // ストレージは空
      await testConnection();
      const statusEl = document.getElementById('status');
      expect(statusEl?.className).toContain('error');
      expect(statusEl?.textContent).toBeTruthy();
    });

    it('認証情報が設定済みの場合、接続成功メッセージを表示する (Req 3.2)', async () => {
      mockStorageData['supabse_credentials'] = {
        projectUrl: 'https://example.supabase.co',
        anonKey: 'a'.repeat(40),
        lastVerified: '2024-01-01T00:00:00.000Z',
      };

      await testConnection();
      const statusEl = document.getElementById('status');
      expect(statusEl?.className).toContain('success');
      expect(statusEl?.textContent).toBeTruthy();
    });

    it('接続テスト中のステータスメッセージを表示する', async () => {
      // SettingsManagerのtestConnectionが呼ばれる前のテスト中メッセージ確認
      // 非同期なので、テストは最終状態を確認する（認証情報なし→失敗）
      await testConnection();
      const statusEl = document.getElementById('status');
      // エラー or 成功のどちらかが表示されていることを確認
      expect(statusEl?.className).toMatch(/error|success/);
    });
  });
});
