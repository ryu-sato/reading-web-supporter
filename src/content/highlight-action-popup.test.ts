/**
 * @jest-environment jsdom
 *
 * HighlightActionPopup ユニットテスト
 * タスク 16.1: R6メモ編集・削除機能のユニットテスト
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6
 */

import { HighlightActionPopup } from './highlight-action-popup';

// Chrome Runtime API をモック
const mockSendMessage = jest.fn();

Object.defineProperty(globalThis, 'chrome', {
  value: {
    runtime: {
      sendMessage: mockSendMessage,
    },
  },
  writable: true,
  configurable: true,
});

describe('HighlightActionPopup', () => {
  let popup: HighlightActionPopup;
  let onMemoUpdated: jest.Mock;
  let onHighlightDeleted: jest.Mock;
  let anchorEl: HTMLElement;

  beforeEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = '';

    popup = new HighlightActionPopup();
    onMemoUpdated = jest.fn();
    onHighlightDeleted = jest.fn();
    popup.setCallbacks(onMemoUpdated, onHighlightDeleted);

    // アンカー要素を作成
    anchorEl = document.createElement('mark');
    anchorEl.className = 'reading-support-highlight';
    anchorEl.textContent = 'テストテキスト';
    document.body.appendChild(anchorEl);
  });

  afterEach(() => {
    popup.close();
    document.body.innerHTML = '';
  });

  // ─── show() - VIEW ステート ────────────────────────────────────────────

  describe('show() - VIEW ステート', () => {
    it('show() 呼び出しで VIEW ステートのポップアップが DOM に挿入される (Req 6.1)', () => {
      popup.show('id-1', 'テストメモ', anchorEl);

      const el = document.querySelector('[data-testid="highlight-action-popup"]');
      expect(el).not.toBeNull();
    });

    it('VIEW ステートで現在のメモ内容が表示される (Req 6.1)', () => {
      popup.show('id-1', 'テストメモ', anchorEl);

      const popupEl = document.querySelector('[data-testid="highlight-action-popup"]') as HTMLElement;
      const shadow = popupEl.shadowRoot!;
      const memoDisplay = shadow.querySelector('[data-testid="memo-display"]');
      expect(memoDisplay?.textContent).toBe('テストメモ');
    });

    it('VIEW ステートで「メモを編集」ボタンが表示される (Req 6.1)', () => {
      popup.show('id-1', 'テストメモ', anchorEl);

      const popupEl = document.querySelector('[data-testid="highlight-action-popup"]') as HTMLElement;
      const shadow = popupEl.shadowRoot!;
      const editBtn = shadow.querySelector('[data-testid="edit-button"]');
      expect(editBtn).not.toBeNull();
    });

    it('VIEW ステートで「ハイライトを削除」ボタンが表示される (Req 6.1)', () => {
      popup.show('id-1', 'テストメモ', anchorEl);

      const popupEl = document.querySelector('[data-testid="highlight-action-popup"]') as HTMLElement;
      const shadow = popupEl.shadowRoot!;
      const deleteBtn = shadow.querySelector('[data-testid="delete-button"]');
      expect(deleteBtn).not.toBeNull();
    });

    it('メモが空欄の場合でも VIEW ステートが表示される (Req 6.1)', () => {
      popup.show('id-1', '', anchorEl);

      const popupEl = document.querySelector('[data-testid="highlight-action-popup"]') as HTMLElement;
      const shadow = popupEl.shadowRoot!;
      const memoDisplay = shadow.querySelector('[data-testid="memo-display"]');
      expect(memoDisplay?.textContent).toBe('');
    });
  });

  // ─── EDIT ステートへの遷移 ────────────────────────────────────────────

  describe('EDIT ステートへの遷移 (Req 6.2)', () => {
    it('「メモを編集」クリックで EDIT ステートに遷移する (Req 6.2)', () => {
      popup.show('id-1', '既存メモ', anchorEl);

      const popupEl = document.querySelector('[data-testid="highlight-action-popup"]') as HTMLElement;
      const shadow = popupEl.shadowRoot!;
      const editBtn = shadow.querySelector('[data-testid="edit-button"]') as HTMLButtonElement;
      editBtn.click();

      const textarea = shadow.querySelector('[data-testid="memo-edit-textarea"]') as HTMLTextAreaElement;
      expect(textarea).not.toBeNull();
    });

    it('EDIT ステートで既存メモが textarea に入力済みである (Req 6.2)', () => {
      popup.show('id-1', '既存メモ', anchorEl);

      const popupEl = document.querySelector('[data-testid="highlight-action-popup"]') as HTMLElement;
      const shadow = popupEl.shadowRoot!;
      const editBtn = shadow.querySelector('[data-testid="edit-button"]') as HTMLButtonElement;
      editBtn.click();

      const textarea = shadow.querySelector('[data-testid="memo-edit-textarea"]') as HTMLTextAreaElement;
      expect(textarea.value).toBe('既存メモ');
    });

    it('EDIT ステートで「保存」ボタンが表示される', () => {
      popup.show('id-1', '既存メモ', anchorEl);

      const popupEl = document.querySelector('[data-testid="highlight-action-popup"]') as HTMLElement;
      const shadow = popupEl.shadowRoot!;
      const editBtn = shadow.querySelector('[data-testid="edit-button"]') as HTMLButtonElement;
      editBtn.click();

      const saveBtn = shadow.querySelector('[data-testid="edit-save-button"]');
      expect(saveBtn).not.toBeNull();
    });
  });

  // ─── 「保存」押下 - updateMemo (Req 6.3) ─────────────────────────────

  describe('「保存」押下 - updateMemo (Req 6.3)', () => {
    it('EDIT 状態で「保存」押下時に updateMemo メッセージが送信される (Req 6.3)', async () => {
      mockSendMessage.mockResolvedValue({ success: true });

      popup.show('id-1', '既存メモ', anchorEl);

      const popupEl = document.querySelector('[data-testid="highlight-action-popup"]') as HTMLElement;
      const shadow = popupEl.shadowRoot!;
      const editBtn = shadow.querySelector('[data-testid="edit-button"]') as HTMLButtonElement;
      editBtn.click();

      const textarea = shadow.querySelector('[data-testid="memo-edit-textarea"]') as HTMLTextAreaElement;
      textarea.value = '新しいメモ';

      const saveBtn = shadow.querySelector('[data-testid="edit-save-button"]') as HTMLButtonElement;
      saveBtn.click();

      await new Promise((r) => setTimeout(r, 0));

      expect(mockSendMessage).toHaveBeenCalledWith({
        type: 'updateMemo',
        payload: { id: 'id-1', memo: '新しいメモ' },
      });
    });

    it('updateMemo 成功時に onMemoUpdated コールバックが呼ばれる (Req 6.3)', async () => {
      mockSendMessage.mockResolvedValue({ success: true });

      popup.show('id-1', '既存メモ', anchorEl);

      const popupEl = document.querySelector('[data-testid="highlight-action-popup"]') as HTMLElement;
      const shadow = popupEl.shadowRoot!;
      const editBtn = shadow.querySelector('[data-testid="edit-button"]') as HTMLButtonElement;
      editBtn.click();

      const textarea = shadow.querySelector('[data-testid="memo-edit-textarea"]') as HTMLTextAreaElement;
      textarea.value = '新しいメモ';

      const saveBtn = shadow.querySelector('[data-testid="edit-save-button"]') as HTMLButtonElement;
      saveBtn.click();

      await new Promise((r) => setTimeout(r, 0));

      expect(onMemoUpdated).toHaveBeenCalledWith('id-1', '新しいメモ');
    });

    it('updateMemo 成功時にポップアップが閉じられる (Req 6.3)', async () => {
      mockSendMessage.mockResolvedValue({ success: true });

      popup.show('id-1', '既存メモ', anchorEl);

      const popupEl = document.querySelector('[data-testid="highlight-action-popup"]') as HTMLElement;
      const shadow = popupEl.shadowRoot!;
      const editBtn = shadow.querySelector('[data-testid="edit-button"]') as HTMLButtonElement;
      editBtn.click();

      const saveBtn = shadow.querySelector('[data-testid="edit-save-button"]') as HTMLButtonElement;
      saveBtn.click();

      await new Promise((r) => setTimeout(r, 0));

      const remaining = document.querySelector('[data-testid="highlight-action-popup"]');
      expect(remaining).toBeNull();
    });
  });

  // ─── 「ハイライトを削除」押下 - 削除確認 (Req 6.4) ──────────────────

  describe('「ハイライトを削除」押下 - 削除確認 (Req 6.4)', () => {
    it('「ハイライトを削除」クリックで削除確認ダイアログが表示される (Req 6.4)', () => {
      popup.show('id-1', 'メモ', anchorEl);

      const popupEl = document.querySelector('[data-testid="highlight-action-popup"]') as HTMLElement;
      const shadow = popupEl.shadowRoot!;
      const deleteBtn = shadow.querySelector('[data-testid="delete-button"]') as HTMLButtonElement;
      deleteBtn.click();

      const confirmMsg = shadow.querySelector('[data-testid="delete-confirm-message"]');
      expect(confirmMsg).not.toBeNull();
    });

    it('削除確認後に deleteHighlight メッセージが送信される (Req 6.4)', async () => {
      mockSendMessage.mockResolvedValue({ success: true });

      popup.show('id-1', 'メモ', anchorEl);

      const popupEl = document.querySelector('[data-testid="highlight-action-popup"]') as HTMLElement;
      const shadow = popupEl.shadowRoot!;
      const deleteBtn = shadow.querySelector('[data-testid="delete-button"]') as HTMLButtonElement;
      deleteBtn.click();

      const confirmBtn = shadow.querySelector('[data-testid="delete-confirm-button"]') as HTMLButtonElement;
      confirmBtn.click();

      await new Promise((r) => setTimeout(r, 0));

      expect(mockSendMessage).toHaveBeenCalledWith({
        type: 'deleteHighlight',
        payload: { id: 'id-1' },
      });
    });

    it('deleteHighlight 成功時に onHighlightDeleted コールバックが呼ばれる (Req 6.4)', async () => {
      mockSendMessage.mockResolvedValue({ success: true });

      popup.show('id-1', 'メモ', anchorEl);

      const popupEl = document.querySelector('[data-testid="highlight-action-popup"]') as HTMLElement;
      const shadow = popupEl.shadowRoot!;
      const deleteBtn = shadow.querySelector('[data-testid="delete-button"]') as HTMLButtonElement;
      deleteBtn.click();

      const confirmBtn = shadow.querySelector('[data-testid="delete-confirm-button"]') as HTMLButtonElement;
      confirmBtn.click();

      await new Promise((r) => setTimeout(r, 0));

      expect(onHighlightDeleted).toHaveBeenCalledWith('id-1');
    });
  });

  // ─── エラー処理 (Req 6.5) ────────────────────────────────────────────

  describe('エラー処理 (Req 6.5)', () => {
    it('updateMemo 失敗時にエラーメッセージが表示される (Req 6.5)', async () => {
      mockSendMessage.mockResolvedValue({
        success: false,
        error: { code: 'NETWORK_ERROR', message: '更新エラー', recoveryHint: '再試行してください' },
      });

      popup.show('id-1', '既存メモ', anchorEl);

      const popupEl = document.querySelector('[data-testid="highlight-action-popup"]') as HTMLElement;
      const shadow = popupEl.shadowRoot!;
      const editBtn = shadow.querySelector('[data-testid="edit-button"]') as HTMLButtonElement;
      editBtn.click();

      const saveBtn = shadow.querySelector('[data-testid="edit-save-button"]') as HTMLButtonElement;
      saveBtn.click();

      await new Promise((r) => setTimeout(r, 0));

      const errorDiv = shadow.querySelector('[data-testid="error-message"]') as HTMLElement;
      expect(errorDiv.style.display).not.toBe('none');
      expect(errorDiv.textContent).toBe('更新エラー');
    });

    it('updateMemo 失敗時にポップアップが維持される (Req 6.5)', async () => {
      mockSendMessage.mockResolvedValue({
        success: false,
        error: { code: 'NETWORK_ERROR', message: '更新エラー', recoveryHint: '再試行' },
      });

      popup.show('id-1', '既存メモ', anchorEl);

      const popupEl = document.querySelector('[data-testid="highlight-action-popup"]') as HTMLElement;
      const shadow = popupEl.shadowRoot!;
      const editBtn = shadow.querySelector('[data-testid="edit-button"]') as HTMLButtonElement;
      editBtn.click();

      const saveBtn = shadow.querySelector('[data-testid="edit-save-button"]') as HTMLButtonElement;
      saveBtn.click();

      await new Promise((r) => setTimeout(r, 0));

      // ポップアップは維持される
      const remaining = document.querySelector('[data-testid="highlight-action-popup"]');
      expect(remaining).not.toBeNull();
      // コールバックは呼ばれない
      expect(onMemoUpdated).not.toHaveBeenCalled();
    });

    it('deleteHighlight 失敗時にエラーメッセージが表示される (Req 6.5)', async () => {
      mockSendMessage.mockResolvedValue({
        success: false,
        error: { code: 'NETWORK_ERROR', message: '削除エラー', recoveryHint: '再試行' },
      });

      popup.show('id-1', 'メモ', anchorEl);

      const popupEl = document.querySelector('[data-testid="highlight-action-popup"]') as HTMLElement;
      const shadow = popupEl.shadowRoot!;
      const deleteBtn = shadow.querySelector('[data-testid="delete-button"]') as HTMLButtonElement;
      deleteBtn.click();

      const confirmBtn = shadow.querySelector('[data-testid="delete-confirm-button"]') as HTMLButtonElement;
      confirmBtn.click();

      await new Promise((r) => setTimeout(r, 0));

      const errorDiv = shadow.querySelector('[data-testid="error-message"]') as HTMLElement;
      expect(errorDiv.style.display).not.toBe('none');
      expect(errorDiv.textContent).toBe('削除エラー');
    });

    it('deleteHighlight 失敗時にポップアップが維持される (Req 6.5)', async () => {
      mockSendMessage.mockResolvedValue({
        success: false,
        error: { code: 'NETWORK_ERROR', message: '削除エラー', recoveryHint: '再試行' },
      });

      popup.show('id-1', 'メモ', anchorEl);

      const popupEl = document.querySelector('[data-testid="highlight-action-popup"]') as HTMLElement;
      const shadow = popupEl.shadowRoot!;
      const deleteBtn = shadow.querySelector('[data-testid="delete-button"]') as HTMLButtonElement;
      deleteBtn.click();

      const confirmBtn = shadow.querySelector('[data-testid="delete-confirm-button"]') as HTMLButtonElement;
      confirmBtn.click();

      await new Promise((r) => setTimeout(r, 0));

      // ポップアップは維持される
      const remaining = document.querySelector('[data-testid="highlight-action-popup"]');
      expect(remaining).not.toBeNull();
      // コールバックは呼ばれない
      expect(onHighlightDeleted).not.toHaveBeenCalled();
    });
  });

  // ─── キャンセル操作 (Req 6.6) ────────────────────────────────────────

  describe('キャンセル操作 (Req 6.6)', () => {
    it('EDIT ステートでキャンセル押下すると updateMemo が送信されない (Req 6.6)', () => {
      popup.show('id-1', '既存メモ', anchorEl);

      const popupEl = document.querySelector('[data-testid="highlight-action-popup"]') as HTMLElement;
      const shadow = popupEl.shadowRoot!;
      const editBtn = shadow.querySelector('[data-testid="edit-button"]') as HTMLButtonElement;
      editBtn.click();

      const cancelBtn = shadow.querySelector('[data-testid="edit-cancel-button"]') as HTMLButtonElement;
      cancelBtn.click();

      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it('削除確認でキャンセル押下すると deleteHighlight が送信されない (Req 6.6)', () => {
      popup.show('id-1', 'メモ', anchorEl);

      const popupEl = document.querySelector('[data-testid="highlight-action-popup"]') as HTMLElement;
      const shadow = popupEl.shadowRoot!;
      const deleteBtn = shadow.querySelector('[data-testid="delete-button"]') as HTMLButtonElement;
      deleteBtn.click();

      const cancelBtn = shadow.querySelector('[data-testid="delete-cancel-button"]') as HTMLButtonElement;
      cancelBtn.click();

      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it('close() 呼び出しでポップアップが DOM から除去される (Req 6.6)', () => {
      popup.show('id-1', 'メモ', anchorEl);
      popup.close();

      const el = document.querySelector('[data-testid="highlight-action-popup"]');
      expect(el).toBeNull();
    });
  });

  // ─── XSS 防止 ────────────────────────────────────────────────────────

  describe('XSS 防止', () => {
    it('メモ表示は textContent のみを使用する（innerHTML 禁止）', () => {
      const xssPayload = '<script>alert("xss")</script>';
      popup.show('id-1', xssPayload, anchorEl);

      const popupEl = document.querySelector('[data-testid="highlight-action-popup"]') as HTMLElement;
      const shadow = popupEl.shadowRoot!;
      const memoDisplay = shadow.querySelector('[data-testid="memo-display"]');

      // textContent はタグを解釈しない
      expect(memoDisplay?.textContent).toBe(xssPayload);
      // script タグとして解釈されていない
      expect(shadow.querySelector('script')).toBeNull();
    });
  });
});
