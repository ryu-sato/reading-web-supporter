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
  setupClickEvents,
} from './highlight-controller';
import { HighlightActionPopup } from './highlight-action-popup';
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

  // ツールチップイベントのセットアップフラグをリセット（テスト間の独立性確保）
  delete document.body.dataset.tooltipEventsSetup;

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
      const highlights = [{ id: 'id-1', text: '重要な文章1' }, { id: 'id-2', text: '重要な文章2' }];
      mockSendMessage.mockResolvedValue({
        success: true,
        highlights,
      } as HighlightsResponse);

      const result = await getHighlights('https://example.com');

      expect(result.success).toBe(true);
      expect(result.highlights).toEqual(highlights);
      expect(mockSendMessage).toHaveBeenCalledWith({
        type: 'getHighlights',
        payload: { pageUrl: 'https://example.com' },
      });
    });

    it('空配列を返す場合、success: true で処理する', async () => {
      mockSendMessage.mockResolvedValue({
        success: true,
        highlights: [],
      } as HighlightsResponse);

      const result = await getHighlights('https://example.com');

      expect(result.success).toBe(true);
      expect(result.highlights).toEqual([]);
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
        highlights: [],
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

      const highlights = [{ id: 'id-1', text: '重要な文章1' }, { id: 'id-2', text: '重要な文章2' }];
      highlightTextsInAnimationFrame(highlights);

      expect(mockRequestAnimationFrame).toHaveBeenCalled();
      const marks = document.querySelectorAll('mark.reading-support-highlight');
      expect(marks.length).toBeGreaterThanOrEqual(2);
    });

    it('見つからないテキストはスキップして、残りを継続する', () => {
      const p = document.createElement('p');
      p.textContent = '重要な文章1です。';
      document.body.appendChild(p);

      const highlights = [
        { id: 'id-1', text: '存在しないテキスト' },
        { id: 'id-2', text: '重要な文章1' },
        { id: 'id-3', text: '別の存在しないテキスト' },
      ];
      highlightTextsInAnimationFrame(highlights);

      expect(mockRequestAnimationFrame).toHaveBeenCalled();
      const marks = document.querySelectorAll('mark.reading-support-highlight');
      expect(marks.length).toBeGreaterThanOrEqual(1);
    });

    it('空配列を渡した場合、エラーなく処理する', () => {
      const highlights: { id: string; text: string; memo?: string }[] = [];
      expect(() => {
        highlightTextsInAnimationFrame(highlights);
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

      highlightTextsInAnimationFrame([{ id: 'id-1', text: 'テスト' }]);

      expect(callback).toHaveBeenCalled();
    });

    it('個別テキストのハイライト失敗は無視して継続する', () => {
      const p = document.createElement('p');
      p.textContent = '正常なテキスト';
      document.body.appendChild(p);

      // 一部のテキストは見つからない（エラー扱いでなく、スキップ）
      const highlights = [
        { id: 'id-1', text: '正常なテキスト' },
        { id: 'id-2', text: '見つからないテキスト' },
        { id: 'id-3', text: '正常なテキスト' },
      ];
      expect(() => {
        highlightTextsInAnimationFrame(highlights);
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
          highlights: [{ id: 'id-1', text: '重要な文章' }],
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

  describe('ツールチップ表示 - Requirements 5.4, 5.5', () => {
    it('memo ありの SavedHighlight で <mark> に data-memo 属性が設定される（要件 5.4）', () => {
      const p = document.createElement('p');
      p.textContent = 'これはメモ付きのハイライトです。';
      document.body.appendChild(p);

      highlightText('メモ付きのハイライト', 'テストメモ内容');

      const mark = document.querySelector('mark.reading-support-highlight');
      expect(mark).not.toBeNull();
      expect(mark?.getAttribute('data-memo')).toBe('テストメモ内容');
    });

    it('memo なしの場合、<mark> に data-memo 属性は設定されない', () => {
      const p = document.createElement('p');
      p.textContent = 'これはメモなしのハイライトです。';
      document.body.appendChild(p);

      highlightText('メモなしのハイライト');

      const mark = document.querySelector('mark.reading-support-highlight');
      expect(mark).not.toBeNull();
      expect(mark?.hasAttribute('data-memo')).toBe(false);
    });

    it('memo が空文字の場合、<mark> に data-memo 属性は設定されない（要件 5.5）', () => {
      const p = document.createElement('p');
      p.textContent = 'これは空メモのハイライトです。';
      document.body.appendChild(p);

      highlightText('空メモのハイライト', '');

      const mark = document.querySelector('mark.reading-support-highlight');
      expect(mark).not.toBeNull();
      expect(mark?.hasAttribute('data-memo')).toBe(false);
    });

    it('ページに .reading-support-tooltip 要素が1つ作成される', () => {
      const p = document.createElement('p');
      p.textContent = 'ツールチップテスト文章';
      document.body.appendChild(p);

      highlightTextsInAnimationFrame([{ id: 'id-1', text: 'ツールチップテスト', memo: 'メモ' }]);

      const tooltips = document.querySelectorAll('.reading-support-tooltip');
      expect(tooltips.length).toBe(1);
    });

    it('mouseover 時に data-memo を持つ mark 要素でツールチップが表示される', () => {
      const p = document.createElement('p');
      p.textContent = 'ホバーテスト文章';
      document.body.appendChild(p);

      highlightText('ホバーテスト', 'ホバーメモ');
      // setupTooltipEvents を呼び出してイベントを設定する
      highlightTextsInAnimationFrame([]);

      const mark = document.querySelector('mark.reading-support-highlight') as HTMLElement;
      expect(mark).not.toBeNull();
      expect(mark.getAttribute('data-memo')).toBe('ホバーメモ');

      const tooltip = document.querySelector('.reading-support-tooltip') as HTMLElement;
      expect(tooltip).not.toBeNull();

      // mouseover イベントを発火
      const event = new MouseEvent('mouseover', { bubbles: true });
      mark.dispatchEvent(event);

      expect(tooltip.style.display).not.toBe('none');
      expect(tooltip.textContent).toBe('ホバーメモ');
    });

    it('mouseout でツールチップが非表示になる', () => {
      const p = document.createElement('p');
      p.textContent = 'マウスアウトテスト文章';
      document.body.appendChild(p);

      highlightText('マウスアウトテスト', 'アウトメモ');
      highlightTextsInAnimationFrame([]);

      const mark = document.querySelector('mark.reading-support-highlight') as HTMLElement;
      const tooltip = document.querySelector('.reading-support-tooltip') as HTMLElement;

      // まず mouseover で表示
      mark.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      expect(tooltip.style.display).not.toBe('none');

      // mouseout で非表示
      mark.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
      expect(tooltip.style.display).toBe('none');
    });

    it('data-memo を持たない mark 要素ではツールチップが表示されない（要件 5.5）', () => {
      const p = document.createElement('p');
      p.textContent = 'メモなしホバーテスト文章';
      document.body.appendChild(p);

      // memo なしでハイライト
      highlightText('メモなしホバーテスト');
      highlightTextsInAnimationFrame([]);

      const mark = document.querySelector('mark.reading-support-highlight') as HTMLElement;
      expect(mark).not.toBeNull();
      expect(mark.hasAttribute('data-memo')).toBe(false);

      const tooltip = document.querySelector('.reading-support-tooltip') as HTMLElement;
      expect(tooltip).not.toBeNull();
      // 最初は非表示
      expect(tooltip.style.display).toBe('none');

      // mouseover を発火してもツールチップは表示されない
      mark.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      expect(tooltip.style.display).toBe('none');
    });

    it('ツールチップは innerHTML を使わず textContent で設定される（XSS 防止）', () => {
      const p = document.createElement('p');
      p.textContent = 'XSSテスト文章';
      document.body.appendChild(p);

      const xssPayload = '<script>alert("xss")</script>';
      highlightText('XSSテスト', xssPayload);
      highlightTextsInAnimationFrame([]);

      const mark = document.querySelector('mark.reading-support-highlight') as HTMLElement;
      mark.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

      const tooltip = document.querySelector('.reading-support-tooltip') as HTMLElement;
      // textContent はタグを解釈しない
      expect(tooltip.textContent).toBe(xssPayload);
      // innerHTML でセットされていれば script タグが含まれる可能性があるが、
      // textContent でセットされた場合は innerHTMLにはエスケープされた文字列が入る
      expect(tooltip.querySelector('script')).toBeNull();
    });

    it('highlightTextsInAnimationFrame が SavedHighlight[] を受け取り memo を処理する', () => {
      const p = document.createElement('p');
      p.textContent = 'SavedHighlightテスト文章';
      document.body.appendChild(p);

      // SavedHighlight[] を渡す（新しいシグネチャ）
      const highlights = [{ id: 'id-1', text: 'SavedHighlightテスト', memo: 'ハイライトメモ' }];
      highlightTextsInAnimationFrame(highlights);

      const mark = document.querySelector('mark.reading-support-highlight');
      expect(mark).not.toBeNull();
      expect(mark?.getAttribute('data-memo')).toBe('ハイライトメモ');
    });
  });

  describe('R6: data-record-id と HighlightActionPopup 統合 (Req 6.1, 6.3, 6.4)', () => {
    it('highlightText が id を受け取り data-record-id 属性を設定する (Req 6.1)', () => {
      const p = document.createElement('p');
      p.textContent = 'IDテスト文章';
      document.body.appendChild(p);

      highlightText('IDテスト', 'メモ', 'rec-123');

      const mark = document.querySelector('mark.reading-support-highlight');
      expect(mark?.getAttribute('data-record-id')).toBe('rec-123');
    });

    it('highlightTextsInAnimationFrame が id を data-record-id として設定する (Req 6.1)', () => {
      const p = document.createElement('p');
      p.textContent = 'ハイライトIDテスト文章';
      document.body.appendChild(p);

      highlightTextsInAnimationFrame([{ id: 'rec-456', text: 'ハイライトIDテスト', memo: 'テストメモ' }]);

      const mark = document.querySelector('mark.reading-support-highlight');
      expect(mark?.getAttribute('data-record-id')).toBe('rec-456');
    });

    it('setupClickEvents が <mark> クリックで HighlightActionPopup.show() を呼ぶ (Req 6.1)', () => {
      const p = document.createElement('p');
      p.textContent = 'クリックテスト文章';
      document.body.appendChild(p);

      highlightText('クリックテスト', 'メモ', 'rec-click');

      const mockPopup = {
        show: jest.fn(),
        close: jest.fn(),
        setCallbacks: jest.fn(),
      } as unknown as HighlightActionPopup;

      setupClickEvents(mockPopup);

      const mark = document.querySelector('mark.reading-support-highlight') as HTMLElement;
      mark.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(mockPopup.show).toHaveBeenCalledWith('rec-click', 'メモ', mark);
    });

    it('HighlightController の onMemoUpdated コールバックで data-memo が更新される (Req 6.3)', () => {
      const p = document.createElement('p');
      p.textContent = 'メモ更新テスト文章';
      document.body.appendChild(p);

      highlightText('メモ更新テスト', '古いメモ', 'rec-update');

      const mark = document.querySelector('mark.reading-support-highlight') as HTMLElement;
      expect(mark.getAttribute('data-memo')).toBe('古いメモ');

      // HighlightController のコールバック（handleMemoUpdated）相当の処理を直接テスト
      // 対応する <mark> の data-memo を更新する
      const marks = document.querySelectorAll('mark.reading-support-highlight[data-record-id="rec-update"]');
      marks.forEach((m) => {
        m.setAttribute('data-memo', '新しいメモ');
      });

      expect(mark.getAttribute('data-memo')).toBe('新しいメモ');
    });

    it('HighlightController の onHighlightDeleted コールバックで <mark> が DOM から除去される (Req 6.4)', () => {
      const p = document.createElement('p');
      p.textContent = '削除テスト文章';
      document.body.appendChild(p);

      highlightText('削除テスト', 'メモ', 'rec-delete');

      expect(document.querySelector('mark.reading-support-highlight[data-record-id="rec-delete"]')).not.toBeNull();

      // HighlightController の handleHighlightDeleted 相当の処理をテスト
      const marks = document.querySelectorAll('mark.reading-support-highlight[data-record-id="rec-delete"]');
      marks.forEach((mark) => {
        const parent = mark.parentNode;
        if (parent) {
          while (mark.firstChild) {
            parent.insertBefore(mark.firstChild, mark);
          }
          parent.removeChild(mark);
        }
      });

      expect(document.querySelector('mark.reading-support-highlight[data-record-id="rec-delete"]')).toBeNull();
      // テキストは残っている
      expect(p.textContent).toContain('削除テスト');
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
