/**
 * Service Worker メッセージルーティングシステム
 * タスク 2.5: メッセージルーティングシステムを作成
 *
 * Requirements: 1.1, 1.2, 1.4, 2.1
 *
 * Content Script と Service Worker 間のメッセージを一元管理します。
 * - chrome.runtime.onMessage リスナーを登録し、型ベースのディスパッチを行う
 * - textSelectionUpdated: 現在の選択状態を内部で保持（ContextMenuHandler が参照）
 * - getSelection: 保持している選択状態をレスポンスで返す（ContextMenuHandler からのリクエスト）
 */

import type { ExtensionMessage, TextSelectionMessage } from '../types/types';

// テスト環境でも参照できるようにグローバルchrome APIを型宣言
declare const chrome: {
  runtime: {
    onMessage: {
      addListener(
        listener: (
          message: ExtensionMessage,
          sender: Record<string, unknown>,
          sendResponse: (response?: unknown) => void
        ) => boolean | void
      ): void;
    };
  };
};

/** 選択状態の型エイリアス */
type SelectionState = TextSelectionMessage['payload'];

/** 選択状態変化コールバックの型 */
type SelectionChangeCallback = (hasSelection: boolean) => void;

/** 初期選択状態 */
const INITIAL_SELECTION: SelectionState = {
  selectedText: '',
  pageUrl: '',
  hasSelection: false,
};

/**
 * Content Script ↔ Service Worker 間のメッセージルーティングを管理するクラス
 *
 * Requirement 1.1: テキスト選択後、コンテキストメニューに保存オプションを表示するため
 *   Content Script からの選択状態通知を受け取り保持する
 * Requirement 1.2: 保存操作実行時、ContextMenuHandler が現在の選択状態を参照できるよう提供する
 * Requirement 1.4: テキスト未選択状態も正しく保持し、ContextMenuHandler が判定できるようにする
 * Requirement 2.1: 選択テキスト・URLを損失なく保持・提供する
 */
export class MessageHandler {
  /** 現在のテキスト選択状態 */
  private currentSelection: SelectionState = { ...INITIAL_SELECTION };

  /** 選択状態変化コールバック */
  private selectionChangeCallback: SelectionChangeCallback | null = null;

  constructor() {
    chrome.runtime.onMessage.addListener(this.handleMessage.bind(this));
  }

  /**
   * chrome.runtime.onMessage のリスナー
   * メッセージタイプに応じてハンドラーへディスパッチする
   */
  private handleMessage(
    message: ExtensionMessage,
    _sender: Record<string, unknown>,
    sendResponse: (response?: unknown) => void
  ): boolean | void {
    switch (message.type) {
      case 'textSelectionUpdated':
        return this.handleTextSelectionUpdated(message);

      case 'getSelection':
        return this.handleGetSelection(sendResponse);

      default:
        // 未知のメッセージタイプは無視（他ハンドラーへ委譲）
        return false;
    }
  }

  /**
   * 選択状態変化コールバックを登録する
   * background.ts がContextMenuHandler.updateMenuState() に接続するために使用する
   *
   * Requirement 1.1: 選択テキストがあるときにコンテキストメニューを有効化
   * Requirement 1.4: 未選択時にコンテキストメニューを無効化
   */
  onSelectionChange(callback: SelectionChangeCallback): void {
    this.selectionChangeCallback = callback;
  }

  /**
   * textSelectionUpdated メッセージの処理
   * Content Script からの選択状態通知を受け取り内部状態を更新する
   *
   * Requirement 1.1: テキスト選択通知の受信
   * Requirement 1.4: 未選択状態も正しく保持
   */
  private handleTextSelectionUpdated(message: TextSelectionMessage): false {
    this.currentSelection = { ...message.payload };
    this.selectionChangeCallback?.(message.payload.hasSelection);
    return false;
  }

  /**
   * getSelection メッセージの処理
   * 保持している選択状態をレスポンスで返す
   *
   * Requirement 1.2: ContextMenuHandler がクリック時に選択状態を取得するため
   * Requirement 2.1: selectedText・pageUrl を損失なく提供
   *
   * @returns true — 非同期レスポンスチャネルを維持するため
   */
  private handleGetSelection(sendResponse: (response?: unknown) => void): true {
    sendResponse({ ...this.currentSelection });
    return true;
  }

  /**
   * 現在の選択状態を返す（ContextMenuHandler からの直接参照用）
   *
   * Requirement 1.4: 選択状態を ContextMenuHandler が判定できるよう提供
   */
  getCurrentSelection(): SelectionState {
    return { ...this.currentSelection };
  }
}
