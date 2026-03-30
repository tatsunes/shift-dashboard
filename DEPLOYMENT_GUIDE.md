# シフト管理ツール - デプロイ手順書

このドキュメントは、シフト管理ツール（エリア全体シフト）のGitHubへのプッシュとGitHub Pagesへのデプロイ手順をまとめたものです。

## 📋 目次
1. [プロジェクト概要](#プロジェクト概要)
2. [リポジトリ情報](#リポジトリ情報)
3. [デプロイフロー](#デプロイフロー)
4. [Git操作手順](#git操作手順)
5. [GitHub Pages設定](#github-pages設定)
6. [重要な設定ファイル](#重要な設定ファイル)
7. [トラブルシューティング](#トラブルシューティング)

---

## プロジェクト概要

**プロジェクト名**: エリア全体シフト  
**用途**: 複数院のシフト人員バランス管理ツール  
**技術スタック**: HTML/CSS/JavaScript (Vanilla JS)  
**デプロイ先**: GitHub Pages  
**公開URL**: https://tatsunes.github.io/shift-dashboard/

---

## リポジトリ情報

- **GitHubリポジトリ**: `https://github.com/tatsunes/shift-dashboard.git`
- **メインブランチ**: `main`
- **ローカルパス**: `d:\Python-Automation\shift`

---

## デプロイフロー

```
コード変更
    ↓
git add -A
    ↓
git commit -m "変更内容"
    ↓
git push origin main
    ↓
GitHub Actions自動実行
    ↓
GitHub Pagesへデプロイ（1-2分）
    ↓
https://tatsunes.github.io/shift-dashboard/ に反映
```

---

## Git操作手順

### 基本的なプッシュ手順

```powershell
# 1. 作業ディレクトリに移動
cd d:\Python-Automation\shift

# 2. 変更ファイルをステージング
git add -A

# 3. コミット（変更内容を簡潔に記述）
git commit -m "変更内容の説明"

# 4. GitHubにプッシュ
git push origin main
```

### よく使うコミットメッセージ例

```bash
# 機能追加
git commit -m "Add new feature: スタッフ固定順表示"

# バグ修正
git commit -m "Fix staff order sorting issue"

# スタイル変更
git commit -m "Update pastel colors for 4-level status"

# 設定変更
git commit -m "Update default clinic order and reception staff"

# PWA対応
git commit -m "Add PWA support: manifest.json, Service Worker"
```

### 変更確認コマンド

```powershell
# 変更されたファイル一覧
git status

# 変更内容の詳細
git diff

# コミット履歴
git log --oneline -10
```

---

## GitHub Pages設定

### 初回設定（既に完了済み）

1. GitHubリポジトリページ: https://github.com/tatsunes/shift-dashboard
2. **Settings** → **Pages**
3. **Source**: `GitHub Actions` を選択
4. リポジトリを **Public** に設定

### デプロイワークフロー

`.github/workflows/deploy.yml` が自動デプロイを制御しています。

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pages: write
      id-token: write
    steps:
      - uses: actions/checkout@v3
      - name: Setup Pages
        uses: actions/configure-pages@v3
      - name: Upload artifact
        uses: actions/upload-pages-artifact@v2
        with:
          path: '.'
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v2
```

**重要**: `main` ブランチにプッシュすると自動的にデプロイが開始されます。

---

## 重要な設定ファイル

### 1. `config.js`
- デフォルト設定（院リスト、除外スタッフ、基本人数）
- Google OAuth Client ID（公開情報）
- **CONFIG_VERSION**: デフォルト設定変更時はバージョンを上げる

```javascript
const CONFIG_VERSION = '3'; // ← 変更時はインクリメント
```

### 2. `.gitignore`
- `.env` ファイル（APIキーなど機密情報）
- `.venv/` (Python仮想環境)
- `__pycache__/`
- その他の機密ファイル

**重要**: APIキーなどの機密情報は絶対にコミットしない

### 3. `manifest.json` (PWA設定)
- アプリ名: "エリア全体シフト"
- テーマカラー: `#4a90d9`
- アイコン: `icons/icon-192.svg`, `icons/icon-512.svg`

### 4. `sw.js` (Service Worker)
- キャッシュ管理
- オフライン対応
- Google API通信はバイパス

---

## トラブルシューティング

### デプロイが反映されない

1. **GitHub Actionsの確認**
   - https://github.com/tatsunes/shift-dashboard/actions
   - ワークフローが緑色（成功）か確認
   - エラーがある場合はログを確認

2. **ブラウザキャッシュのクリア**
   ```
   Ctrl + Shift + R (Windows/Linux)
   Cmd + Shift + R (Mac)
   ```

3. **Service Workerのリセット**
   - Chrome DevTools → Application → Service Workers → Unregister
   - ページをリロード

### プッシュエラー

```powershell
# リモートの最新を取得してマージ
git pull origin main

# コンフリクトがある場合は解決後
git add -A
git commit -m "Merge conflict resolution"
git push origin main
```

### 認証エラー

```powershell
# GitHub Personal Access Token を使用
# Settings → Developer settings → Personal access tokens
# repo権限を付与したトークンを生成
```

---

## デプロイ前チェックリスト

- [ ] `.env` ファイルがコミットされていないか確認
- [ ] APIキーがハードコードされていないか確認
- [ ] `git status` で意図しないファイルが含まれていないか確認
- [ ] コミットメッセージが変更内容を適切に説明しているか
- [ ] ローカルでテスト済みか（localhost:8000など）

---

## よくある変更パターン

### 1. デフォルト設定の変更（院リスト、除外スタッフ）

```javascript
// config.js
const CONFIG_VERSION = '4'; // バージョンアップ

const DEFAULT_CLINICS = [
  { name: '関屋', baseline: 4 },
  // ...
];

const DEFAULT_RECEPTION_STAFF = [
  { clinic: '亀田', name: '伊藤' },
  // ...
];
```

```powershell
git add config.js
git commit -m "Update default clinic settings"
git push origin main
```

### 2. スタイル変更

```css
/* styles.css */
.status-ok {
  background-color: #a8d8a8;
  color: #2d5a2d;
}
```

```powershell
git add styles.css
git commit -m "Update status color scheme"
git push origin main
```

### 3. 機能追加

```javascript
// app.js に新機能追加
```

```powershell
git add app.js
git commit -m "Add new feature: [機能名]"
git push origin main
```

---

## 連絡先・参考情報

- **リポジトリ**: https://github.com/tatsunes/shift-dashboard
- **公開URL**: https://tatsunes.github.io/shift-dashboard/
- **Google Cloud Console**: https://console.cloud.google.com/
  - OAuth設定、API Key管理

---

## 補足: Claude Codeでの作業フロー

Claude Codeで作業する際の推奨フロー:

1. **変更内容の確認**
   ```
   変更したファイルを確認
   ```

2. **コミット＆プッシュ**
   ```powershell
   cd d:\Python-Automation\shift
   git add -A
   git commit -m "変更内容"
   git push origin main
   ```

3. **デプロイ確認**
   - 1-2分待機
   - https://tatsunes.github.io/shift-dashboard/ にアクセス
   - Ctrl + Shift + R でハードリロード

4. **問題があれば**
   - GitHub Actions ログ確認
   - ブラウザコンソールでエラー確認
   - 必要に応じて修正してプッシュ

---

**最終更新**: 2026年3月30日
