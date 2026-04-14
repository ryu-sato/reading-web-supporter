/**
 * content/text-selector.ts のユニットテスト
 * タスク 2.1: Content Scriptでテキスト選択検知を構築
 *
 * 設計書要件:
 * - Requirements: 1.1, 1.4
 * - mouseup / touchend イベントでテキスト選択を検知
 * - window.getSelection().toString() で選択テキストを取得
 * - window.location.href でページURLを取得
 * - Service Worker へ textSelectionUpdated メッセージを送信
 * - テキスト未選択時も通知（hasSelection: false）
 * - debounce: 250ms で頻繁な通知を抑止
 */

import { getSelectionState, notifySelectionChange, initTextSelector } from './text-selector';
import type { TextSelectionMessage } from '../types/types';

// chrome.runtime.sendMessage のモック
const mockSendMessage = jest.fn();

// document のイベントリスナーモック
const mockAddEventListener = jest.fn();
const mockDispatchEvent = jest.fn();
const mockListeners: Record<string, EventListener[]> = {};

beforeAll(() => {
  // グローバル document をモック（nodeテスト環境では未定義のため）
  (global as unknown as Record<string, unknown>).document = {
    addEventListener: (event: string, handler: EventListener) => {
      if (!mockListeners[event]) {
        mockListeners[event] = [];
      }
      mockListeners[event].push(handler);
      mockAddEventListener(event, handler);
    },
    dispatchEvent: mockDispatchEvent,
  };
});

beforeEach(() => {
  // グローバル chrome API をモック
  (global as unknown as { chrome: unknown }).chrome = {
    runtime: {
      sendMessage: mockSendMessage,
    },
  };
  mockSendMessage.mockResolvedValue(undefined);

  // window.getSelection のモック
  (global as unknown as Record<string, unknown>).window = {
    getSelection: jest.fn().mockReturnValue({
      toString: jest.fn().mockReturnValue(''),
    }),
    location: { href: 'https://example.com/blog/post' },
  };
});

afterEach(() => {
  jest.clearAllMocks();
  // リスナーのリセット
  Object.keys(mockListeners).forEach(key => {
    delete mockListeners[key];
  });
});

describe('content/text-selector.ts - テキスト選択検知', () => {
  describe('getSelectionState - 選択状態の取得', () => {
    it('テキストが選択されている場合、selectedTextとhasSelectionを正しく返す', () => {
      (global as unknown as { window: { getSelection: jest.Mock; location: { href: string } } }).window.getSelection.mockReturnValue({
        toString: jest.fn().mockReturnValue('選択されたテキスト'),
      });

      const state = getSelectionState();

      expect(state.selectedText).toBe('選択されたテキスト');
      expect(state.hasSelection).toBe(true);
      expect(state.pageUrl).toBe('https://example.com/blog/post');
    });

    it('テキストが選択されていない場合、hasSelectionがfalseになる', () => {
      (global as unknown as { window: { getSelection: jest.Mock; location: { href: string } } }).window.getSelection.mockReturnValue({
        toString: jest.fn().mockReturnValue(''),
      });

      const state = getSelectionState();

      expect(state.selectedText).toBe('');
      expect(state.hasSelection).toBe(false);
    });

    it('window.getSelectionがnullを返す場合、空文字とhasSelection: falseを返す', () => {
      (global as unknown as { window: { getSelection: jest.Mock; location: { href: string } } }).window.getSelection.mockReturnValue(null);

      const state = getSelectionState();

      expect(state.selectedText).toBe('');
      expect(state.hasSelection).toBe(false);
    });

    it('空白のみのテキストはトリムしてhasSelection: falseを返す', () => {
      (global as unknown as { window: { getSelection: jest.Mock; location: { href: string } } }).window.getSelection.mockReturnValue({
        toString: jest.fn().mockReturnValue('   '),
      });

      const state = getSelectionState();

      expect(state.selectedText).toBe('');
      expect(state.hasSelection).toBe(false);
    });

    it('pageUrlはwindow.location.hrefから取得する', () => {
      (global as unknown as { window: { getSelection: jest.Mock; location: { href: string } } }).window = {
        getSelection: jest.fn().mockReturnValue({
          toString: jest.fn().mockReturnValue(''),
        }),
        location: { href: 'https://myblog.example.com/articles/123' },
      };

      const state = getSelectionState();

      expect(state.pageUrl).toBe('https://myblog.example.com/articles/123');
    });

    it('返されるオブジェクトはTextSelectionMessageのpayload形式に適合する', () => {
      (global as unknown as { window: { getSelection: jest.Mock; location: { href: string } } }).window.getSelection.mockReturnValue({
        toString: jest.fn().mockReturnValue('テスト'),
      });

      const state = getSelectionState();

      expect(state).toHaveProperty('selectedText');
      expect(state).toHaveProperty('pageUrl');
      expect(state).toHaveProperty('hasSelection');
    });
  });

  describe('notifySelectionChange - Service Workerへの通知', () => {
    it('テキスト選択時にchrome.runtime.sendMessageを呼び出す', async () => {
      (global as unknown as { window: { getSelection: jest.Mock; location: { href: string } } }).window.getSelection.mockReturnValue({
        toString: jest.fn().mockReturnValue('重要な文章'),
      });

      notifySelectionChange();

      await Promise.resolve();

      expect(mockSendMessage).toHaveBeenCalledTimes(1);
    });

    it('送信メッセージのtypeはtextSelectionUpdatedである', async () => {
      (global as unknown as { window: { getSelection: jest.Mock; location: { href: string } } }).window.getSelection.mockReturnValue({
        toString: jest.fn().mockReturnValue('テスト'),
      });

      notifySelectionChange();
      await Promise.resolve();

      const calledWith = mockSendMessage.mock.calls[0][0] as TextSelectionMessage;
      expect(calledWith.type).toBe('textSelectionUpdated');
    });

    it('送信メッセージのpayloadに選択テキストが含まれる', async () => {
      (global as unknown as { window: { getSelection: jest.Mock; location: { href: string } } }).window.getSelection.mockReturnValue({
        toString: jest.fn().mockReturnValue('選択されたテキスト内容'),
      });

      notifySelectionChange();
      await Promise.resolve();

      const calledWith = mockSendMessage.mock.calls[0][0] as TextSelectionMessage;
      expect(calledWith.payload.selectedText).toBe('選択されたテキスト内容');
    });

    it('送信メッセージのpayloadにpageUrlが含まれる', async () => {
      (global as unknown as { window: { getSelection: jest.Mock; location: { href: string } } }).window.getSelection.mockReturnValue({
        toString: jest.fn().mockReturnValue('テスト'),
      });

      notifySelectionChange();
      await Promise.resolve();

      const calledWith = mockSendMessage.mock.calls[0][0] as TextSelectionMessage;
      expect(calledWith.payload.pageUrl).toBe('https://example.com/blog/post');
    });

    it('送信メッセージのpayloadにhasSelectionが含まれる（true）', async () => {
      (global as unknown as { window: { getSelection: jest.Mock; location: { href: string } } }).window.getSelection.mockReturnValue({
        toString: jest.fn().mockReturnValue('テスト'),
      });

      notifySelectionChange();
      await Promise.resolve();

      const calledWith = mockSendMessage.mock.calls[0][0] as TextSelectionMessage;
      expect(calledWith.payload.hasSelection).toBe(true);
    });

    it('テキスト未選択時もService Workerに通知する（hasSelection: false）', async () => {
      // Requirement 1.4: テキスト未選択時に保存操作を無効化
      (global as unknown as { window: { getSelection: jest.Mock; location: { href: string } } }).window.getSelection.mockReturnValue({
        toString: jest.fn().mockReturnValue(''),
      });

      notifySelectionChange();
      await Promise.resolve();

      expect(mockSendMessage).toHaveBeenCalledTimes(1);
      const calledWith = mockSendMessage.mock.calls[0][0] as TextSelectionMessage;
      expect(calledWith.payload.hasSelection).toBe(false);
      expect(calledWith.payload.selectedText).toBe('');
    });

    it('Service Workerが未起動でsendMessageが失敗してもエラーをスローしない', async () => {
      (global as unknown as { window: { getSelection: jest.Mock; location: { href: string } } }).window.getSelection.mockReturnValue({
        toString: jest.fn().mockReturnValue('テスト'),
      });
      mockSendMessage.mockRejectedValue(new Error('Extension context invalidated'));

      expect(() => notifySelectionChange()).not.toThrow();
      // Promiseのrejectionが処理されるまで待つ
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    it('chromeグローバルが未定義の場合にエラーをスローしない', () => {
      // chrome が未定義の環境でもエラーにならない
      delete (global as unknown as { chrome?: unknown }).chrome;

      (global as unknown as { window: { getSelection: jest.Mock; location: { href: string } } }).window.getSelection.mockReturnValue({
        toString: jest.fn().mockReturnValue('テスト'),
      });

      expect(() => notifySelectionChange()).not.toThrow();
    });
  });

  describe('initTextSelector - イベントリスナーの登録', () => {
    it('mouseupイベントリスナーが登録される', () => {
      initTextSelector();

      const mouseupListeners = mockListeners['mouseup'] || [];
      expect(mouseupListeners.length).toBeGreaterThan(0);
    });

    it('touchendイベントリスナーが登録される', () => {
      initTextSelector();

      const touchendListeners = mockListeners['touchend'] || [];
      expect(touchendListeners.length).toBeGreaterThan(0);
    });

    it('mouseupとtouchendの両方のリスナーが登録される', () => {
      initTextSelector();

      expect(mockAddEventListener).toHaveBeenCalledWith('mouseup', expect.any(Function));
      expect(mockAddEventListener).toHaveBeenCalledWith('touchend', expect.any(Function));
    });
  });

  describe('debounce - 250ms の遅延処理', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      initTextSelector();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('mouseupイベントが連続して発火してもsendMessageは一度しか呼ばれない（debounce効果）', async () => {
      (global as unknown as { window: { getSelection: jest.Mock; location: { href: string } } }).window.getSelection.mockReturnValue({
        toString: jest.fn().mockReturnValue('テスト'),
      });

      // 登録されたmouseupリスナーを直接呼び出す（debounced）
      const mouseupHandler = mockListeners['mouseup']?.[0];
      if (mouseupHandler) {
        mouseupHandler(new Event('mouseup') as Event & Parameters<EventListener>[0]);
        mouseupHandler(new Event('mouseup') as Event & Parameters<EventListener>[0]);
        mouseupHandler(new Event('mouseup') as Event & Parameters<EventListener>[0]);
      }

      // debounce前は呼ばれていないはず
      expect(mockSendMessage).not.toHaveBeenCalled();

      // 250ms後に実行される
      jest.advanceTimersByTime(250);
      await Promise.resolve();

      expect(mockSendMessage).toHaveBeenCalledTimes(1);
    });

    it('250ms以内の連続イベントはまとめて処理される', async () => {
      (global as unknown as { window: { getSelection: jest.Mock; location: { href: string } } }).window.getSelection.mockReturnValue({
        toString: jest.fn().mockReturnValue('テスト'),
      });

      const mouseupHandler = mockListeners['mouseup']?.[0];
      if (mouseupHandler) {
        mouseupHandler(new Event('mouseup') as Event & Parameters<EventListener>[0]);
        jest.advanceTimersByTime(100);
        mouseupHandler(new Event('mouseup') as Event & Parameters<EventListener>[0]);
        jest.advanceTimersByTime(100);
        mouseupHandler(new Event('mouseup') as Event & Parameters<EventListener>[0]);
      }

      // まだ250ms経過していないので呼ばれない
      expect(mockSendMessage).not.toHaveBeenCalled();

      // 最後のイベントから250ms後に一度だけ呼ばれる
      jest.advanceTimersByTime(250);
      await Promise.resolve();

      expect(mockSendMessage).toHaveBeenCalledTimes(1);
    });

    it('250ms経過後の別イベントは別途呼び出しになる', async () => {
      (global as unknown as { window: { getSelection: jest.Mock; location: { href: string } } }).window.getSelection.mockReturnValue({
        toString: jest.fn().mockReturnValue('テスト'),
      });

      const mouseupHandler = mockListeners['mouseup']?.[0];
      if (mouseupHandler) {
        mouseupHandler(new Event('mouseup') as Event & Parameters<EventListener>[0]);
        jest.advanceTimersByTime(300);
        await Promise.resolve();

        mouseupHandler(new Event('mouseup') as Event & Parameters<EventListener>[0]);
        jest.advanceTimersByTime(300);
        await Promise.resolve();
      }

      expect(mockSendMessage).toHaveBeenCalledTimes(2);
    });

    it('touchendイベントでもdebounceが動作する', async () => {
      (global as unknown as { window: { getSelection: jest.Mock; location: { href: string } } }).window.getSelection.mockReturnValue({
        toString: jest.fn().mockReturnValue('モバイル選択テキスト'),
      });

      const touchendHandler = mockListeners['touchend']?.[0];
      if (touchendHandler) {
        touchendHandler(new Event('touchend') as Event & Parameters<EventListener>[0]);
        touchendHandler(new Event('touchend') as Event & Parameters<EventListener>[0]);
      }

      expect(mockSendMessage).not.toHaveBeenCalled();

      jest.advanceTimersByTime(250);
      await Promise.resolve();

      expect(mockSendMessage).toHaveBeenCalledTimes(1);
      const calledWith = mockSendMessage.mock.calls[0][0] as TextSelectionMessage;
      expect(calledWith.type).toBe('textSelectionUpdated');
    });
  });
});
