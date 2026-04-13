/**
 * マニフェスト検証テスト
 * タスク 1.2: Chrome拡張機能マニフェストとディレクトリ構造を作成
 *
 * このテストはmanifest.jsonが正しいManifest V3構造を持ち、
 * アイコンファイルが存在することを検証します。
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');

interface ManifestV3 {
  manifest_version: number;
  name: string;
  version: string;
  description?: string;
  permissions?: string[];
  host_permissions?: string[];
  background?: {
    service_worker: string;
    type?: string;
  };
  content_scripts?: Array<{
    matches: string[];
    js: string[];
    run_at?: string;
  }>;
  options_ui?: {
    page: string;
    open_in_tab?: boolean;
  };
  options_page?: string;
  icons?: Record<string, string>;
  action?: Record<string, unknown>;
}

describe('Manifest V3 検証', () => {
  let manifest: ManifestV3;

  beforeEach(() => {
    const content = fs.readFileSync(path.join(PUBLIC, 'manifest.json'), 'utf-8');
    manifest = JSON.parse(content) as ManifestV3;
  });

  describe('基本構造', () => {
    test('manifest_version が 3 である', () => {
      expect(manifest.manifest_version).toBe(3);
    });

    test('name が設定されている', () => {
      expect(manifest.name).toBeDefined();
      expect(manifest.name.length).toBeGreaterThan(0);
    });

    test('version が設定されている', () => {
      expect(manifest.version).toBeDefined();
      expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  describe('content_scripts 宣言', () => {
    test('content_scripts が定義されている', () => {
      expect(manifest.content_scripts).toBeDefined();
      expect(Array.isArray(manifest.content_scripts)).toBe(true);
      expect(manifest.content_scripts!.length).toBeGreaterThan(0);
    });

    test('content_script が <all_urls> にマッチする', () => {
      const hasAllUrls = manifest.content_scripts!.some(
        (cs) => cs.matches.includes('<all_urls>')
      );
      expect(hasAllUrls).toBe(true);
    });

    test('content_script に JS ファイルが設定されている', () => {
      const hasJs = manifest.content_scripts!.some(
        (cs) => cs.js && cs.js.length > 0
      );
      expect(hasJs).toBe(true);
    });
  });

  describe('service_worker 宣言', () => {
    test('background.service_worker が定義されている', () => {
      expect(manifest.background).toBeDefined();
      expect(manifest.background!.service_worker).toBeDefined();
      expect(manifest.background!.service_worker.length).toBeGreaterThan(0);
    });

    test('service_worker のパスが background.js を参照している', () => {
      expect(manifest.background!.service_worker).toMatch(/background\.js$/);
    });
  });

  describe('options_page または options_ui 宣言', () => {
    test('options_ui または options_page が定義されている', () => {
      const hasOptions = manifest.options_ui !== undefined || manifest.options_page !== undefined;
      expect(hasOptions).toBe(true);
    });

    test('options ページが options.html を参照している', () => {
      const optionsPage = manifest.options_ui?.page ?? manifest.options_page ?? '';
      expect(optionsPage).toMatch(/options\.html$/);
    });
  });

  describe('permissions', () => {
    test('permissions が定義されている', () => {
      expect(manifest.permissions).toBeDefined();
      expect(Array.isArray(manifest.permissions)).toBe(true);
    });

    test('contextMenus パーミッションが含まれている', () => {
      expect(manifest.permissions).toContain('contextMenus');
    });

    test('storage パーミッションが含まれている', () => {
      expect(manifest.permissions).toContain('storage');
    });

    test('notifications パーミッションが含まれている', () => {
      expect(manifest.permissions).toContain('notifications');
    });
  });

  describe('アイコン設定', () => {
    test('icons が定義されている', () => {
      expect(manifest.icons).toBeDefined();
    });

    test('16px アイコンが設定されている', () => {
      expect(manifest.icons!['16']).toBeDefined();
    });

    test('48px アイコンが設定されている', () => {
      expect(manifest.icons!['48']).toBeDefined();
    });

    test('128px アイコンが設定されている', () => {
      expect(manifest.icons!['128']).toBeDefined();
    });
  });
});

describe('アイコンファイルの存在確認', () => {
  test('icons/icon-16.png が存在する', () => {
    const iconPath = path.join(PUBLIC, 'icons', 'icon-16.png');
    expect(fs.existsSync(iconPath)).toBe(true);
  });

  test('icons/icon-48.png が存在する', () => {
    const iconPath = path.join(PUBLIC, 'icons', 'icon-48.png');
    expect(fs.existsSync(iconPath)).toBe(true);
  });

  test('icons/icon-128.png が存在する', () => {
    const iconPath = path.join(PUBLIC, 'icons', 'icon-128.png');
    expect(fs.existsSync(iconPath)).toBe(true);
  });

  test('icon-16.png は有効なPNGファイルである', () => {
    const iconPath = path.join(PUBLIC, 'icons', 'icon-16.png');
    const buffer = fs.readFileSync(iconPath);
    // PNGマジックナンバー: 89 50 4E 47 0D 0A 1A 0A
    expect(buffer[0]).toBe(0x89);
    expect(buffer[1]).toBe(0x50); // P
    expect(buffer[2]).toBe(0x4E); // N
    expect(buffer[3]).toBe(0x47); // G
  });

  test('icon-48.png は有効なPNGファイルである', () => {
    const iconPath = path.join(PUBLIC, 'icons', 'icon-48.png');
    const buffer = fs.readFileSync(iconPath);
    expect(buffer[0]).toBe(0x89);
    expect(buffer[1]).toBe(0x50);
    expect(buffer[2]).toBe(0x4E);
    expect(buffer[3]).toBe(0x47);
  });

  test('icon-128.png は有効なPNGファイルである', () => {
    const iconPath = path.join(PUBLIC, 'icons', 'icon-128.png');
    const buffer = fs.readFileSync(iconPath);
    expect(buffer[0]).toBe(0x89);
    expect(buffer[1]).toBe(0x50);
    expect(buffer[2]).toBe(0x4E);
    expect(buffer[3]).toBe(0x47);
  });
});

describe('manifest.json の JSON 構文検証', () => {
  test('manifest.json が有効な JSON である', () => {
    const content = fs.readFileSync(path.join(PUBLIC, 'manifest.json'), 'utf-8');
    expect(() => JSON.parse(content)).not.toThrow();
  });
});
