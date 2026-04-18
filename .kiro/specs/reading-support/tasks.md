# 実装計画

## 1. 基盤

- [x] 1.1 プロジェクト構造とビルド設定のセットアップ
  - TypeScript、webpack、@supabase/supabase-js依存関係を含むpackage.jsonを作成
  - Chrome拡張機能タイプ（@types/chrome）を含むES2020+用のtsconfig.jsonを設定
  - content scriptとservice worker用の分離されたエントリポイントのwebpack設定をセットアップ
  - TypeScriptコンパイレーション用のChrome拡張機能開発環境が準備完了
  - _Requirements: 1.1, 1.2, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 1.2 Chrome拡張機能マニフェストとディレクトリ構造を作成
  - content_scripts、service_worker、options_page宣言を含むmanifest.json v3を生成
  - src/ディレクトリ構造を作成：content/、service-worker/、options/、types/、utils/
  - 拡張機能アイコン（16px、48px、128px）と静的アセットを含むpublic/ディレクトリをセットアップ
  - 拡張機能がChromeデベロッパーモードでマニフェストエラーなしで読み込まれる
  - _Requirements: 1.1, 1.2, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 1.3 (P) 共有TypeScript型とユーティリティを定義
  - SupabaseCredentials、SaveTextOptions、SaveResultインターフェースを含むtypes/types.tsを作成
  - content scriptとservice worker間で一貫したログ記録のためのutils/logger.tsを作成
  - 標準化されたユーザーフィードバック表示ロジックのためのutils/error-handler.tsを作成
  - 全コンポーネントが循環依存なしで共有型をインポート可能
  - _Requirements: 1.2, 1.3, 2.1, 2.2, 2.3, 3.1, 3.2, 3.5_
  - _Boundary: 共有型とユーティリティ_

- [x] 1.4 (P) 拡張機能バンドルを構築しChrome読み込みを確認
  - content scriptとservice worker用の分離されたバンドルを作成するwebpackを設定
  - 適切なマニフェストとともに拡張機能をdist/ディレクトリにパッケージ化するビルドスクリプトをセットアップ
  - ソースマップとChrome DevToolsデバッグを有効にする開発ビルドを追加
  - 拡張機能が正常にビルドされ、Chromeデベロッパーモードでエラーなしで読み込まれる
  - _Requirements: 1.1, 1.2, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4, 3.5_
  - _Boundary: ビルドシステム_

## 2. コア実装

- [x] 2.1 (P) content scriptでテキスト選択検知を構築
  - Webページ上のmouseup/touchイベントを監視するTextSelectorクラスを実装
  - window.getSelection()とlocation.hrefキャプチャを含むデバウンスされた選択追跡（250ms）を追加
  - 選択状態が変更されたときのservice workerへのメッセージ送信をセットアップ
  - テキスト選択が選択テキストとURLを含む適切なTextSelectionMessageをservice workerにトリガー
  - _Requirements: 1.1, 1.4_
  - _Boundary: Content Scriptドメイン_

- [x] 2.2 (P) 認証情報ストレージ用の設定マネージャーを実装
  - SupabaseCredentialsインターフェースを使用するChrome storage操作用のSettingsManagerクラスを作成
  - HTTPS URL形式とAPIキー形式（40文字以上）の認証情報検証を追加
  - getCredentials()、setCredentials()、isConfigured()、testConnection()メソッドを実装
  - chrome.runtime.sendMessageを介して認証情報が更新されたときの状態変更通知を追加
  - 認証情報がブラウザ再起動でも永続化され、検証により無効なデータストレージが防止される
  - _Requirements: 2.3, 3.1, 3.2, 3.3, 3.4, 3.5_
  - _Boundary: Service Workerドメイン - 設定管理_

- [x] 2.3 (P) データベース操作用のSupabaseライターを作成
  - @supabase/supabase-jsを使用してsave()とtestConnection()メソッドを持つSupabaseWriterクラスを実装
  - SettingsManagerからの認証情報を使用してSupabaseクライアント初期化を追加
  - ネットワーク障害に対する指数バックオフ（1秒、2秒、4秒）によるリトライロジックを実装、最大3回試行
  - 適切なSaveResultエラー型での認証エラー、ネットワークエラー、データベースエラーを処理
  - 保存操作がSupabaseに読書記録を正常に書き込みまたは構造化されたエラーレスポンスを返す
  - _Requirements: 1.2, 1.3, 2.1, 2.2_
  - _Boundary: Service Workerドメイン - Supabase統合_
  - _Depends: 2.2_

- [x] 2.4 (P) 保存操作用のコンテキストメニューハンドラーを構築
  - Chrome context menu項目「Save to Supabase」を登録するContextMenuHandlerクラスを実装
  - MessageHandlerを介して現在のテキスト選択を取得するonClickedイベント処理を追加
  - メニュー項目がクリックされたときに保存操作を実行するSupabaseWriterとの統合
  - Chrome notifications APIを介してユーザーに成功/失敗フィードバックを表示
  - テキスト選択時にコンテキストメニューが表示され、保存操作が明確なユーザーフィードバックで完了
  - _Requirements: 1.1, 1.3, 1.4_
  - _Boundary: Service Workerドメイン - コンテキストメニュー統合_
  - _Depends: 2.3, 2.5_

- [x] 2.5 (P) メッセージルーティングシステムを作成
  - content scriptとservice worker間でメッセージをルーティングするMessageHandlerクラスを実装
  - 型ベースのメッセージディスパッチを含む一元化されたchrome.runtime.onMessageリスナーを追加
  - テキスト選択更新と保存操作リクエスト用のメッセージ契約をセットアップ
  - ContextMenuHandlerからのgetSelectionメッセージのリクエスト/レスポンス処理を追加
  - 全コンポーネント間通信がメッセージの損失なしで適切なメッセージチャネルを介して流れる
  - _Requirements: 1.1, 1.2, 1.4, 2.1_
  - _Boundary: Service Workerドメイン - メッセージルーティング_

- [x] 2.6 (P) 設定構成用のオプションページUIを構築
  - Supabase Project URLとAnon Key入力のフォームフィールドを含むoptions.htmlを作成
  - フォーム処理、検証、SettingsManager統合を含むoptions.tsを実装
  - ステータスdivでのリアルタイムの成功/エラー表示を含む「Test Connection」と「Save」ボタンを追加
  - クリーンなChrome拡張機能オプションページ標準を使用してoptions.cssでスタイル設定
  - ユーザーが即座のフィードバックを含む親しみやすいインターフェースを通じてSupabase認証情報を入力、テスト、保存可能
  - _Requirements: 3.1, 3.2_
  - _Boundary: Options Pageドメイン_

## 3. 統合

- [x] 3.1 service workerバックグラウンドオーケストレーションを配線
  - 適切なManifest V3ライフサイクルを含むservice workerエントリポイントとしてbackground.tsを作成
  - 拡張機能起動時にContextMenuHandler、MessageHandler、SettingsManager、SupabaseWriterを初期化
  - service workerアクティベーションイベント中にコンテキストメニュー登録をセットアップ
  - 一元化された初期化を介したすべてのservice workerコンポーネント間の調整を追加
  - 拡張機能が適切に初期化され、すべてのservice workerコンポーネントが正常に通信する
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2_

- [x] 3.2 content scriptとservice workerメッセージングを接続
  - service workerへの適切なメッセージ送信を含むcontent scriptでTextSelectorを初期化
  - content scriptからのテキスト選択更新を受信するservice worker MessageHandlerをセットアップ
  - 選択イベントに基づいてメニューを有効/無効にするコンテキストメニュー状態管理を追加
  - Webページ上のテキスト選択が保存操作のコンテキストメニュー可用性を適切にトリガー
  - _Requirements: 1.1, 1.4_

- [x] 3.3 オプションページと設定管理を統合
  - chrome.runtime.messagingを介したSettingsManager APIへのオプションページフォーム送信を接続
  - リアルタイム検証フィードバックと成功/エラー表示を含む接続テストを追加
  - 認証情報の永続化と拡張機能全体での設定変更の即座の反映をセットアップ
  - オプションページがライブ接続検証を含む完全な設定管理を提供
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 3.4 エンドツーエンド拡張機能機能を確認
  - Chromeに拡張機能を手動でインストールし、完全なユーザーワークフローをテスト
  - 検証：テキスト選択 → コンテキストメニュー表示 → 保存クリック → 成功通知 → Supabaseのデータ
  - オプションページをテスト：認証情報入力 → 接続テスト → 設定保存 → 設定永続化
  - 完全な拡張機能がインストールからデータストレージまで正常に機能
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4, 3.5_

## 4. 検証

- [x]* 4.1 個別コンポーネントのユニットテスト
  - モックされたDOMイベントでTextSelector選択検知とデバウンス動作をテスト
  - モックされたSupabaseクライアントでSupabaseWriter保存操作とエラー処理をテスト
  - モックされたChrome storage APIでSettingsManager CRUD操作と検証をテスト
  - モックされたChrome APIでContextMenuHandlerメニュー作成とクリックイベント処理をテスト
  - すべてのコンポーネントが外部依存関係の適切なモッキングで分離されたユニットテストに合格
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4, 3.5_

- [x]* 4.2 エンドツーエンドテストシナリオ
  - 完全なフローをテスト：テキスト選択 → コンテキストメニュー → 保存 → Supabaseデータベース検証
  - 設定構成をテスト：認証情報入力 → 接続テスト → 永続化検証
  - エラーシナリオをテスト：ネットワーク障害、無効な認証情報、空のテキスト選択処理
  - テキスト選択から成功したデータベースストレージまで完全なユーザーワークフローが正常に機能
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4, 3.5_

## 5. ハイライト機能の型定義

- [x] 5.1 共有型にハイライト機能の型定義を追加
  - `GetHighlightsMessage`インターフェース（`type: 'getHighlights'; payload: { pageUrl: string }`）をtypes.tsに追加
  - `HighlightsResponse`インターフェース（`success: boolean; texts?: string[]; error?: { code, message }`）を追加
  - `ExtensionMessage`共用体型に`GetHighlightsMessage`を追加
  - 全コンポーネントがハイライト機能のメッセージ型をインポート可能でビルドエラーがない
  - _Requirements: 4.1, 4.6_
  - _Boundary: 共有型定義_

## 6. ハイライト機能コア実装

- [x] 6.1 (P) SupabaseReaderコンポーネントを実装
  - `fetchSavedTexts(options: FetchHighlightsOptions): Promise<HighlightsResponse>`メソッドを実装
  - SettingsManagerから認証情報を取得してSupabaseクライアントを初期化
  - `supabase.from('readings').select('selected_text').eq('page_url', pageUrl)`クエリを実装
  - タイムアウト（10秒）でネットワークエラーと判定するロジックを追加
  - 取得失敗時は`success: false`の`HighlightsResponse`を返す（例外をスローしない）
  - SELECT操作がSupabaseからテキスト文字列配列を正常に取得またはエラーレスポンスを返す
  - _Requirements: 4.1, 4.5_
  - _Boundary: Service Worker Domain - Supabase統合_
  - _Depends: 5.1_

- [x] 6.2 (P) HighlightControllerコンポーネントを実装
  - `DOMContentLoaded`後に起動し`isConfigured`メッセージでSettingsManagerの設定状態を確認
  - 認証情報未設定時は処理を即座に中断する（要件4.6）
  - Service Workerへ`getHighlights`メッセージを送信し保存済みテキストリストを取得
  - DOM TreeWalkerでテキストノードを走査し一致箇所を`<mark class="reading-support-highlight">`でラップ
  - 複数テキストを全件ハイライト、DOM上に見つからないテキストはスキップして継続（要件4.3, 4.4）
  - Supabase取得失敗時はページ表示を妨げずサイレント中断（要件4.5）
  - ハイライトCSS（`background: #FFFF99; color: inherit;`）を`<style>`タグとして一度だけ注入
  - 保存済みテキストを含むページでDOMに`<mark>`要素が追加され視覚的にハイライト表示される
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_
  - _Boundary: Content Script Domain_
  - _Depends: 5.1_

## 7. ハイライト機能統合

- [x] 7.1 MessageHandlerにgetHighlightsハンドラを追加
  - `getHighlights`メッセージ受信時にSupabaseReader.fetchSavedTexts()を実行するハンドラを追加
  - 取得結果（`HighlightsResponse`）をContent Scriptに非同期で返却する処理を実装
  - `getHighlights`メッセージがContent ScriptからService Workerを経由してSupabaseへ正常に流れる
  - _Requirements: 4.1, 4.5_
  - _Boundary: Service Worker Domain - メッセージルーティング_
  - _Depends: 6.1_

- [x] 7.2 HighlightControllerをContent Scriptに統合しService Workerを更新
  - Content ScriptエントリポイントにHighlightControllerのインスタンスを作成・初期化
  - background.tsにSupabaseReaderのインスタンスを追加してService Workerコンポーネントを更新
  - ページロード時にHighlightControllerが起動し保存済みテキストがハイライト表示される完全なフローを確認
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_
  - _Depends: 6.2, 7.1_

## 8. ハイライト機能検証

- [x]* 8.1 HighlightControllerとSupabaseReaderのユニットテスト
  - HighlightController: 単一/複数テキストのハイライト（`<mark>`要素の挿入を確認）をテスト
  - HighlightController: DOM上に存在しないテキストのスキップと継続をテスト
  - HighlightController: 認証情報未設定時の即時中断をテスト
  - HighlightController: Supabase取得失敗時のサイレント中断をテスト
  - SupabaseReader: 成功ケース（テキスト配列返却）、0件ケース（空配列）をテスト
  - SupabaseReader: ネットワークエラー、認証エラー（AUTH_FAILEDコード）をテスト
  - すべてのコンポーネントが外部依存関係のモッキングで分離されたユニットテストに合格
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

- [x]* 8.2 ハイライト機能のエンドツーエンドテスト
  - 保存済みテキストを含むページロード → ハイライト表示の完全フローをテスト
  - 認証情報未設定状態でのページロード → ハイライト処理なし（エラーなし）をテスト
  - Supabase取得失敗シナリオ → ページ表示が正常であることをテスト
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

## 9. メモ機能の型定義更新

- [x] 9.1 共有型定義をメモ機能に対応するよう更新
  - `SavedHighlight` インターフェース（`{ text: string; memo?: string }`）を types.ts に追加
  - `HighlightsResponse` の `texts?: string[]` を `highlights?: SavedHighlight[]` に変更（ブレイキングチェンジ）
  - `SaveTextOptions` に `memo?: string` フィールドを追加
  - `ExtensionMessage` 共用体型に `ShowMemoInputMessage`（`{ type: 'showMemoInput'; payload: { selectedText: string; pageUrl: string } }`）を追加
  - 全コンポーネントが新型定義をインポートしてビルドエラーなしでコンパイル可能
  - **注**: 既存ユーザーは Supabase テーブルに `ALTER TABLE readings ADD COLUMN memo TEXT;` の実行が必要
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_
  - _Boundary: 共有型定義_

## 10. メモ機能コア実装

- [x] 10.1 (P) MemoInputUI コンポーネントを新規実装
  - `showMemoInput` メッセージを受信して Shadow DOM ベースのメモ入力オーバーレイを表示する
  - 選択テキストのプレビューと `<textarea>` によるメモ入力フィールド・Save/Cancel ボタンを含む UI を実装
  - Save 押下時に `saveSelection`（selectedText, pageUrl, memo）メッセージを Service Worker へ送信
  - Cancel 押下時または背景クリック時はダイアログを閉じ保存処理を実行しない（5.3）
  - メモ空欄のまま Save しても `saveSelection` が送信され保存処理が続行される（5.3）
  - `<style>` を Shadow DOM 内に注入してページのグローバル CSS の影響を排除
  - メモ入力ダイアログが表示され Save/Cancel 操作が正常に動作する
  - _Requirements: 5.1, 5.2, 5.3_
  - _Boundary: Content Script Domain_
  - _Depends: 9.1_

- [x] 10.2 (P) ContextMenuHandler をメモ入力フロー対応に更新
  - `onClicked` ハンドラで `SupabaseWriter.save()` を直接呼ぶ代わりに `chrome.tabs.sendMessage(tab.id, { type: 'showMemoInput', payload: { selectedText, pageUrl } })` を送信するよう変更
  - コンテキストメニュークリック時に MemoInputUI が起動しメモ入力ダイアログが表示されることを確認
  - SupabaseWriter の直接呼び出しが ContextMenuHandler から除去されている
  - _Requirements: 5.1_
  - _Boundary: Service Worker Domain - コンテキストメニュー統合_
  - _Depends: 9.1_

- [x] 10.3 (P) SupabaseWriter と MessageHandler をメモ対応に更新
  - `SupabaseWriter.save()` の INSERT 文に `memo` フィールドを追加（undefined の場合は NULL として挿入）
  - MessageHandler の `saveSelection` ハンドラで `memo` フィールドを `SupabaseWriter.save()` に渡すよう更新
  - memo ありの INSERT でレコードに `memo` カラムの値が格納されること、memo なし（undefined）で NULL が格納されることを確認
  - _Requirements: 5.2, 5.3_
  - _Boundary: Service Worker Domain - Supabase統合, メッセージルーティング_
  - _Depends: 9.1_

- [x] 10.4 (P) SupabaseReader をメモ取得対応に更新
  - `fetchSavedTexts` クエリを `select('selected_text, memo')` に変更して `memo` カラムも取得する
  - 戻り値の型を `string[]` から `SavedHighlight[]`（`{ text: string; memo?: string }`）に変更
  - `memo` が NULL のレコードは `memo: undefined` として返却する
  - SELECT 操作が `SavedHighlight[]`（text と memo を含む）を正常に返却する
  - _Requirements: 5.4_
  - _Boundary: Service Worker Domain - Supabase統合_
  - _Depends: 9.1_

- [x] 10.5 (P) HighlightController にツールチップ表示を追加
  - `HighlightsResponse.highlights` (`SavedHighlight[]`) を受け取るよう更新（`texts?: string[]` から変更）
  - `<mark>` 要素のラップ時に `memo` が存在する場合 `data-memo` 属性を設定する（5.4）
  - ページに1つのツールチップ要素（`<div class="reading-support-tooltip">`）を保持し mouseover/mouseout イベントで表示/非表示を切り替える
  - `memo` が undefined/null/空文字の場合はツールチップを表示しない（5.5）
  - `<mark>` 要素へのホバー時に `data-memo` を持つ要素ではツールチップが表示され、持たない要素では表示されない
  - _Requirements: 5.4, 5.5_
  - _Boundary: Content Script Domain_
  - _Depends: 9.1_

## 11. メモ機能統合

- [x] 11.1 保存フロー全体を接続して動作確認
  - Content Script エントリポイントに `MemoInputUI` のインスタンスを作成・初期化
  - 完全なフローを確認：コンテキストメニュークリック → `showMemoInput` → MemoInputUI ダイアログ表示 → Save → `saveSelection`（memo含む） → MessageHandler → SupabaseWriter → Supabase INSERT
  - memo を入力して保存 → Supabase レコードに memo 値が格納されることを確認
  - memo 未入力で保存 → Supabase レコードの memo カラムが NULL であることを確認
  - _Requirements: 5.1, 5.2, 5.3_
  - _Depends: 10.1, 10.2, 10.3_

- [x] 11.2 ハイライト＋ツールチップフローを接続して動作確認
  - MessageHandler の `getHighlights` レスポンスが `SavedHighlight[]` を返すことを確認（SupabaseReader 変更の伝播）
  - HighlightController が `highlights` フィールドを正しく読み取ることを確認
  - memo ありのレコードを保存済みのページを開き `<mark>` 要素へのホバーでツールチップが表示されることを確認
  - memo なしのレコードのハイライトではホバーしてもツールチップが表示されないことを確認
  - _Requirements: 5.4, 5.5_
  - _Depends: 10.4, 10.5_

## 12. メモ機能検証

- [x]* 12.1 メモ機能のユニットテスト
  - MemoInputUI: `showMemoInput` 受信でオーバーレイが DOM に挿入されることをテスト
  - MemoInputUI: Save 押下で `saveSelection`（memo含む）が送信されることをテスト
  - MemoInputUI: memo 空でも Save 可能（`memo: undefined`で送信）をテスト（5.3）
  - MemoInputUI: Cancel 押下で `saveSelection` が送信されないことをテスト
  - HighlightController: memo ありの `SavedHighlight` で `<mark>` に `data-memo` 属性が設定されることをテスト（5.4）
  - HighlightController: mouseover 時にツールチップが表示され mouseout で非表示になることをテスト（5.4）
  - HighlightController: memo なし（undefined/null/空文字）でツールチップが表示されないことをテスト（5.5）
  - SupabaseWriter: memo ありの INSERT で memo カラムに値が入ることをテスト
  - SupabaseWriter: memo なし（undefined）の INSERT で memo カラムが NULL になることをテスト
  - SupabaseReader: `selected_text` と `memo` を含む `SavedHighlight[]` が返却されることをテスト
  - ContextMenuHandler: onClicked で `showMemoInput` メッセージが送信され SupabaseWriter が直接呼ばれないことをテスト
  - すべてのコンポーネントが外部依存関係のモッキングで分離されたユニットテストに合格
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x]* 12.2 メモ機能のエンドツーエンドテスト
  - テキスト選択 → メモ入力ダイアログ表示 → memo 入力して Save → Supabase に memo 付きレコードが INSERT されることを確認
  - テキスト選択 → memo 未入力で Save → Supabase に memo = NULL のレコードが INSERT されることを確認
  - memo ありの保存済みテキストを含むページを開く → ハイライト表示 → ホバーでツールチップ表示
  - memo なしの保存済みテキストを含むページを開く → ハイライト表示 → ホバーでツールチップ非表示
  - Cancel 押下後 → 保存されず Supabase にレコードが追加されていないことを確認
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

## 13. R6メモ編集・削除機能の型定義更新

- [ ] 13.1 共有型定義に編集・削除機能用の型を追加する
  - `SavedHighlight` インターフェースに `id: string` フィールドを追加する（編集・削除操作のレコード識別子として使用）
  - `UpdateMemoMessage`（`{ type: 'updateMemo'; payload: { id: string; memo: string } }`）を `ExtensionMessage` 共用体に追加する
  - `DeleteHighlightMessage`（`{ type: 'deleteHighlight'; payload: { id: string } }`）を `ExtensionMessage` 共用体に追加する
  - `UpdateResult`・`DeleteResult` インターフェース（`success: boolean; error?: { code, message, recoveryHint }`）を追加する
  - 全コンポーネントが新型定義をインポートしてビルドエラーなしでコンパイル可能
  - _Requirements: 6.1, 6.3, 6.4_
  - _Boundary: 共有型定義_

## 14. R6メモ編集・削除機能コア実装

- [ ] 14.1 (P) HighlightActionPopup コンポーネントを実装する
  - Shadow DOM ベースのポップアップを `<mark>` 要素近傍に表示する
  - VIEW ステート：現在のメモ内容（未設定の場合は空欄）・「メモを編集」ボタン・「ハイライトを削除」ボタンを表示する（6.1）
  - EDIT ステート：既存メモが入力済みの textarea と「保存」・「キャンセル」ボタンを表示する（6.2）
  - 「保存」押下時に `updateMemo` メッセージを Service Worker へ送信し、成功時は HighlightController へ `onMemoUpdated` コールバックを呼び出す（6.3）
  - 「ハイライトを削除」押下時に削除確認を表示し、確定後 `deleteHighlight` メッセージを送信して `onHighlightDeleted` コールバックを呼び出す（6.4）
  - 更新・削除失敗時はエラーメッセージを表示しポップアップを維持する（6.5）
  - ポップアップ外クリックまたはキャンセル押下でポップアップを閉じ変更を保存しない（6.6）
  - メモ表示は XSS を防ぐため `textContent` のみを使用する（`innerHTML` 禁止）
  - メモ編集・削除操作が正常に動作し、失敗時のエラー表示が機能する
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_
  - _Boundary: Content Script Domain_
  - _Depends: 13.1_

- [ ] 14.2 (P) コンテキストメニューのラベルを更新する
  - ContextMenuHandler の `chrome.contextMenus.create()` 呼び出しのラベルを「ハイライトしてメモを保存」に変更する
  - 右クリックメニューに「ハイライトしてメモを保存」が表示される
  - _Requirements: 1.1_
  - _Boundary: Service Worker Domain - コンテキストメニュー統合_

- [ ] 14.3 (P) SupabaseWriter にメモ更新・レコード削除操作を追加する
  - `updateMemo(id: string, memo: string): Promise<UpdateResult>` メソッドを実装する（指定レコードの `memo` カラムを UPDATE）
  - `deleteRecord(id: string): Promise<DeleteResult>` メソッドを実装する（指定レコードを DELETE）
  - 更新・削除失敗時は `UpdateResult`/`DeleteResult` の `success: false` と構造化されたエラーコードを返す（6.5）
  - exponential backoff（1s, 2s, 4s）で最大 3 回リトライする
  - memo 更新・レコード削除操作が Supabase に正常に反映される
  - _Requirements: 6.3, 6.4, 6.5_
  - _Boundary: Service Worker Domain - Supabase統合_
  - _Depends: 13.1_

- [ ] 14.4 (P) SupabaseReader が保存済みテキストの ID を取得するよう更新する
  - `fetchSavedTexts` のクエリを `select('id, selected_text, memo')` に変更する
  - 戻り値の `SavedHighlight` に `id` フィールドを含めて返却する
  - `getHighlights` レスポンスに `id` フィールドを含む `SavedHighlight[]` が返却される
  - _Requirements: 6.1_
  - _Boundary: Service Worker Domain - Supabase統合_
  - _Depends: 13.1_

- [ ] 14.5 (P) MessageHandler にメモ編集・削除ハンドラを追加する
  - `updateMemo` メッセージ受信時に `SupabaseWriter.updateMemo()` を実行するハンドラを追加する
  - `deleteHighlight` メッセージ受信時に `SupabaseWriter.deleteRecord()` を実行するハンドラを追加する
  - 結果（`UpdateResult`/`DeleteResult`）を Content Script に非同期で返却する
  - `updateMemo`/`deleteHighlight` メッセージが Content Script から Service Worker を経由して Supabase へ正常に流れる
  - _Requirements: 6.3, 6.4_
  - _Boundary: Service Worker Domain - メッセージルーティング_
  - _Depends: 13.1, 14.3_

## 15. R6メモ編集・削除機能統合

- [ ] 15.1 HighlightController にクリック処理と HighlightActionPopup 制御を追加する
  - `<mark>` 要素ラップ時に `data-record-id` 属性（`SavedHighlight.id`）を設定する（6.1）
  - `<mark>` 要素のクリックイベントを検知して HighlightActionPopup を開く（6.1）
  - HighlightActionPopup の `onMemoUpdated(id, newMemo)` コールバックで対応する `<mark>` 要素の `data-memo` 属性を更新する（6.3）
  - HighlightActionPopup の `onHighlightDeleted(id)` コールバックで対応する `<mark>` 要素を DOM から除去する（6.4）
  - ハイライトクリックでポップアップが開き、編集保存後にツールチップ内容が即座に反映され、削除後にハイライトが消去される
  - _Requirements: 6.1, 6.3, 6.4_
  - _Boundary: Content Script Domain_
  - _Depends: 14.1, 14.4_

- [ ] 15.2 編集・削除の全体フローを接続して動作確認する
  - Content Script エントリポイントに `HighlightActionPopup` のインスタンスを作成・初期化する
  - 完全なフローを確認：ハイライトクリック → VIEW ポップアップ → 「メモを編集」 → EDIT ステート → 保存 → `updateMemo` → MessageHandler → SupabaseWriter → Supabase UPDATE → `<mark>` の `data-memo` 更新
  - 完全なフローを確認：ハイライトクリック → VIEW ポップアップ → 「ハイライトを削除」 → 削除確認 → `deleteHighlight` → MessageHandler → SupabaseWriter → Supabase DELETE → `<mark>` 要素除去
  - memo ありの保存済みテキストを含むページで、編集・削除の全フローが正常に機能する
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_
  - _Depends: 15.1, 14.5_

## 16. R6メモ編集・削除機能検証

- [ ]* 16.1 R6メモ編集・削除機能のユニットテスト
  - HighlightActionPopup: `show()` 呼び出しで VIEW ステートのポップアップが DOM に挿入されること
  - HighlightActionPopup: 「メモを編集」クリックで EDIT ステート（textarea に既存メモ入力済み）に遷移すること（6.2）
  - HighlightActionPopup: EDIT 状態で「保存」押下時に `updateMemo` メッセージが送信されること（6.3）
  - HighlightActionPopup: 「ハイライトを削除」押下で削除確認が表示され、確定後 `deleteHighlight` が送信されること（6.4）
  - HighlightActionPopup: 更新・削除失敗時にエラーメッセージが表示されポップアップが維持されること（6.5）
  - HighlightActionPopup: キャンセル・外部クリックで `updateMemo`/`deleteHighlight` が送信されないこと（6.6）
  - HighlightController: `<mark>` 要素に `data-record-id` が設定されること（6.1）
  - HighlightController: `<mark>` クリックで `HighlightActionPopup.show()` が呼ばれること（6.1）
  - HighlightController: `onMemoUpdated` コールバックで `data-memo` 属性が更新されること（6.3）
  - HighlightController: `onHighlightDeleted` コールバックで `<mark>` 要素が DOM から除去されること（6.4）
  - SupabaseWriter: `updateMemo()` が成功時に `UpdateResult.success = true` を返すこと（6.3）
  - SupabaseWriter: `deleteRecord()` が成功時に `DeleteResult.success = true` を返すこと（6.4）
  - SupabaseReader: `id` フィールドを含む `SavedHighlight[]` が返却されること（6.1）
  - 全コンポーネントが外部依存のモッキングで分離されたユニットテストに合格
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

- [ ]* 16.2 R6メモ編集・削除機能のエンドツーエンドテスト
  - ハイライトクリック → 「メモを編集」 → memo 変更 → 保存 → Supabase UPDATE 確認 → ツールチップ内容更新確認（6.3）
  - ハイライトクリック → 「ハイライトを削除」 → 削除確認 → 削除 → Supabase DELETE 確認 → `<mark>` 要素消去確認（6.4）
  - 更新失敗シナリオ → エラーメッセージ表示・メモ内容が変更前のままであることを確認（6.5）
  - 削除失敗シナリオ → エラーメッセージ表示・ハイライトが維持されることを確認（6.5）
  - キャンセル操作 → Supabase に変更が加えられていないことを確認（6.6）
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

## 実装メモ

- 基盤タスクはTypeScriptビルド環境とChrome拡張機能構造を確立
- コアタスクはManifest V3パターンに従ってドメイン分離されたコンポーネントを実装
- 統合タスクは適切なメッセージフローを確保してコンポーネントを配線
- (P)マークのタスクは主要タスクグループ内で並行実行可能
- *マークのタスクはMVP後に延期可能なオプションのテストカバレッジ
- タスク1〜4はRequirement 1-3（テキスト選択・保存・認証情報管理）をカバーし完了済み
- タスク5〜8はRequirement 4（保存済みテキストのハイライト表示）の新規実装が完了済み
- タスク9〜12はRequirement 5（選択テキストへのメモ追加）の新規実装が完了済み
- タスク13〜16はRequirement 1.1（ラベル更新）とRequirement 6（メモ編集・削除）の新規実装
- メモ編集・削除機能追加により Supabase の `readings` テーブルに UPDATE・DELETE の RLS ポリシーが必要（既存ユーザーは `CREATE POLICY readings_anon_update ON readings FOR UPDATE USING (true); CREATE POLICY readings_anon_delete ON readings FOR DELETE USING (true);` を実行）
- タスク13.1 の型変更（`SavedHighlight` に `id` 追加）はブレイキングチェンジ。タスク14.3 と 14.4 が同時に更新されるため並列実装時は同一PR/ブランチで対応
- HighlightActionPopup は VIEW/EDIT の 2 ステートを 1 コンポーネントで管理（MemoInputUI と同じ Shadow DOM パターン）
