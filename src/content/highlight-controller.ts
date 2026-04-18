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

import type { SavedHighlight } from '../types/types';

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
 * ツールチップ要素を取得または作成する（DOM に1つだけ保持する）
 * Requirement 5.4: ツールチップ表示
 */
function getOrCreateTooltip(): HTMLDivElement {
  let tooltip = document.querySelector('.reading-support-tooltip') as HTMLDivElement | null;
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.className = 'reading-support-tooltip';
    tooltip.style.cssText =
      'position: fixed; background: rgba(0,0,0,0.8); color: white; padding: 4px 8px; ' +
      'border-radius: 4px; font-size: 12px; pointer-events: none; z-index: 2147483646; display: none;';
    document.body.appendChild(tooltip);
  }
  return tooltip;
}

/**
 * ドキュメントレベルのイベント委譲でツールチップの表示/非表示を制御する
 * Requirement 5.4: mouseover/mouseout でツールチップを表示/非表示
 * Requirement 5.5: data-memo がない場合はツールチップを表示しない
 */
function setupTooltipEvents(): void {
  const tooltip = getOrCreateTooltip();

  // 既存リスナーの重複登録を避けるため、data 属性で管理
  if (document.body.dataset.tooltipEventsSetup === 'true') {
    return;
  }
  document.body.dataset.tooltipEventsSetup = 'true';

  document.addEventListener('mouseover', (event: MouseEvent) => {
    const target = event.target as HTMLElement;
    if (
      target.tagName === 'MARK' &&
      target.classList.contains('reading-support-highlight')
    ) {
      const memo = target.getAttribute('data-memo');
      if (memo && memo.length > 0) {
        tooltip.textContent = memo;
        tooltip.style.display = 'block';
      }
    }
  });

  document.addEventListener('mouseout', (event: MouseEvent) => {
    const target = event.target as HTMLElement;
    if (
      target.tagName === 'MARK' &&
      target.classList.contains('reading-support-highlight')
    ) {
      tooltip.style.display = 'none';
    }
  });
}

/**
 * DOM TreeWalker を使用してテキストを検索し、見つかった場合は <mark> でラップする
 * Requirement 4.2, 4.3: TreeWalker でテキストノードを走査し、<mark> でラップ
 * Requirement 4.4: 見つからないテキストはスキップして継続
 * Requirement 5.4: memo が存在する場合は data-memo 属性を設定する
 *
 * @param text - ハイライト対象のテキスト
 * @param memo - オプションのメモ（設定された場合 data-memo 属性として保存）
 * @returns ハイライトが適用されたかどうか
 */
function highlightText(text: string, memo?: string): boolean {
  if (!text || !document.body) return false;

  // テキストノードを収集（script/style/ハイライト済みを除外）
  const textNodes: Text[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (node: Node): number => {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      const tag = parent.tagName;
      if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(tag)) return NodeFilter.FILTER_REJECT;
      if (parent.classList?.contains('reading-support-highlight')) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let node: Node | null;
  while ((node = walker.nextNode())) {
    textNodes.push(node as Text);
  }

  // 全ノードのテキストを結合して連続文字列を作成し、各ノードの開始位置を記録
  let combined = '';
  const nodeMap: Array<{ node: Text; start: number }> = [];
  for (const n of textNodes) {
    nodeMap.push({ node: n, start: combined.length });
    combined += n.textContent || '';
  }

  console.log('[ReadingSupport] 結合テキスト内でのマッチ確認:', combined.includes(text));

  let highlighted = false;
  let searchFrom = 0;
  let matchStart: number;

  while ((matchStart = combined.indexOf(text, searchFrom)) !== -1) {
    const matchEnd = matchStart + text.length;

    // マッチ範囲の開始・終了ノードとオフセットを特定
    let startNode: Text | null = null;
    let startOffset = 0;
    let endNode: Text | null = null;
    let endOffset = 0;

    for (let i = 0; i < nodeMap.length; i++) {
      const { node: n, start } = nodeMap[i];
      const nodeLen = n.textContent?.length || 0;
      const end = start + nodeLen;

      if (startNode === null && matchStart >= start && matchStart < end) {
        startNode = n;
        startOffset = matchStart - start;
      }
      if (startNode !== null && endNode === null && matchEnd <= end) {
        endNode = n;
        endOffset = matchEnd - start;
        break;
      }
    }

    if (startNode && endNode) {
      try {
        const range = document.createRange();
        range.setStart(startNode, startOffset);
        range.setEnd(endNode, endOffset);

        const mark = document.createElement('mark');
        mark.className = 'reading-support-highlight';

        // memo が空でない場合のみ data-memo 属性を設定（要件 5.4, 5.5）
        if (memo && memo.length > 0) {
          mark.setAttribute('data-memo', memo);
        }

        // 複数ノードをまたがる場合は surroundContents が失敗するため extractContents を使用
        try {
          range.surroundContents(mark);
        } catch {
          const fragment = range.extractContents();
          mark.appendChild(fragment);
          range.insertNode(mark);
        }

        highlighted = true;
      } catch (_e) {
        // DOM 操作失敗はスキップして次のテキストへ
      }
    }

    searchFrom = matchEnd;
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
 * Requirement 5.4: SavedHighlight[] を受け取り memo を処理する
 * Requirement 3.6（実装ノート）: メインスレッドをブロックしないようにする
 *
 * @param highlights - ハイライト対象の SavedHighlight 配列
 */
function highlightTextsInAnimationFrame(highlights: SavedHighlight[]): void {
  requestAnimationFrame(() => {
    for (const highlight of highlights) {
      try {
        highlightText(highlight.text, highlight.memo);
      } catch (_e) {
        // 個別テキストのハイライト失敗は無視して続行
      }
    }
    setupTooltipEvents();
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
    console.log('[ReadingSupport] 認証情報が未設定のため、ハイライト処理をスキップします');
    return;
  }

  // ハイライト CSS を注入
  injectHighlightStyles();

  // 保存済みテキストを取得
  const currentUrl = window.location.href;
  console.log('[ReadingSupport] ハイライト取得中:', currentUrl);
  const response = await getHighlights(currentUrl);

  if (!response.success) {
    console.log('[ReadingSupport] ハイライト取得失敗:', response.error);
    return;
  }

  // 取得した各ハイライト（テキストとメモ）を使ってハイライト表示
  // Requirement 5.4: SavedHighlight[] を直接 highlightTextsInAnimationFrame に渡す
  const highlights = response.highlights || [];
  console.log('[ReadingSupport] 取得したハイライト数:', highlights.length, highlights);
  if (highlights.length > 0) {
    console.log('[ReadingSupport] ハイライト対象:', JSON.stringify(highlights));
    highlightTextsInAnimationFrame(highlights);
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
