/**
 * Content Script: テキスト選択検知モジュール
 * Requirements: 1.1, 1.4
 *
 * ページ上のテキスト選択を検知し、Service Workerへ通知します。
 */

import type { TextSelectionMessage } from '../types/types';

/** Chrome Extension Runtime API の型定義（テスト環境でのグローバルモックに対応） */
interface ChromeRuntime {
  sendMessage(message: unknown): Promise<unknown>;
}

interface ChromeGlobal {
  runtime: ChromeRuntime;
}

/**
 * テスト環境と本番環境の両方で chrome グローバルにアクセスする
 */
function getChromeRuntime(): ChromeRuntime | null {
  const g = globalThis as unknown as { chrome?: ChromeGlobal };
  return g.chrome?.runtime ?? null;
}

/**
 * テキスト選択の状態を取得する
 */
function getSelectionState(): { selectedText: string; pageUrl: string; hasSelection: boolean } {
  const selection = window.getSelection();
  const selectedText = selection ? selection.toString().trim() : '';
  return {
    selectedText,
    pageUrl: window.location.href,
    hasSelection: selectedText.length > 0,
  };
}

/**
 * Debounce実装
 */
function debounce<T extends (...args: unknown[]) => void>(fn: T, delay: number): T {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return function (...args: unknown[]) {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  } as T;
}

/**
 * 選択状態をService Workerへ通知する
 */
function notifySelectionChange(): void {
  const state = getSelectionState();
  const message: TextSelectionMessage = {
    type: 'textSelectionUpdated',
    payload: state,
  };

  const runtime = getChromeRuntime();
  if (runtime) {
    runtime.sendMessage(message).catch(() => {
      // Service Workerが未起動の場合は無視する
    });
  }
}

// 250ms debounceで選択変更を監視
const debouncedNotify = debounce(notifySelectionChange, 250);

/**
 * テキスト選択の監視を開始する
 * Content Scriptとして注入された際に呼び出される
 */
function initTextSelector(): void {
  document.addEventListener('mouseup', debouncedNotify);
  document.addEventListener('touchend', debouncedNotify);
}

// Content Scriptとして実行された場合に自動初期化
if (typeof document !== 'undefined') {
  initTextSelector();
}

export { getSelectionState, notifySelectionChange, initTextSelector };
