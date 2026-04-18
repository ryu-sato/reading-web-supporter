/**
 * Content Script: メモ入力オーバーレイ UI
 * タスク 10.1: MemoInputUI コンポーネントを新規実装
 *
 * Requirements: 5.1, 5.2, 5.3
 */

import type { ShowMemoInputMessage } from '../types/types';

/**
 * メモ入力 UI を初期化し、showMemoInput メッセージのリスナーを登録する。
 * Requirement 5.1: 保存操作実行時にメモ入力 UI を表示する
 */
export function initMemoInputUI(): void {
  chrome.runtime.onMessage.addListener((message: unknown) => {
    const msg = message as { type: string; payload?: unknown };
    if (msg.type !== 'showMemoInput') {
      return;
    }

    const showMemoMsg = message as ShowMemoInputMessage;
    const { selectedText, pageUrl } = showMemoMsg.payload;

    showMemoInputOverlay(selectedText, pageUrl);
  });
}

/**
 * メモ入力オーバーレイを DOM に挿入して表示する。
 * Shadow DOM でページのグローバル CSS の影響を排除する。
 */
function showMemoInputOverlay(selectedText: string, pageUrl: string): void {
  // オーバーレイ外側の div（背景）
  const overlay = document.createElement('div');
  overlay.setAttribute('data-testid', 'memo-input-overlay');
  overlay.style.cssText = [
    'position: fixed',
    'top: 0',
    'left: 0',
    'width: 100%',
    'height: 100%',
    'z-index: 2147483647',
    'display: flex',
    'align-items: center',
    'justify-content: center',
    'background: rgba(0, 0, 0, 0.5)',
  ].join('; ');

  // Shadow DOM をアタッチしてスタイルを分離
  const shadowRoot = overlay.attachShadow({ mode: 'open' });

  // ダイアログ要素
  const dialog = document.createElement('div');
  dialog.setAttribute('data-testid', 'memo-input-dialog');
  dialog.style.cssText = [
    'background: #fff',
    'border-radius: 8px',
    'padding: 24px',
    'min-width: 320px',
    'max-width: 480px',
    'box-shadow: 0 4px 24px rgba(0,0,0,0.2)',
    'display: flex',
    'flex-direction: column',
    'gap: 12px',
  ].join('; ');

  // 選択テキストのプレビュー
  const preview = document.createElement('div');
  preview.setAttribute('data-testid', 'selected-text-preview');
  preview.style.cssText = [
    'font-size: 14px',
    'color: #333',
    'background: #f5f5f5',
    'border-left: 3px solid #4a90e2',
    'padding: 8px 12px',
    'border-radius: 4px',
    'max-height: 80px',
    'overflow-y: auto',
    'word-break: break-word',
  ].join('; ');
  preview.textContent = selectedText;

  // メモ入力 textarea
  const textarea = document.createElement('textarea');
  textarea.setAttribute('data-testid', 'memo-textarea');
  textarea.placeholder = 'メモを入力（任意）';
  textarea.rows = 4;
  textarea.style.cssText = [
    'width: 100%',
    'box-sizing: border-box',
    'border: 1px solid #ccc',
    'border-radius: 4px',
    'padding: 8px',
    'font-size: 14px',
    'resize: vertical',
  ].join('; ');

  // ボタンコンテナ
  const buttonContainer = document.createElement('div');
  buttonContainer.style.cssText = [
    'display: flex',
    'justify-content: flex-end',
    'gap: 8px',
  ].join('; ');

  // Cancel ボタン
  const cancelBtn = document.createElement('button');
  cancelBtn.setAttribute('data-testid', 'cancel-button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.style.cssText = [
    'padding: 8px 16px',
    'border: 1px solid #ccc',
    'background: #fff',
    'border-radius: 4px',
    'cursor: pointer',
    'font-size: 14px',
  ].join('; ');

  // Save ボタン
  const saveBtn = document.createElement('button');
  saveBtn.setAttribute('data-testid', 'save-button');
  saveBtn.textContent = 'Save';
  saveBtn.style.cssText = [
    'padding: 8px 16px',
    'border: none',
    'background: #4a90e2',
    'color: #fff',
    'border-radius: 4px',
    'cursor: pointer',
    'font-size: 14px',
  ].join('; ');

  // ダイアログを閉じる処理
  function closeOverlay(): void {
    if (overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
  }

  // Save ボタン押下: saveSelection メッセージ送信 → オーバーレイを閉じる（5.2, 5.3）
  saveBtn.addEventListener('click', () => {
    const memoValue = textarea.value.trim();
    const payload: {
      selectedText: string;
      pageUrl: string;
      timestamp: string;
      memo?: string;
    } = {
      selectedText,
      pageUrl,
      timestamp: new Date().toISOString(),
    };

    if (memoValue !== '') {
      payload.memo = memoValue;
    }

    chrome.runtime.sendMessage({ type: 'saveSelection', payload });
    closeOverlay();
  });

  // Cancel ボタン押下: 保存せずにダイアログを閉じる
  cancelBtn.addEventListener('click', () => {
    closeOverlay();
  });

  // ダイアログ内クリックはイベント伝播を止め、オーバーレイ背景クリックによる閉じ処理を防ぐ
  dialog.addEventListener('click', (event: Event) => {
    event.stopPropagation();
  });

  // オーバーレイ背景クリック: Cancel と同等（メッセージ送信なしで閉じる）
  overlay.addEventListener('click', () => {
    closeOverlay();
  });

  // DOM を組み立て
  buttonContainer.appendChild(cancelBtn);
  buttonContainer.appendChild(saveBtn);
  dialog.appendChild(preview);
  dialog.appendChild(textarea);
  dialog.appendChild(buttonContainer);
  shadowRoot.appendChild(dialog);

  document.body.appendChild(overlay);
}
