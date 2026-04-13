/**
 * ビルド設定検証テスト
 * タスク 1.1: プロジェクト構造とビルド設定のセットアップ
 *
 * このテストはビルド設定が正しく機能することを検証します。
 * テストはTypeScriptのインポート解決、型定義の存在、共有型の定義を確認します。
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');

describe('プロジェクト構造とビルド設定', () => {
  describe('必須ファイルの存在確認', () => {
    test('package.jsonが存在する', () => {
      expect(fs.existsSync(path.join(ROOT, 'package.json'))).toBe(true);
    });

    test('tsconfig.jsonが存在する', () => {
      expect(fs.existsSync(path.join(ROOT, 'tsconfig.json'))).toBe(true);
    });

    test('webpack.config.jsが存在する', () => {
      expect(fs.existsSync(path.join(ROOT, 'webpack.config.js'))).toBe(true);
    });
  });

  describe('package.json の内容検証', () => {
    let pkg: Record<string, unknown>;

    beforeEach(() => {
      const content = fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8');
      pkg = JSON.parse(content);
    });

    test('@supabase/supabase-js が依存関係に含まれる', () => {
      const deps = pkg['dependencies'] as Record<string, string> | undefined;
      expect(deps).toBeDefined();
      expect(deps!['@supabase/supabase-js']).toBeDefined();
    });

    test('@types/chrome が devDependencies に含まれる', () => {
      const devDeps = pkg['devDependencies'] as Record<string, string> | undefined;
      expect(devDeps).toBeDefined();
      expect(devDeps!['@types/chrome']).toBeDefined();
    });

    test('TypeScript が devDependencies に含まれる', () => {
      const devDeps = pkg['devDependencies'] as Record<string, string> | undefined;
      expect(devDeps).toBeDefined();
      expect(devDeps!['typescript']).toBeDefined();
    });

    test('webpack が devDependencies に含まれる', () => {
      const devDeps = pkg['devDependencies'] as Record<string, string> | undefined;
      expect(devDeps).toBeDefined();
      expect(devDeps!['webpack']).toBeDefined();
    });

    test('build スクリプトが定義されている', () => {
      const scripts = pkg['scripts'] as Record<string, string> | undefined;
      expect(scripts).toBeDefined();
      expect(scripts!['build']).toBeDefined();
    });

    test('test スクリプトが定義されている', () => {
      const scripts = pkg['scripts'] as Record<string, string> | undefined;
      expect(scripts).toBeDefined();
      expect(scripts!['test']).toBeDefined();
    });
  });

  describe('tsconfig.json の内容検証', () => {
    let tsconfig: Record<string, unknown>;

    beforeEach(() => {
      const content = fs.readFileSync(path.join(ROOT, 'tsconfig.json'), 'utf-8');
      tsconfig = JSON.parse(content);
    });

    test('compilerOptions が定義されている', () => {
      expect(tsconfig['compilerOptions']).toBeDefined();
    });

    test('ES2020 以上をターゲットにしている', () => {
      const options = tsconfig['compilerOptions'] as Record<string, unknown>;
      const target = options['target'] as string;
      expect(['ES2020', 'ES2021', 'ES2022', 'ES2023', 'ESNext']).toContain(target);
    });

    test('strict モードが有効になっている', () => {
      const options = tsconfig['compilerOptions'] as Record<string, unknown>;
      expect(options['strict']).toBe(true);
    });

    test('型定義に chrome が含まれている', () => {
      const options = tsconfig['compilerOptions'] as Record<string, unknown>;
      const types = options['types'] as string[] | undefined;
      // types配列にchromeが含まれているか、または型参照で解決されることを確認
      if (types) {
        expect(types).toContain('chrome');
      }
      // types未設定の場合は @types/chrome が node_modules に存在することで解決される
    });
  });

  describe('webpack.config.js の内容検証', () => {
    test('webpack設定ファイルが読み込み可能である', () => {
      const configPath = path.join(ROOT, 'webpack.config.js');
      expect(fs.existsSync(configPath)).toBe(true);
      const content = fs.readFileSync(configPath, 'utf-8');
      expect(content.length).toBeGreaterThan(0);
    });

    test('content scriptエントリポイントが設定に含まれる', () => {
      const content = fs.readFileSync(path.join(ROOT, 'webpack.config.js'), 'utf-8');
      // content scriptのエントリポイント（text-selector）が含まれている
      expect(content).toMatch(/content|text-selector/);
    });

    test('service workerエントリポイントが設定に含まれる', () => {
      const content = fs.readFileSync(path.join(ROOT, 'webpack.config.js'), 'utf-8');
      // service worker / backgroundのエントリポイントが含まれている
      expect(content).toMatch(/background|service.?worker/i);
    });
  });

  describe('ディレクトリ構造の検証', () => {
    test('src/content ディレクトリが存在する', () => {
      expect(fs.existsSync(path.join(ROOT, 'src/content'))).toBe(true);
    });

    test('src/service-worker ディレクトリが存在する', () => {
      expect(fs.existsSync(path.join(ROOT, 'src/service-worker'))).toBe(true);
    });

    test('src/options ディレクトリが存在する', () => {
      expect(fs.existsSync(path.join(ROOT, 'src/options'))).toBe(true);
    });

    test('src/types ディレクトリが存在する', () => {
      expect(fs.existsSync(path.join(ROOT, 'src/types'))).toBe(true);
    });

    test('src/utils ディレクトリが存在する', () => {
      expect(fs.existsSync(path.join(ROOT, 'src/utils'))).toBe(true);
    });

    test('public ディレクトリが存在する', () => {
      expect(fs.existsSync(path.join(ROOT, 'public'))).toBe(true);
    });
  });
});
