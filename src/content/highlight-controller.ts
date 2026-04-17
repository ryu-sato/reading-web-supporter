/**
 * Content Script: 保存済みテキストのDOM上ハイライト表示モジュール
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
 *
 * ページロード時に保存済みテキストを Supabase から取得し、DOM 上にハイライト表示します。
 */

import type { GetHighlightsMessage, HighlightsResponse } from '../types/types';

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
 * CSS スタイルが既に注入されたかどうかを追跡するフラグ
 */
let cssInjected = false;

/**
 * CSS スタイルを一度だけ <style> タグで注入する
 * Requirement 4.2: ハイライト CSS（`background: #FFFF99; color: inherit;`）を一度だけ注入
 */
function injectHighlightStyles(): void {
  // 既に注入されているかをチェック（フラグとDOM両方で確認）
  if (cssInjected) {
    // フラグが立っていても、実際にスタイルが存在するかを確認
    const styles = document.head.querySelectorAll('style');
    let found = false;
    styles.forEach((style) => {
      if (style.textContent?.includes('reading-support-highlight')) {
        found = true;
      }
    });
    if (found) {
      return;
    }
    // フラグは立っているがスタイルが存在しない場合は、フラグをリセット
    cssInjected = false;
  }

  const style = document.createElement('style');
  style.textContent = `
    mark.reading-support-highlight {
      background: #FFFF99;
      color: inherit;
    }
  `;
  document.head.appendChild(style);
  cssInjected = true;
}

/**
 * DOM TreeWalker を使用してテキストを検索し、見つかった場合は <mark> でラップする
 * Requirement 4.2, 4.3: TreeWalker でテキストノードを走査し、<mark> でラップ
 * Requirement 4.4: 見つからないテキストはスキップして継続
 *
 * @param text - ハイライト対象のテキスト
 * @returns ハイライトが適用されたかどうか
 */
function highlightText(text: string): boolean {
  if (!text || !document.body) {
    return false;
  }

  // TreeWalker フィルタ：mark.reading-support-highlight を除外
  const filter = {
    acceptNode: (node: Node): number => {
      // 親が mark.reading-support-highlight の場合はスキップ
      let parent = node.parentNode;
      while (parent) {
        if (
          parent.nodeType === Node.ELEMENT_NODE &&
          (parent as Element).classList?.contains('reading-support-highlight')
        ) {
          return NodeFilter.FILTER_REJECT;
        }
        parent = parent.parentNode;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  };

  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    filter
  );

  // 最初にすべての候補ノードを収集（DOM修正中のTreeWalkerの不安定さを回避）
  const nodesToProcess: Array<{
    node: Text;
    index: number;
    nodeText: string;
  }> = [];

  let currentNode = walker.nextNode();
  while (currentNode) {
    const nodeText = currentNode.textContent || '';
    const index = nodeText.indexOf(text);

    if (index !== -1 && currentNode.nodeType === Node.TEXT_NODE) {
      nodesToProcess.push({
        node: currentNode as Text,
        index,
        nodeText,
      });
    }

    currentNode = walker.nextNode();
  }

  let highlighted = false;

  // 次に、収集したノードを処理
  for (const { node: textNode, index, nodeText } of nodesToProcess) {
    // テキストの開始より前のテキスト
    const beforeText = nodeText.substring(0, index);
    // ハイライト対象のテキスト
    const highlightedText = nodeText.substring(index, index + text.length);
    // テキストの終了より後のテキスト
    const afterText = nodeText.substring(index + text.length);

    // 親を取得（変更前）
    const parent = textNode.parentNode;
    const nextSibling = textNode.nextSibling;

    if (parent) {
      // 元のテキストノードを削除
      parent.removeChild(textNode);

      // beforeText がある場合、テキストノードを追加
      if (beforeText) {
        parent.insertBefore(document.createTextNode(beforeText), nextSibling);
      }

      // mark 要素を作成してハイライト表示
      const mark = document.createElement('mark');
      mark.className = 'reading-support-highlight';
      mark.textContent = highlightedText;
      parent.insertBefore(mark, nextSibling || null);

      // afterText がある場合、テキストノードを追加
      if (afterText) {
        parent.insertBefore(document.createTextNode(afterText), nextSibling || null);
      }

      highlighted = true;
    }
  }

  return highlighted;
}

/**
 * Service Worker へ isConfigured メッセージを送信して、認証情報の設定状態を確認する
 * Requirement 4.6: 認証情報未設定時はハイライト取得処理を実行しない
 *
 * @returns 認証情報が設定されているかどうか
 */
async function checkIfConfigured(): Promise<boolean> {
  const runtime = getChromeRuntime();
  if (!runtime) {
    return false;
  }

  try {
    const response = await runtime.sendMessage({
      type: 'isConfigured',
    });
    return (response as unknown as { configured?: boolean })?.configured ?? false;
  } catch (_e) {
    // Service Worker が応答しない場合は未設定と見なす
    return false;
  }
}

/**
 * Service Worker へ getHighlights メッセージを送信して、保存済みテキストを取得する
 * Requirement 4.1: ページロード時、保存済みテキストを Supabase から取得
 *
 * @param pageUrl - 現在のページ URL
 * @returns 保存済みテキストの配列、またはエラー情報
 */
async function getHighlights(pageUrl: string): Promise<HighlightsResponse> {
  const runtime = getChromeRuntime();
  if (!runtime) {
    return {
      success: false,
      error: {
        code: 'UNKNOWN',
        message: 'Chrome Runtime API が利用不可です',
      },
    };
  }

  try {
    const message: GetHighlightsMessage = {
      type: 'getHighlights',
      payload: { pageUrl },
    };
    const response = await runtime.sendMessage(message);
    return response as HighlightsResponse;
  } catch (_e) {
    // Service Worker が応答しない場合はサイレント中断
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        message: 'Service Worker との通信に失敗しました',
      },
    };
  }
}

/**
 * requestAnimationFrame 内で複数テキストのハイライト処理を実行する
 * Requirement 4.3: 複数テキストをすべてハイライト表示
 * Requirement 4.4: 見つからないテキストはスキップして継続
 * Requirement 3.6（実装ノート）: メインスレッドをブロックしないようにする
 *
 * @param texts - ハイライト対象のテキスト配列
 */
function highlightTextsInAnimationFrame(texts: string[]): void {
  requestAnimationFrame(() => {
    for (const text of texts) {
      try {
        highlightText(text);
      } catch (_e) {
        // 個別テキストのハイライト失敗は無視して続行
      }
    }
  });
}

/**
 * DOMContentLoaded 後に起動して、保存済みテキストを取得しハイライト表示する
 * Requirement 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
 */
async function initHighlightController(): Promise<void> {
  // 認証情報確認
  const isConfigured = await checkIfConfigured();
  if (!isConfigured) {
    console.debug('[ReadingSupport] 認証情報が未設定のため、ハイライト処理をスキップします');
    return;
  }

  // ハイライト CSS を注入
  injectHighlightStyles();

  // 保存済みテキストを取得
  const currentUrl = window.location.href;
  console.debug('[ReadingSupport] ハイライト取得中:', currentUrl);
  const response = await getHighlights(currentUrl);

  if (!response.success) {
    console.debug('[ReadingSupport] ハイライト取得失敗:', response.error);
    return;
  }

  // 取得した各テキストをハイライト
  const texts = response.texts || [];
  console.debug('[ReadingSupport] 取得したテキスト数:', texts.length, texts);
  if (texts.length > 0) {
    highlightTextsInAnimationFrame(texts);
  }
}

/**
 * HighlightController クラス
 * Requirement 4.1: ページロード時に保存済みテキストを取得しハイライト表示する
 * Requirement 4.6: 認証情報未設定時は処理を中断する
 */
export class HighlightController {
  private isInitialized = false;

  /**
   * コンストラクタで DOMContentLoaded リスナーを登録する
   * Requirement 4.1: DOMContentLoaded イベント後に起動
   */
  constructor() {
    if (typeof document === 'undefined') {
      return;
    }

    if (document.readyState === 'loading') {
      // ページ読み込み中の場合、DOMContentLoaded を待つ
      document.addEventListener('DOMContentLoaded', () => {
        this.init();
      });
    } else {
      // ページ読み込み完了済みの場合、即座に実行
      this.init();
    }
  }

  /**
   * 初期化処理を実行
   */
  private async init(): Promise<void> {
    if (this.isInitialized) {
      return;
    }
    this.isInitialized = true;

    try {
      await initHighlightController();
    } catch (_e) {
      // 予期しないエラーはサイレント中断
    }
  }
}

// 注意: 自動初期化は index.ts（Content Script エントリポイント）で行います。
// このファイルを直接インポートした場合は、呼び出し側が HighlightController を初期化してください。

export {
  injectHighlightStyles,
  highlightText,
  checkIfConfigured,
  getHighlights,
  highlightTextsInAnimationFrame,
  initHighlightController,
};
