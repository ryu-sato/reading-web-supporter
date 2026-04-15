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

- [ ] 3.3 オプションページと設定管理を統合
  - chrome.runtime.messagingを介したSettingsManager APIへのオプションページフォーム送信を接続
  - リアルタイム検証フィードバックと成功/エラー表示を含む接続テストを追加
  - 認証情報の永続化と拡張機能全体での設定変更の即座の反映をセットアップ
  - オプションページがライブ接続検証を含む完全な設定管理を提供
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [ ] 3.4 エンドツーエンド拡張機能機能を確認
  - Chromeに拡張機能を手動でインストールし、完全なユーザーワークフローをテスト
  - 検証：テキスト選択 → コンテキストメニュー表示 → 保存クリック → 成功通知 → Supabaseのデータ
  - オプションページをテスト：認証情報入力 → 接続テスト → 設定保存 → 設定永続化
  - 完全な拡張機能がインストールからデータストレージまで正常に機能
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4, 3.5_

## 4. 検証

- [ ] 4.1* 個別コンポーネントのユニットテスト
  - モックされたDOMイベントでTextSelector選択検知とデバウンス動作をテスト
  - モックされたSupabaseクライアントでSupabaseWriter保存操作とエラー処理をテスト
  - モックされたChrome storage APIでSettingsManager CRUD操作と検証をテスト
  - モックされたChrome APIでContextMenuHandlerメニュー作成とクリックイベント処理をテスト
  - すべてのコンポーネントが外部依存関係の適切なモッキングで分離されたユニットテストに合格
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4, 3.5_

- [ ] 4.2* エンドツーエンドテストシナリオ
  - 完全なフローをテスト：テキスト選択 → コンテキストメニュー → 保存 → Supabaseデータベース検証
  - 設定構成をテスト：認証情報入力 → 接続テスト → 永続化検証
  - エラーシナリオをテスト：ネットワーク障害、無効な認証情報、空のテキスト選択処理
  - テキスト選択から成功したデータベースストレージまで完全なユーザーワークフローが正常に機能
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4, 3.5_

## 実装メモ

- 基盤タスクはTypeScriptビルド環境とChrome拡張機能構造を確立
- コアタスクはManifest V3パターンに従ってドメイン分離されたコンポーネントを実装
- 統合タスクは適切なメッセージフローを確保してコンポーネントを配線
- (P)マークのタスクは主要タスクグループ内で並行実行可能
- *マークのタスクはMVP後に延期可能なオプションのテストカバレッジ