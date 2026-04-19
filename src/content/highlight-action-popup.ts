/**
 * Content Script: ハイライトクリック時のアクションポップアップ UI
 * タスク 14.1: HighlightActionPopup コンポーネントを実装する
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6
 *
 * VIEW ステート: 現在のメモ・「メモを編集」・「ハイライトを削除」ボタン
 * EDIT ステート: 既存メモが入力済みの textarea と「保存」・「キャンセル」ボタン
 * Shadow DOM でページのグローバル CSS の影響を排除する
 */

import type { UpdateMemoMessage, DeleteHighlightMessage, UpdateResult, DeleteResult } from '../types/types';

/**
 * メモ更新後に呼び出すコールバック
 * Requirement 6.3: 保存後にツールチップ表示を即座に更新する
 */
export type OnMemoUpdatedCallback = (id: string, newMemo: string) => void;

/**
 * ハイライト削除後に呼び出すコールバック
 * Requirement 6.4: 削除後にページ上のハイライト表示を即座に除去する
 */
export type OnHighlightDeletedCallback = (id: string) => void;

/** Chrome Runtime API の最小インターフェース（テスト環境に対応） */
interface ChromeRuntime {
  sendMessage(message: unknown): Promise<unknown>;
}

function getChromeRuntime(): ChromeRuntime | null {
  const g = globalThis as unknown as { chrome?: { runtime?: ChromeRuntime } };
  return g.chrome?.runtime ?? null;
}

/**
 * ハイライトクリック時のメモ表示・編集・削除 UI を管理するクラス
 *
 * Requirement 6.1: ハイライトをクリックすると VIEW ポップアップを表示する
 * Requirement 6.2: 「メモを編集」で既存メモ入力済みの EDIT ステートに遷移する
 * Requirement 6.3: 「保存」押下で updateMemo メッセージを送信しコールバックを呼び出す
 * Requirement 6.4: 「ハイライトを削除」押下で削除確認後 deleteHighlight を送信する
 * Requirement 6.5: 更新・削除失敗時はエラーメッセージを表示しポップアップを維持する
 * Requirement 6.6: ポップアップ外クリックまたはキャンセル押下でポップアップを閉じる
 */
export class HighlightActionPopup {
  private onMemoUpdated: OnMemoUpdatedCallback | null = null;
  private onHighlightDeleted: OnHighlightDeletedCallback | null = null;

  /** 現在表示中のポップアップ要素（null = 非表示） */
  private currentPopup: HTMLElement | null = null;

  /** ポップアップ外クリックを検知するハンドラ（登録・解除を管理） */
  private outsideClickHandler: ((e: MouseEvent) => void) | null = null;

  /**
   * コールバックを設定する
   */
  setCallbacks(
    onMemoUpdated: OnMemoUpdatedCallback,
    onHighlightDeleted: OnHighlightDeletedCallback
  ): void {
    this.onMemoUpdated = onMemoUpdated;
    this.onHighlightDeleted = onHighlightDeleted;
  }

  /**
   * ポップアップを表示する（VIEW ステート）
   * Requirement 6.1: ハイライトクリック時に VIEW ポップアップを表示する
   *
   * @param id - レコードの識別子
   * @param currentMemo - 現在のメモ内容（未設定の場合は空文字）
   * @param anchorEl - ポップアップを表示する基準要素（<mark> 要素）
   */
  show(id: string, currentMemo: string, anchorEl: HTMLElement): void {
    // 既存ポップアップを閉じる
    this.close();

    const popup = this.createPopupElement();
    this.renderViewState(popup, id, currentMemo, anchorEl);
    document.body.appendChild(popup);
    this.currentPopup = popup;

    // ポップアップ外クリックで閉じる（Requirement 6.6）
    this.setupOutsideClickHandler(popup);

    // アンカー要素の近傍に配置
    this.positionPopup(popup, anchorEl);
  }

  /**
   * ポップアップを閉じる
   * Requirement 6.6: ポップアップを閉じる
   */
  close(): void {
    if (this.currentPopup && this.currentPopup.parentNode) {
      this.currentPopup.parentNode.removeChild(this.currentPopup);
    }
    this.currentPopup = null;

    if (this.outsideClickHandler) {
      document.removeEventListener('mousedown', this.outsideClickHandler);
      this.outsideClickHandler = null;
    }
  }

  /**
   * ポップアップ要素（Shadow DOM ホスト）を作成する
   */
  private createPopupElement(): HTMLElement {
    const host = document.createElement('div');
    host.setAttribute('data-testid', 'highlight-action-popup');
    host.style.cssText = [
      'position: absolute',
      'z-index: 2147483646',
    ].join('; ');

    host.attachShadow({ mode: 'open' });
    return host;
  }

  /**
   * VIEW ステートをレンダリングする
   * Requirement 6.1: 現在のメモ内容・「メモを編集」・「ハイライトを削除」ボタンを表示
   */
  private renderViewState(
    host: HTMLElement,
    id: string,
    currentMemo: string,
    anchorEl: HTMLElement
  ): void {
    const shadow = host.shadowRoot!;
    shadow.innerHTML = '';

    const container = this.createContainer();

    // メモ内容表示（未設定の場合は空欄）
    const memoDisplay = document.createElement('div');
    memoDisplay.setAttribute('data-testid', 'memo-display');
    memoDisplay.style.cssText = [
      'font-size: 13px',
      'color: #333',
      'margin-bottom: 10px',
      'word-break: break-word',
      'min-height: 20px',
    ].join('; ');
    // XSS 防止のため textContent のみ使用（innerHTML 禁止）
    memoDisplay.textContent = currentMemo;

    // ボタンコンテナ
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display: flex; gap: 8px; justify-content: flex-end;';

    // 「ハイライトを削除」ボタン
    const deleteBtn = document.createElement('button');
    deleteBtn.setAttribute('data-testid', 'delete-button');
    deleteBtn.textContent = 'ハイライトを削除';
    deleteBtn.style.cssText = this.buttonStyle('#dc3545', '#fff');

    // 「メモを編集」ボタン
    const editBtn = document.createElement('button');
    editBtn.setAttribute('data-testid', 'edit-button');
    editBtn.textContent = 'メモを編集';
    editBtn.style.cssText = this.buttonStyle('#4a90e2', '#fff');

    // 「メモを編集」クリック → EDIT ステートへ遷移（Requirement 6.2）
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.renderEditState(host, id, currentMemo, anchorEl);
    });

    // 「ハイライトを削除」クリック → 削除確認（Requirement 6.4）
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.renderDeleteConfirmState(host, id);
    });

    btnRow.appendChild(deleteBtn);
    btnRow.appendChild(editBtn);
    container.appendChild(memoDisplay);
    container.appendChild(btnRow);
    shadow.appendChild(container);
  }

  /**
   * EDIT ステートをレンダリングする
   * Requirement 6.2: 既存メモが入力済みの textarea と「保存」・「キャンセル」ボタン
   */
  private renderEditState(
    host: HTMLElement,
    id: string,
    currentMemo: string,
    anchorEl: HTMLElement
  ): void {
    const shadow = host.shadowRoot!;
    shadow.innerHTML = '';

    const container = this.createContainer();

    // メモ入力 textarea
    const textarea = document.createElement('textarea');
    textarea.setAttribute('data-testid', 'memo-edit-textarea');
    textarea.value = currentMemo;
    textarea.rows = 4;
    textarea.style.cssText = [
      'width: 100%',
      'box-sizing: border-box',
      'border: 1px solid #ccc',
      'border-radius: 4px',
      'padding: 8px',
      'font-size: 13px',
      'resize: vertical',
      'margin-bottom: 10px',
    ].join('; ');

    // エラーメッセージ表示エリア
    const errorDiv = document.createElement('div');
    errorDiv.setAttribute('data-testid', 'error-message');
    errorDiv.style.cssText = 'font-size: 12px; color: #dc3545; margin-bottom: 8px; display: none;';

    // ボタンコンテナ
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display: flex; gap: 8px; justify-content: flex-end;';

    // 「キャンセル」ボタン
    const cancelBtn = document.createElement('button');
    cancelBtn.setAttribute('data-testid', 'edit-cancel-button');
    cancelBtn.textContent = 'キャンセル';
    cancelBtn.style.cssText = this.buttonStyle('#6c757d', '#fff');

    // 「保存」ボタン
    const saveBtn = document.createElement('button');
    saveBtn.setAttribute('data-testid', 'edit-save-button');
    saveBtn.textContent = '保存';
    saveBtn.style.cssText = this.buttonStyle('#4a90e2', '#fff');

    // 「キャンセル」→ VIEW ステートに戻る（保存しない）（Requirement 6.6）
    cancelBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.renderViewState(host, id, currentMemo, anchorEl);
    });

    // 「保存」→ updateMemo メッセージ送信（Requirement 6.3）
    saveBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const newMemo = textarea.value;
      saveBtn.disabled = true;
      errorDiv.style.display = 'none';

      const result = await this.sendUpdateMemo(id, newMemo);

      if (result.success) {
        this.onMemoUpdated?.(id, newMemo);
        this.close();
      } else {
        // Requirement 6.5: 失敗時はエラーを表示してポップアップを維持
        errorDiv.textContent = result.error?.message ?? '更新に失敗しました。';
        errorDiv.style.display = 'block';
        saveBtn.disabled = false;
      }
    });

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(saveBtn);
    container.appendChild(textarea);
    container.appendChild(errorDiv);
    container.appendChild(btnRow);
    shadow.appendChild(container);
  }

  /**
   * 削除確認ステートをレンダリングする
   * Requirement 6.4: 削除確認を求めた上でハイライトを削除する
   */
  private renderDeleteConfirmState(host: HTMLElement, id: string): void {
    const shadow = host.shadowRoot!;
    shadow.innerHTML = '';

    const container = this.createContainer();

    // 確認メッセージ
    const confirmMsg = document.createElement('div');
    confirmMsg.setAttribute('data-testid', 'delete-confirm-message');
    confirmMsg.textContent = 'このハイライトを削除しますか？';
    confirmMsg.style.cssText = 'font-size: 13px; color: #333; margin-bottom: 12px;';

    // エラーメッセージ表示エリア
    const errorDiv = document.createElement('div');
    errorDiv.setAttribute('data-testid', 'error-message');
    errorDiv.style.cssText = 'font-size: 12px; color: #dc3545; margin-bottom: 8px; display: none;';

    // ボタンコンテナ
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display: flex; gap: 8px; justify-content: flex-end;';

    // 「キャンセル」ボタン
    const cancelBtn = document.createElement('button');
    cancelBtn.setAttribute('data-testid', 'delete-cancel-button');
    cancelBtn.textContent = 'キャンセル';
    cancelBtn.style.cssText = this.buttonStyle('#6c757d', '#fff');

    // 「削除」ボタン
    const confirmDeleteBtn = document.createElement('button');
    confirmDeleteBtn.setAttribute('data-testid', 'delete-confirm-button');
    confirmDeleteBtn.textContent = '削除';
    confirmDeleteBtn.style.cssText = this.buttonStyle('#dc3545', '#fff');

    // キャンセル → ポップアップを閉じる（Requirement 6.6）
    cancelBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.close();
    });

    // 「削除」確定 → deleteHighlight メッセージ送信
    confirmDeleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      confirmDeleteBtn.disabled = true;
      errorDiv.style.display = 'none';

      const result = await this.sendDeleteHighlight(id);

      if (result.success) {
        this.onHighlightDeleted?.(id);
        this.close();
      } else {
        // Requirement 6.5: 失敗時はエラーを表示してポップアップを維持
        errorDiv.textContent = result.error?.message ?? '削除に失敗しました。';
        errorDiv.style.display = 'block';
        confirmDeleteBtn.disabled = false;
      }
    });

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(confirmDeleteBtn);
    container.appendChild(confirmMsg);
    container.appendChild(errorDiv);
    container.appendChild(btnRow);
    shadow.appendChild(container);
  }

  /**
   * updateMemo メッセージを Service Worker へ送信する
   * Requirement 6.3: updateMemo メッセージが Content Script から Service Worker へ流れる
   */
  private async sendUpdateMemo(id: string, memo: string): Promise<UpdateResult> {
    const runtime = getChromeRuntime();
    if (!runtime) {
      return {
        success: false,
        error: {
          code: 'UNKNOWN',
          message: 'Chrome Runtime API が利用不可です',
          recoveryHint: '拡張機能を再起動してください。',
        },
      };
    }

    try {
      const message: UpdateMemoMessage = {
        type: 'updateMemo',
        payload: { id, memo },
      };
      const response = await runtime.sendMessage(message);
      return response as UpdateResult;
    } catch (_e) {
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: 'Service Worker との通信に失敗しました',
          recoveryHint: '拡張機能を再起動してください。',
        },
      };
    }
  }

  /**
   * deleteHighlight メッセージを Service Worker へ送信する
   * Requirement 6.4: deleteHighlight メッセージが Content Script から Service Worker へ流れる
   */
  private async sendDeleteHighlight(id: string): Promise<DeleteResult> {
    const runtime = getChromeRuntime();
    if (!runtime) {
      return {
        success: false,
        error: {
          code: 'UNKNOWN',
          message: 'Chrome Runtime API が利用不可です',
          recoveryHint: '拡張機能を再起動してください。',
        },
      };
    }

    try {
      const message: DeleteHighlightMessage = {
        type: 'deleteHighlight',
        payload: { id },
      };
      const response = await runtime.sendMessage(message);
      return response as DeleteResult;
    } catch (_e) {
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: 'Service Worker との通信に失敗しました',
          recoveryHint: '拡張機能を再起動してください。',
        },
      };
    }
  }

  /**
   * ポップアップのコンテナ要素を作成する
   */
  private createContainer(): HTMLElement {
    const container = document.createElement('div');
    container.setAttribute('data-testid', 'popup-container');
    container.style.cssText = [
      'background: #fff',
      'border-radius: 8px',
      'padding: 16px',
      'min-width: 200px',
      'max-width: 300px',
      'box-shadow: 0 4px 16px rgba(0,0,0,0.2)',
      'font-family: sans-serif',
    ].join('; ');
    return container;
  }

  /**
   * ボタンの共通スタイルを返す
   */
  private buttonStyle(bg: string, color: string): string {
    return [
      `background: ${bg}`,
      `color: ${color}`,
      'border: none',
      'border-radius: 4px',
      'padding: 6px 12px',
      'font-size: 13px',
      'cursor: pointer',
    ].join('; ');
  }

  /**
   * ポップアップをアンカー要素の近傍に配置する
   */
  private positionPopup(popup: HTMLElement, anchorEl: HTMLElement): void {
    const rect = anchorEl.getBoundingClientRect();
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const scrollLeft = window.scrollX || document.documentElement.scrollLeft;

    popup.style.top = `${rect.bottom + scrollTop + 4}px`;
    popup.style.left = `${rect.left + scrollLeft}px`;
  }

  /**
   * ポップアップ外クリックを検知して閉じるハンドラを登録する
   * Requirement 6.6: ポップアップ外クリックで閉じる
   */
  private setupOutsideClickHandler(popup: HTMLElement): void {
    // 既存ハンドラを解除
    if (this.outsideClickHandler) {
      document.removeEventListener('mousedown', this.outsideClickHandler);
    }

    this.outsideClickHandler = (e: MouseEvent) => {
      if (!popup.contains(e.target as Node)) {
        this.close();
      }
    };

    // 非同期で登録（同一クリックイベントで即座に閉じないように）
    setTimeout(() => {
      document.addEventListener('mousedown', this.outsideClickHandler!);
    }, 0);
  }
}
