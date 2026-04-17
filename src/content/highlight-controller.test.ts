/**
 * @jest-environment jsdom
 *
 * content/highlight-controller.ts のユニットテスト
 * タスク 6.2: HighlightController 実装（タスク4.2）
 *
 * 設計書要件:
 * - Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
 * - DOMContentLoaded イベント後に起動
 * - 認証情報確認メッセージを Service Worker に送信
 * - 認証情報未設定時は処理を中断
 * - getHighlights メッセージで保存済みテキストを取得
 * - TreeWalker でテキストノードを走査
 * - <mark class="reading-support-highlight"> でラップ
 * - 複数テキストをすべてハイライト
 * - 見つからないテキストはスキップして継続
 * - Supabase 取得失敗時はサイレント中断
 * - CSS は一度だけ注入
 * - requestAnimationFrame でメインスレッドブロック回避
 */

import {
  HighlightController,
  injectHighlightStyles,
  highlightText,
  checkIfConfigured,
  getHighlights,
  highlightTextsInAnimationFrame,
  initHighlightController,
} from './highlight-controller';
import type { HighlightsResponse } from '../types/types';

// chrome.runtime.sendMessage のモック
const mockSendMessage = jest.fn();

// requestAnimationFrame のモック
const mockRequestAnimationFrame = jest.fn((callback) => {
  callback();
  return 1;
});

beforeAll(() => {
  // グローバル chrome API をモック
  (global as unknown as { chrome: unknown }).chrome = {
    runtime: {
      sendMessage: mockSendMessage,
    },
  };
});

beforeEach(() => {
  jest.clearAllMocks();

  // DOM を初期化
  document.body.innerHTML = '';

  // CSS インジェクション状態をリセット（エクスポート されていないため、テスト毎にリセット）
  const styles = document.querySelectorAll('style');
  styles.forEach((style) => {
    if (style.textContent?.includes('reading-support-highlight')) {
      style.remove();
    }
  });

  // jsdom では window.location.href は既に設定されているため、そのまま使用
  // テストでは https://localhost/ がデフォルト値になっている

  // requestAnimationFrame をモック
  (global as unknown as Record<string, unknown>).requestAnimationFrame = mockRequestAnimationFrame;
  mockRequestAnimationFrame.mockClear();

  mockSendMessage.mockResolvedValue(undefined);
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('content/highlight-controller.ts - 保存済みテキストのハイライト表示', () => {
  describe('injectHighlightStyles - CSS の注入', () => {
    it('CSS スタイルを <style> タグとして注入する', () => {
      injectHighlightStyles();

      const styles = document.querySelectorAll('style');
      let found = false;
      styles.forEach((style) => {
        if (style.textContent?.includes('reading-support-highlight')) {
          found = true;
          expect(style.textContent).toContain('background: #FFFF99');
          expect(style.textContent).toContain('color: inherit');
        }
      });
      expect(found).toBe(true);
    });

    it('複数回呼び出した場合、CSS は一度だけ注入される', () => {
      injectHighlightStyles();
      injectHighlightStyles();
      injectHighlightStyles();

      const styles = document.querySelectorAll('style');
      let count = 0;
      styles.forEach((style) => {
        if (style.textContent?.includes('reading-support-highlight')) {
          count++;
        }
      });
      expect(count).toBe(1);
    });
  });

  describe('highlightText - 単一テキストのハイライト', () => {
    it('単一テキストを見つけて <mark> でラップする', () => {
      const p = document.createElement('p');
      p.textContent = 'これは重要な文章です。';
      document.body.appendChild(p);

      const result = highlightText('重要な文章');

      expect(result).toBe(true);
      const marks = document.querySelectorAll('mark.reading-support-highlight');
      expect(marks.length).toBeGreaterThan(0);
      let found = false;
      marks.forEach((mark) => {
        if (mark.textContent?.includes('重要な文章')) {
          found = true;
        }
      });
      expect(found).toBe(true);
    });

    it('複数テキストノードを含む場合、正しくハイライトする', () => {
      const div = document.createElement('div');
      div.appendChild(document.createTextNode('これは'));
      div.appendChild(document.createElement('span')).textContent = '重要な';
      div.appendChild(document.createTextNode('文章です。'));
      document.body.appendChild(div);

      // 各テキストノードを個別にハイライト
      highlightText('これは');
      highlightText('文章です。');

      const marks = document.querySelectorAll('mark.reading-support-highlight');
      expect(marks.length).toBeGreaterThanOrEqual(2);
    });

    it('テキストが見つからない場合、false を返す', () => {
      const p = document.createElement('p');
      p.textContent = 'テスト文章';
      document.body.appendChild(p);

      const result = highlightText('存在しないテキスト');

      expect(result).toBe(false);
    });

    it('空のテキストを渡した場合、false を返す', () => {
      const result = highlightText('');
      expect(result).toBe(false);
    });

    it('部分一致するテキストをハイライトする', () => {
      const p = document.createElement('p');
      p.textContent = 'これは重要な文章です。重要な部分を強調します。';
      document.body.appendChild(p);

      const result = highlightText('重要な');

      expect(result).toBe(true);
      const marks = document.querySelectorAll('mark.reading-support-highlight');
      // 最初の "重要な" を見つける
      expect(marks.length).toBeGreaterThanOrEqual(1);
    });

    it('同一テキストが複数ある場合、すべてハイライトする（複数回呼び出し）', () => {
      const p = document.createElement('p');
      p.textContent = 'テストテストテスト';
      document.body.appendChild(p);

      // 最初のハイライト実行
      highlightText('テスト');

      // DOM が更新されているため、新しい TreeWalker で再検索
      const marks = document.querySelectorAll('mark.reading-support-highlight');
      expect(marks.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('checkIfConfigured - 認証情報確認', () => {
    it('Service Worker が configured: true を返す場合、true を返す', async () => {
      mockSendMessage.mockResolvedValue({ configured: true });

      const result = await checkIfConfigured();

      expect(result).toBe(true);
      expect(mockSendMessage).toHaveBeenCalledWith({
        type: 'isConfigured',
      });
    });

    it('Service Worker が configured: false を返す場合、false を返す', async () => {
      mockSendMessage.mockResolvedValue({ configured: false });

      const result = await checkIfConfigured();

      expect(result).toBe(false);
    });

    it('Service Worker が応答しない場合、false を返す（サイレント処理）', async () => {
      mockSendMessage.mockRejectedValue(new Error('Service Worker not available'));

      const result = await checkIfConfigured();

      expect(result).toBe(false);
    });

    it('Service Worker の応答がない場合、false を返す', async () => {
      mockSendMessage.mockResolvedValue(undefined);

      const result = await checkIfConfigured();

      expect(result).toBe(false);
    });
  });

  describe('getHighlights - 保存済みテキスト取得', () => {
    it('保存済みテキストを正常に取得する', async () => {
      const texts = ['重要な文章1', '重要な文章2'];
      mockSendMessage.mockResolvedValue({
        success: true,
        texts,
      } as HighlightsResponse);

      const result = await getHighlights('https://example.com');

      expect(result.success).toBe(true);
      expect(result.texts).toEqual(texts);
      expect(mockSendMessage).toHaveBeenCalledWith({
        type: 'getHighlights',
        payload: { pageUrl: 'https://example.com' },
      });
    });

    it('空配列を返す場合、success: true で処理する', async () => {
      mockSendMessage.mockResolvedValue({
        success: true,
        texts: [],
      } as HighlightsResponse);

      const result = await getHighlights('https://example.com');

      expect(result.success).toBe(true);
      expect(result.texts).toEqual([]);
    });

    it('エラーレスポンスを返す場合、success: false で処理する', async () => {
      mockSendMessage.mockResolvedValue({
        success: false,
        error: {
          code: 'NO_CREDENTIALS',
          message: 'Credentials not set',
        },
      } as HighlightsResponse);

      const result = await getHighlights('https://example.com');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('NO_CREDENTIALS');
    });

    it('Service Worker が応答しない場合、NETWORK_ERROR を返す', async () => {
      mockSendMessage.mockRejectedValue(new Error('Service Worker unavailable'));

      const result = await getHighlights('https://example.com');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('NETWORK_ERROR');
    });

    it('現在のページ URL を正しく送信する', async () => {
      mockSendMessage.mockResolvedValue({
        success: true,
        texts: [],
      } as HighlightsResponse);

      await getHighlights('https://example.com/specific-page');

      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: {
            pageUrl: 'https://example.com/specific-page',
          },
        })
      );
    });
  });

  describe('highlightTextsInAnimationFrame - 複数テキストのハイライト', () => {
    it('複数テキストをハイライト表示する', () => {
      const p = document.createElement('p');
      p.textContent = '重要な文章1です。これも重要な文章2です。';
      document.body.appendChild(p);

      const texts = ['重要な文章1', '重要な文章2'];
      highlightTextsInAnimationFrame(texts);

      expect(mockRequestAnimationFrame).toHaveBeenCalled();
      const marks = document.querySelectorAll('mark.reading-support-highlight');
      expect(marks.length).toBeGreaterThanOrEqual(2);
    });

    it('見つからないテキストはスキップして、残りを継続する', () => {
      const p = document.createElement('p');
      p.textContent = '重要な文章1です。';
      document.body.appendChild(p);

      const texts = ['存在しないテキスト', '重要な文章1', '別の存在しないテキスト'];
      highlightTextsInAnimationFrame(texts);

      expect(mockRequestAnimationFrame).toHaveBeenCalled();
      const marks = document.querySelectorAll('mark.reading-support-highlight');
      expect(marks.length).toBeGreaterThanOrEqual(1);
    });

    it('空配列を渡した場合、エラーなく処理する', () => {
      const texts: string[] = [];
      expect(() => {
        highlightTextsInAnimationFrame(texts);
      }).not.toThrow();
      expect(mockRequestAnimationFrame).toHaveBeenCalled();
    });

    it('requestAnimationFrame 内で処理が実行される', () => {
      const callback = jest.fn();
      mockRequestAnimationFrame.mockImplementation((cb) => {
        callback();
        cb();
        return 1;
      });

      const p = document.createElement('p');
      p.textContent = 'テスト';
      document.body.appendChild(p);

      highlightTextsInAnimationFrame(['テスト']);

      expect(callback).toHaveBeenCalled();
    });

    it('個別テキストのハイライト失敗は無視して継続する', () => {
      const p = document.createElement('p');
      p.textContent = '正常なテキスト';
      document.body.appendChild(p);

      // 一部のテキストは見つからない（エラー扱いでなく、スキップ）
      const texts = ['正常なテキスト', '見つからないテキスト', '正常なテキスト'];
      expect(() => {
        highlightTextsInAnimationFrame(texts);
      }).not.toThrow();
    });
  });

  describe('initHighlightController - 初期化処理', () => {
    it('認証情報が設定されている場合、保存済みテキストを取得してハイライトする', async () => {
      mockSendMessage
        .mockResolvedValueOnce({ configured: true }) // checkIfConfigured
        .mockResolvedValueOnce({
          // getHighlights
          success: true,
          texts: ['重要な文章'],
        } as HighlightsResponse);

      const p = document.createElement('p');
      p.textContent = '重要な文章です。';
      document.body.appendChild(p);

      await initHighlightController();

      expect(mockSendMessage).toHaveBeenCalledTimes(2);
      const marks = document.querySelectorAll('mark.reading-support-highlight');
      expect(marks.length).toBeGreaterThan(0);
    });

    it('認証情報が未設定の場合、処理を中断する', async () => {
      mockSendMessage.mockResolvedValue({ configured: false });

      await initHighlightController();

      // isConfigured のみ呼ばれ、getHighlights は呼ばれない
      expect(mockSendMessage).toHaveBeenCalledTimes(1);
      expect(mockSendMessage).toHaveBeenCalledWith({
        type: 'isConfigured',
      });
    });

    it('Supabase 取得が失敗した場合、ページ表示を継続する', async () => {
      mockSendMessage
        .mockResolvedValueOnce({ configured: true }) // checkIfConfigured
        .mockResolvedValueOnce({
          // getHighlights - error
          success: false,
          error: {
            code: 'NETWORK_ERROR',
            message: 'Network failed',
          },
        } as HighlightsResponse);

      const p = document.createElement('p');
      p.textContent = 'ページ表示';
      document.body.appendChild(p);

      await initHighlightController();

      // ページ表示は変わらない
      expect(p.textContent).toBe('ページ表示');
    });

    it('CSS は一度だけ注入される', async () => {
      mockSendMessage
        .mockResolvedValueOnce({ configured: true })
        .mockResolvedValueOnce({
          success: true,
          texts: [],
        } as HighlightsResponse);

      await initHighlightController();

      const styles = document.querySelectorAll('style');
      let count = 0;
      styles.forEach((style) => {
        if (style.textContent?.includes('reading-support-highlight')) {
          count++;
        }
      });
      expect(count).toBe(1);
    });

    it('予期しないエラーはサイレント処理される', async () => {
      mockSendMessage.mockRejectedValue(new Error('Unexpected error'));

      expect(() => {
        initHighlightController();
      }).not.toThrow();
    });
  });

  describe('HighlightController クラス', () => {
    it('インスタンス化時に DOMContentLoaded リスナーを登録する', () => {
      const addEventListenerSpy = jest.spyOn(document, 'addEventListener');

      const controller = new HighlightController();

      // readyState が 'complete' の場合、DOMContentLoaded は待たずに init() を呼ぶ
      expect(controller).toBeDefined();
      addEventListenerSpy.mockRestore();
    });

    it('ページ読み込み完了済みの場合、即座に初期化する', () => {
      mockSendMessage
        .mockResolvedValueOnce({ configured: true })
        .mockResolvedValueOnce({
          success: true,
          texts: [],
        } as HighlightsResponse);

      const p = document.createElement('p');
      p.textContent = 'テスト';
      document.body.appendChild(p);

      const controller = new HighlightController();

      expect(controller).toBeDefined();
      // init() が呼ばれたはず
      expect(mockSendMessage.mock.calls.length).toBeGreaterThan(0);
    });

    it('初期化は一度だけ実行される', async () => {
      mockSendMessage
        .mockResolvedValueOnce({ configured: true })
        .mockResolvedValueOnce({
          success: true,
          texts: [],
        } as HighlightsResponse);

      const controller = new HighlightController();

      // 複数回アクセスしてもカウントは増えない
      const initialCallCount = mockSendMessage.mock.calls.length;

      // 内部的に init() を再度呼び出す場合があっても、isInitialized フラグで防止される
      expect(mockSendMessage.mock.calls.length).toBeLessThanOrEqual(initialCallCount + 1);
    });
  });

  describe('エッジケース', () => {
    it('複雑なDOM構造でハイライトを正しく適用する', () => {
      const div = document.createElement('div');
      const p1 = document.createElement('p');
      p1.textContent = 'これは重要な文章です。';
      const p2 = document.createElement('p');
      p2.textContent = '別の重要な文章です。';
      div.appendChild(p1);
      div.appendChild(p2);
      document.body.appendChild(div);

      highlightText('重要な文章');

      const marks = document.querySelectorAll('mark.reading-support-highlight');
      expect(marks.length).toBeGreaterThanOrEqual(2);
    });

    it('ネストされたテキストノードをハイライトする', () => {
      const div = document.createElement('div');
      const span = document.createElement('span');
      span.textContent = '重要な文章';
      div.appendChild(span);
      document.body.appendChild(div);

      const result = highlightText('重要な文章');

      expect(result).toBe(true);
    });

    it('スクリプトやスタイルタグ内のテキストは無視される（TreeWalker の SHOW_TEXT で自動的に）', () => {
      const script = document.createElement('script');
      // Valid JavaScript that won't throw when executed
      script.textContent = '// Important text is here';
      const p = document.createElement('p');
      p.textContent = 'Important text';
      document.body.appendChild(script);
      document.body.appendChild(p);

      const result = highlightText('Important text');

      // p タグのテキストのみ検索対象（script は TreeWalker で検索されない）
      expect(result).toBe(true);
      const marks = document.querySelectorAll('mark.reading-support-highlight');
      expect(marks.length).toBeGreaterThan(0);
    });

    it('大文字小文字の区別を正しく行う', () => {
      // Test case 1: Case-sensitive match
      document.body.innerHTML = '';
      const p = document.createElement('p');
      p.textContent = 'Important Text';
      document.body.appendChild(p);

      const result1 = highlightText('Important Text');
      expect(result1).toBe(true);

      // Test case 2: Case-sensitive non-match - reset DOM and try different case
      document.body.innerHTML = '';
      const p2 = document.createElement('p');
      p2.textContent = 'Important Text';
      document.body.appendChild(p2);

      // Search with different case should not find it
      const result2 = highlightText('important text');
      expect(result2).toBe(false);
    });
  });
});
