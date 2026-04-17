# Research and Discovery Log

## Discovery Scope
ブラウザ拡張機能（Chrome extension）によるテキスト選択キャプチャ機能の技術基盤調査。chrome.storage、chrome.contextMenus、Supabase JavaScript クライアントを中心に調査。

## Key Findings

### 1. Chrome Extension Architecture (Manifest V3)
**Selected Pattern**: Content Script + Service Worker（背景スクリプト）の分離型アーキテクチャ

**Rationale**:
- Content Scripts は DOM 操作可能だがセキュリティ制限あり（拡張機能 API の大部分は未対応）
- Service Workers は拡張機能 API に完全アクセス可能
- 責任分離により、セキュリティ境界を明確に

**Key Decisions**:
- テキスト選択検知は Content Script（`window.getSelection().toString()`）で実行
- コンテキストメニュー追加は Service Worker で実行（`chrome.contextMenus.create()`）
- Content Script ↔ Service Worker 通信は `chrome.runtime.sendMessage()` で実装
- API キー（Supabase 認証情報）は、Options Page（拡張機能設定画面）から入力したら Service Worker の `chrome.storage.local` に保存

**Existing Patterns Preserved**: None（新規機能のため）

### 2. Text Selection & Context Menu APIs
**Selection Capture**:
- `window.getSelection().toString()` で選択テキスト取得（Content Script で実行）
- ページの URL は `window.location.href` で取得

**Context Menu Integration**:
- manifest.json に `"contextMenus"` 権限を宣言
- Service Worker で `chrome.contextMenus.create()` でメニュー項目追加
- User が右クリックメニューから「Save to Supabase」を選択 → Service Worker が Content Script に通信
- Content Script は現在の選択テキスト・URL を Service Worker に返却
- Service Worker が Supabase に書き込み

### 3. Storage & Authentication Information Management
**Decision**: `chrome.storage.local` を使用（10 MB 容量確保可）

**Rationale**:
- `storage.sync` は容量不足（100 KB/item）
- `storage.session` はランタイム専用（ブラウザ再起動時にクリア）
- 設定情報（Supabase URL + API key）は永続化必要

**Security Best Practice**:
- Supabase anon key はクライアント側に埋め込み可能（Row Level Security で保護）
- ただし、ユーザーが自身の Supabase プロジェクトを指定する場合、anon key をストレージに保存してよい
- ストレージ内のディレイなし、機密操作は Service Worker で実行

### 4. Supabase Client Integration
**Library**: `@supabase/supabase-js` (v2.39+)

**Key API Contract**:
```javascript
const { data, error } = await supabase
  .from('table_name')
  .insert([{ url: string, selected_text: string, created_at: timestamp }])
  .select()
```

**Idempotency**: Supabase insert() はデフォルトで unique constraint 違反時にエラー。重複送信対策は必要に応じてクライアント側で実装（e.g., 送信中フラグ、ローカル queue）。

**CORS & CSP Compliance**:
- Content Script から直接 fetch() 可能（Manifest V3 では特別な許可不要）
- Supabase は CORS ヘッダ対応済み
- Service Worker での fetch() も同様に動作

### 5. Architecture Pattern and Boundaries
**Pattern Selected**: 
- 背景スクリプト中心のサービスパターン
- Content Script はイベント通知と UI 操作のみ
- ビジネスロジック（Supabase 接続・書き込み）は Service Worker で一元管理

**Domain Boundaries**:
- **Content Script Domain**: ページコンテキスト内での選択テキスト取得・監視
- **Service Worker Domain**: 拡張機能 API、Supabase クライアント、ストレージ管理
- **Options Page Domain**: User 設定（Supabase 認証情報）の入力・保存

### 6. Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| API キーが拡張機能コードに含まれる | ユーザーが Supabase 側で anon key 権限を厳格に制限。テーブルへの INSERT のみ許可 |
| Network 遅延時の重複送信 | UI に保存中フラグを表示。再試行ロジック実装 |
| Service Worker のアイドルアンロード | 長時間の待機は offscreen document で対応（Manifest V3 best practice） |
| Options Page での認証情報入力ミス | Connection test 機能（疎通確認）実装で検證 |

## Architecture Decision Records

1. **Why Service Worker + Content Script?**
   - Content Script は DOM アクセス専用。拡張機能 API は Service Worker で一元化
   - Security: 機密データ（API key）を背景スクリプトに集中
   
2. **Why chrome.storage.local over sync?**
   - 受信元テーブル（Supabase）は User-specific → 設定情報は device-specific で十分
   - 容量制限なし

3. **Why Supabase anon key in storage OK?**
   - Anon key は公開前提。Row Level Security （RLS）で読み書き制限
   - ユーザーが自身のプロジェクトを指定する場合、anon key をストレージに保存してよい

## Technology Stack Selection

| Layer | Choice | Version | Rationale |
|-------|--------|---------|-----------|
| Extension Framework | Chrome Extensions (Manifest V3) | Latest | 最新セキュリティ標準、広範なブラウザ対応 |
| JavaScript Runtime | Node.js (build)/ Browser (runtime) | ES2020+ | Modern JavaScript 機能、async/await |
| Supabase Client | @supabase/supabase-js | 2.39+ | 公式ライブラリ、型安全（TypeScript） |
| Storage | Chrome Storage API | Built-in | ナティブ API、セキュアなスコープ隔離 |
| Build Tool | webpack / Parcel | Latest | Manifest V3 対応、モジュール管理 |

## Outstanding Questions & Gaps

1. **Table Schema**: Supabase 側のテーブル構造("readings" table)は本仕様では定義しない。ユーザーが別途作成。Design では required columns を明記。
2. **Error Notification**: 保存失敗時のユーザー通知方法（Toast, Badge, Popup）は Design phase で確定。
3. **Batch Handling**: 複数テキスト連続選択時のバッチ送信か都度送信か → 都度送信が自然だが、future optimization として記録。

---

## Design Synthesis (Requirement 5 追加: メモ機能)

### Architecture Decision: MemoInputUI を Content Script に配置
- メモ入力ダイアログはDOM操作（オーバーレイ表示）が必要なため Content Script に追加
- ContextMenuHandler（SW）→ `chrome.tabs.sendMessage` → MemoInputUI（CS）→ `saveSelection` → MessageHandler（SW）の2段階フローを採用
- これにより認証情報は引き続き SW のみが保持し、CS に漏洩しない

### Interface Break: HighlightsResponse の変更
- `texts?: string[]` → `highlights?: SavedHighlight[]`（`{ text: string; memo?: string }`）
- SupabaseReader と HighlightController 間の共有型変更。両コンポーネントの同期更新が必要
- Revalidation Triggers に `SavedHighlight` 型変更を追記

### Data Model: memo カラム追加
- `memo TEXT NULL` — 任意フィールドとして NULL 許容
- 既存ユーザーは `ALTER TABLE readings ADD COLUMN memo TEXT;` が必要
- 設計ドキュメントにマイグレーション手順を明記

### XSS 対策: memo のレンダリング
- ツールチップ表示は `element.textContent` のみ使用（innerHTML 不使用）
- `data-memo` 属性は `setAttribute` で設定

## Design Synthesis (Requirement 4 追加)

### Generalization
- SupabaseWriter（INSERT専用）に対し、SupabaseReader（SELECT専用）を新設することで責任分離を維持。
  将来の読み取り操作（検索・フィルタ等）はすべて SupabaseReader に集約できるインターフェース設計。

### Build vs Adopt
- ハイライト DOM 操作: TreeWalker + Range によるブラウザネイティブ実装を採用。
  mark.js 等の外部ライブラリは不要（シンプルなユースケースにはオーバーエンジニアリング）。
- HighlightController は Content Script に追加（DOM操作はページコンテキスト必須）。

### Simplification
- ハイライトのキャッシュは不要（ページロード毎の取得で十分）。
- HighlightController はページロード時の1回実行のみ（監視・動的更新機構は将来スコープ）。
- CSS は固定スタイルとしてハードコード（ユーザーカスタマイズは Out of Boundary）。

### Key Architecture Decision: RLS SELECT ポリシー必要
- 要件4（ハイライト取得）の追加により、Supabase の anon role に SELECT 権限が必要。
- これはユーザーが RLS ポリシーを更新する必要があることを意味し、設計ドキュメントに明記した。
