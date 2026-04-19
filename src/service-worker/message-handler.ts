/**
 * Service Worker メッセージルーティングシステム
 * タスク 2.5: メッセージルーティングシステムを作成
 * タスク 3.3: オプションページと設定管理の統合
 *
 * Requirements: 1.1, 1.2, 1.4, 2.1, 3.1, 3.2, 3.3, 3.4, 3.5
 *
 * Content Script と Service Worker 間のメッセージを一元管理します。
 * - chrome.runtime.onMessage リスナーを登録し、型ベースのディスパッチを行う
 * - textSelectionUpdated: 現在の選択状態を内部で保持（ContextMenuHandler が参照）
 * - getSelection: 保持している選択状態をレスポンスで返す（ContextMenuHandler からのリクエスト）
 * - setCredentials: SettingsManager.setCredentials() に委譲（Options Page からのリクエスト）
 * - getCredentials: SettingsManager.getCredentials() に委譲（Options Page からのリクエスト）
 * - testConnection: SupabaseWriter.testConnection() に委譲（Options Page からのリクエスト）
 */

import type { ExtensionMessage, TextSelectionMessage, SupabaseCredentials, SaveTextOptions, SaveResult, HighlightsResponse, UpdateResult, DeleteResult } from '../types/types';
import { SettingsManager } from './settings-manager';
import { SupabaseWriter } from './supabase-writer';
import { SupabaseReader } from './supabase-reader';

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

/** SettingsManager の最小インターフェース（テスト用にインジェクション可能） */
interface ISettingsManager {
  getCredentials(): Promise<SupabaseCredentials | null>;
  setCredentials(creds: SupabaseCredentials): Promise<{ success: boolean; error?: string }>;
  isConfigured(): Promise<boolean>;
}

/** SupabaseWriter の最小インターフェース（テスト用にインジェクション可能） */
interface ISupabaseWriter {
  save(options: SaveTextOptions): Promise<SaveResult>;
  testConnection(): Promise<{ success: boolean; message: string }>;
  updateMemo(id: string, memo: string): Promise<UpdateResult>;
  deleteRecord(id: string): Promise<DeleteResult>;
}

/** SupabaseReader の最小インターフェース（テスト用にインジェクション可能） */
interface ISupabaseReader {
  fetchSavedTexts(options: { pageUrl: string }): Promise<HighlightsResponse>;
}

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
 * Requirement 3.1-3.5: Options Page からの設定管理メッセージを SettingsManager / SupabaseWriter に委譲する
 */
export class MessageHandler {
  /** 現在のテキスト選択状態 */
  private currentSelection: SelectionState = { ...INITIAL_SELECTION };

  /** 選択状態変化コールバック */
  private selectionChangeCallback: SelectionChangeCallback | null = null;

  /** 認証情報管理（Options Page からのリクエストを処理） */
  private settingsManager: ISettingsManager;

  /** Supabase 接続テスト用（Options Page からの testConnection リクエストを処理） */
  private supabaseWriter: ISupabaseWriter;

  /** Supabase 読み取り用（HighlightController からの getHighlights リクエストを処理） */
  private supabaseReader: ISupabaseReader;

  /**
   * @param settingsManager - SettingsManager インスタンス（省略時は自動生成）
   * @param supabaseWriter  - SupabaseWriter インスタンス（省略時は自動生成）
   * @param supabaseReader  - SupabaseReader インスタンス（省略時は自動生成）
   */
  constructor(
    settingsManager?: ISettingsManager,
    supabaseWriter?: ISupabaseWriter,
    supabaseReader?: ISupabaseReader
  ) {
    this.settingsManager = settingsManager ?? new SettingsManager();
    this.supabaseWriter = supabaseWriter ?? new SupabaseWriter();
    this.supabaseReader = supabaseReader ?? new SupabaseReader();
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

      case 'setCredentials':
        return this.handleSetCredentials(message.payload, sendResponse);

      case 'getCredentials':
        return this.handleGetCredentials(sendResponse);

      case 'testConnection':
        return this.handleTestConnection(sendResponse);

      case 'saveSelection':
        return this.handleSaveSelection(message.payload, sendResponse);

      case 'getHighlights':
        return this.handleGetHighlights(message.payload.pageUrl, sendResponse);

      case 'isConfigured':
        return this.handleIsConfigured(sendResponse);

      case 'updateMemo':
        return this.handleUpdateMemo(message.payload.id, message.payload.memo, sendResponse);

      case 'deleteHighlight':
        return this.handleDeleteHighlight(message.payload.id, sendResponse);

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
   * setCredentials メッセージの処理
   * Options Page から送信された認証情報を SettingsManager に委譲して保存する
   *
   * Requirement 3.1: URLとAPIキーの入力・保存
   * Requirement 3.3: セキュアなローカルストレージへの永続化
   * Requirement 3.4: 変更時に即座に反映
   *
   * @returns true — 非同期レスポンスチャネルを維持するため
   */
  private handleSetCredentials(
    payload: SupabaseCredentials,
    sendResponse: (response?: unknown) => void
  ): true {
    this.settingsManager.setCredentials(payload).then((result) => {
      sendResponse(result);
    });
    return true;
  }

  /**
   * getCredentials メッセージの処理
   * SettingsManager から認証情報を取得して Options Page へ返す
   *
   * Requirement 3.3: ブラウザを再起動しても設定が維持される
   *
   * @returns true — 非同期レスポンスチャネルを維持するため
   */
  private handleGetCredentials(sendResponse: (response?: unknown) => void): true {
    this.settingsManager.getCredentials().then((creds) => {
      sendResponse(creds);
    });
    return true;
  }

  /**
   * testConnection メッセージの処理
   * SupabaseWriter.testConnection() を実行して結果を Options Page へ返す
   *
   * Requirement 3.2: 保存時に Supabase への疎通確認を行い、結果をユーザーに表示
   *
   * @returns true — 非同期レスポンスチャネルを維持するため
   */
  private handleTestConnection(sendResponse: (response?: unknown) => void): true {
    this.supabaseWriter.testConnection().then((result) => {
      sendResponse(result);
    });
    return true;
  }

  /**
   * saveSelection メッセージの処理
   * Content Script / Popup から送信された選択テキストとオプションの memo を Supabase へ保存する
   *
   * Requirement 5.2: メモフィールドを含めて Supabase へ INSERT する
   * Requirement 5.3: memo が undefined の場合は NULL として INSERT する
   *
   * @returns true — 非同期レスポンスチャネルを維持するため
   */
  private handleSaveSelection(
    payload: SaveTextOptions,
    sendResponse: (response?: unknown) => void
  ): true {
    this.supabaseWriter.save(payload).then((result) => {
      sendResponse(result);
    });
    return true;
  }

  /**
   * getHighlights メッセージの処理
   * HighlightController から送信されたページ URL に対応する保存済みテキストを取得する
   *
   * Requirement 4.1: ページロード時、保存済みテキストを Supabase から取得
   * Requirement 4.5: Supabase 取得失敗時はページ表示を妨げず中断
   *
   * @returns true — 非同期レスポンスチャネルを維持するため
   */
  private handleGetHighlights(
    pageUrl: string,
    sendResponse: (response?: unknown) => void
  ): true {
    this.supabaseReader.fetchSavedTexts({ pageUrl }).then((result) => {
      sendResponse(result);
    });
    return true;
  }

  /**
   * isConfigured メッセージの処理
   * HighlightController が認証情報の設定状態を確認するために使用する
   *
   * Requirement 4.6: 認証情報未設定時はハイライト取得処理を実行しない
   *
   * @returns true — 非同期レスポンスチャネルを維持するため
   */
  private handleIsConfigured(sendResponse: (response?: unknown) => void): true {
    this.settingsManager.isConfigured().then((configured: boolean) => {
      sendResponse({ configured });
    });
    return true;
  }

  /**
   * updateMemo メッセージの処理
   * HighlightActionPopup から送信されたメモ更新リクエストを SupabaseWriter に委譲する
   *
   * Requirement 6.3: メモ編集を Supabase へ反映する
   *
   * @returns true — 非同期レスポンスチャネルを維持するため
   */
  private handleUpdateMemo(
    id: string,
    memo: string,
    sendResponse: (response?: unknown) => void
  ): true {
    this.supabaseWriter.updateMemo(id, memo).then((result) => {
      sendResponse(result);
    });
    return true;
  }

  /**
   * deleteHighlight メッセージの処理
   * HighlightActionPopup から送信された削除リクエストを SupabaseWriter に委譲する
   *
   * Requirement 6.4: ハイライトを Supabase から削除する
   *
   * @returns true — 非同期レスポンスチャネルを維持するため
   */
  private handleDeleteHighlight(
    id: string,
    sendResponse: (response?: unknown) => void
  ): true {
    this.supabaseWriter.deleteRecord(id).then((result) => {
      sendResponse(result);
    });
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
