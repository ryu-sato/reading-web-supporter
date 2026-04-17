/**
 * dist/ ビルド出力検証テスト
 * タスク 1.4: 拡張機能バンドルを構築しChrome読み込みを確認
 *
 * このテストはビルド出力が正しくdist/ディレクトリに生成されることを検証します。
 * テスト実行前に `npm run build` を実行してdist/を生成してください。
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

describe('dist/ ビルド出力検証', () => {
  describe('必須バンドルファイルの存在確認', () => {
    test('content script バンドル (dist/content/index.js) が存在する (Task 7.2)', () => {
      expect(fs.existsSync(path.join(DIST, 'content', 'index.js'))).toBe(true);
    });

    test('service worker バンドル (dist/service-worker/background.js) が存在する', () => {
      expect(fs.existsSync(path.join(DIST, 'service-worker', 'background.js'))).toBe(true);
    });

    test('options スクリプトバンドル (dist/options/options.js) が存在する', () => {
      expect(fs.existsSync(path.join(DIST, 'options', 'options.js'))).toBe(true);
    });
  });

  describe('manifest.json の dist/ へのコピー確認', () => {
    test('dist/manifest.json が存在する', () => {
      expect(fs.existsSync(path.join(DIST, 'manifest.json'))).toBe(true);
    });

    test('dist/manifest.json が有効な JSON である', () => {
      const content = fs.readFileSync(path.join(DIST, 'manifest.json'), 'utf-8');
      expect(() => JSON.parse(content)).not.toThrow();
    });

    test('dist/manifest.json の manifest_version が 3 である', () => {
      const content = fs.readFileSync(path.join(DIST, 'manifest.json'), 'utf-8');
      const manifest = JSON.parse(content);
      expect(manifest.manifest_version).toBe(3);
    });
  });

  describe('アイコンの dist/ へのコピー確認', () => {
    test('dist/icons/icon-16.png が存在する', () => {
      expect(fs.existsSync(path.join(DIST, 'icons', 'icon-16.png'))).toBe(true);
    });

    test('dist/icons/icon-48.png が存在する', () => {
      expect(fs.existsSync(path.join(DIST, 'icons', 'icon-48.png'))).toBe(true);
    });

    test('dist/icons/icon-128.png が存在する', () => {
      expect(fs.existsSync(path.join(DIST, 'icons', 'icon-128.png'))).toBe(true);
    });
  });

  describe('options.html の dist/ へのコピー確認', () => {
    test('dist/options/options.html が存在する', () => {
      expect(fs.existsSync(path.join(DIST, 'options', 'options.html'))).toBe(true);
    });

    test('dist/options/options.html が有効な HTML である（html タグを含む）', () => {
      const content = fs.readFileSync(path.join(DIST, 'options', 'options.html'), 'utf-8');
      expect(content.toLowerCase()).toMatch(/<html/);
    });
  });

  describe('ソースマップの生成確認', () => {
    test('content script のソースマップ (dist/content/index.js.map) が存在する (Task 7.2)', () => {
      expect(fs.existsSync(path.join(DIST, 'content', 'index.js.map'))).toBe(true);
    });

    test('service worker のソースマップ (dist/service-worker/background.js.map) が存在する', () => {
      expect(fs.existsSync(path.join(DIST, 'service-worker', 'background.js.map'))).toBe(true);
    });

    test('options スクリプトのソースマップ (dist/options/options.js.map) が存在する', () => {
      expect(fs.existsSync(path.join(DIST, 'options', 'options.js.map'))).toBe(true);
    });

    test('content script の JS に sourceMappingURL コメントが含まれる (Task 7.2)', () => {
      const content = fs.readFileSync(
        path.join(DIST, 'content', 'index.js'),
        'utf-8'
      );
      expect(content).toMatch(/\/\/# sourceMappingURL=/);
    });

    test('service worker の JS に sourceMappingURL コメントが含まれる', () => {
      const content = fs.readFileSync(
        path.join(DIST, 'service-worker', 'background.js'),
        'utf-8'
      );
      expect(content).toMatch(/\/\/# sourceMappingURL=/);
    });
  });

  describe('webpack.config.js のソースマップ設定確認', () => {
    test('webpack.config.js に source-map devtool が設定されている', () => {
      const content = fs.readFileSync(path.join(ROOT, 'webpack.config.js'), 'utf-8');
      expect(content).toMatch(/devtool:\s*['"]source-map['"]/);
    });

    test('webpack.config.js にコードスプリッティング無効化設定が含まれる（Service Worker互換）', () => {
      const content = fs.readFileSync(path.join(ROOT, 'webpack.config.js'), 'utf-8');
      expect(content).toMatch(/splitChunks:\s*false/);
    });

    test('webpack.config.js に runtimeChunk 無効化設定が含まれる（Service Worker互換）', () => {
      const content = fs.readFileSync(path.join(ROOT, 'webpack.config.js'), 'utf-8');
      expect(content).toMatch(/runtimeChunk:\s*false/);
    });
  });

  describe('package.json のビルドスクリプト確認', () => {
    let pkg: Record<string, unknown>;

    beforeEach(() => {
      const content = fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8');
      pkg = JSON.parse(content);
    });

    test('build スクリプトが webpack を使用している', () => {
      const scripts = pkg['scripts'] as Record<string, string>;
      expect(scripts['build']).toMatch(/webpack/);
    });

    test('build:dev スクリプトが定義されている', () => {
      const scripts = pkg['scripts'] as Record<string, string>;
      expect(scripts['build:dev']).toBeDefined();
    });

    test('build:dev スクリプトが development モードを指定している', () => {
      const scripts = pkg['scripts'] as Record<string, string>;
      expect(scripts['build:dev']).toMatch(/development/);
    });
  });
});
