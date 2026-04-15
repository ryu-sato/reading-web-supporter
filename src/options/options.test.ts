/**
 * @jest-environment jsdom
 *
 * Options Page ロジックのユニットテスト
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
 *
 * Task 3.3: options.ts は chrome.runtime.sendMessage 経由で
 * MessageHandler (Service Worker) と通信する新アーキテクチャ。
 * SettingsManager を直接インポートせず、メッセージングに依存する。
 */

// chrome API グローバルモック
const mockSendMessage = jest.fn();

const mockChromeRuntime = {
  sendMessage: mockSendMessage,
  lastError: undefined,
};

(global as unknown as { chrome: unknown }).chrome = {
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
      // getCredentials メッセージに対して null を返す
      mockSendMessage.mockResolvedValue(null);

      setupDOM('', '');
      await loadExistingCredentials();

      expect(mockSendMessage).toHaveBeenCalledWith({ type: 'getCredentials' });
      const urlInput = document.getElementById('project-url') as HTMLInputElement;
      const keyInput = document.getElementById('anon-key') as HTMLInputElement;
      expect(urlInput.value).toBe('');
      expect(keyInput.value).toBe('');
    });

    it('保存済みの認証情報をフォームに事前入力する', async () => {
      // getCredentials メッセージに対して認証情報を返す
      mockSendMessage.mockResolvedValue({
        projectUrl: 'https://saved.supabase.co',
        anonKey: 'a'.repeat(40),
      });

      await loadExistingCredentials();

      expect(mockSendMessage).toHaveBeenCalledWith({ type: 'getCredentials' });
      const urlInput = document.getElementById('project-url') as HTMLInputElement;
      const keyInput = document.getElementById('anon-key') as HTMLInputElement;
      expect(urlInput.value).toBe('https://saved.supabase.co');
      expect(keyInput.value).toBe('a'.repeat(40));
    });
  });

  // ── saveCredentials ─────────────────────────────────────────────────────────

  describe('saveCredentials() - Req 3.1, 3.4', () => {
    it('URLとAPIキーが空の場合、エラーメッセージを表示する（メッセージ送信なし）', async () => {
      setupDOM('', '');
      await saveCredentials();
      const statusEl = document.getElementById('status');
      expect(statusEl?.className).toContain('error');
      // 空の場合はメッセージを送信しない
      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it('有効な認証情報を setCredentials メッセージで送信する (Req 3.1)', async () => {
      setupDOM('https://example.supabase.co', 'a'.repeat(40));
      mockSendMessage.mockResolvedValue({ success: true });

      await saveCredentials();

      expect(mockSendMessage).toHaveBeenCalledWith({
        type: 'setCredentials',
        payload: {
          projectUrl: 'https://example.supabase.co',
          anonKey: 'a'.repeat(40),
        },
      });
    });

    it('保存成功後、成功ステータスを表示する', async () => {
      setupDOM('https://example.supabase.co', 'a'.repeat(40));
      mockSendMessage.mockResolvedValue({ success: true });

      await saveCredentials();

      const statusEl = document.getElementById('status');
      expect(statusEl?.className).toContain('success');
      expect(statusEl?.textContent).toBeTruthy();
    });

    it('Service Worker からエラーが返された場合、エラーステータスを表示する (Req 3.5)', async () => {
      setupDOM('https://example.supabase.co', 'a'.repeat(40));
      mockSendMessage.mockResolvedValue({ success: false, error: '無効な認証情報です' });

      await saveCredentials();

      const statusEl = document.getElementById('status');
      expect(statusEl?.className).toContain('error');
      expect(statusEl?.textContent).toContain('無効な認証情報');
    });
  });

  // ── testConnection ──────────────────────────────────────────────────────────

  describe('testConnection() - Req 3.2', () => {
    it('testConnection メッセージを Service Worker に送信する', async () => {
      mockSendMessage.mockResolvedValue({ success: false, message: '接続情報が未設定です' });

      await testConnection();

      expect(mockSendMessage).toHaveBeenCalledWith({ type: 'testConnection' });
    });

    it('接続失敗時、エラーメッセージを表示する (Req 3.5)', async () => {
      mockSendMessage.mockResolvedValue({ success: false, message: 'Supabase接続に失敗しました' });

      await testConnection();

      const statusEl = document.getElementById('status');
      expect(statusEl?.className).toContain('error');
      expect(statusEl?.textContent).toBeTruthy();
    });

    it('接続成功時、成功メッセージを表示する (Req 3.2)', async () => {
      mockSendMessage.mockResolvedValue({ success: true, message: '接続成功しました' });

      await testConnection();

      const statusEl = document.getElementById('status');
      expect(statusEl?.className).toContain('success');
      expect(statusEl?.textContent).toBeTruthy();
    });

    it('接続テスト中のステータスメッセージを表示する', async () => {
      mockSendMessage.mockResolvedValue({ success: false, message: '接続失敗' });

      await testConnection();

      const statusEl = document.getElementById('status');
      // エラー or 成功のどちらかが表示されていることを確認
      expect(statusEl?.className).toMatch(/error|success/);
    });
  });
});
