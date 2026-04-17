# XRift GUI Tool

`guitool.md` の要件に沿って、XRift の初期セットアップからアップロードまでを GUI で実行する Electron ツールです。

## セットアップ

```bash
cd xrift-gui
npm install
```

## 開発起動

```bash
npm run dev
```

または Electron 専用:

```bash
npm run dev:electron
```

## ビルド

```bash
npm run build
```

## 実装済みフロー

1. 前提チェック (`node -v`, `npm -v`, `xrift --version`)
2. xrift CLI インストール (`npm install -g @xrift/cli`)
3. ワールド作成 (`xrift create world <name> --no-interactive`)
4. ローカル実行 (`npm run dev` の開始 / 停止)
5. `xrift.json` の `world.title`, `world.description` 更新
6. ログイン (`xrift login`, `xrift whoami`)
7. アップロード (`xrift upload`)

## 主要ファイル

- `electron/main.ts`: Electron メインプロセスと IPC ハンドラ
- `electron/preload.cjs`: Renderer に公開する安全な API
- `src/App.tsx`: GUI ウィザードとログビュー
