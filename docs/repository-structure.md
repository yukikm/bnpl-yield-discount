# リポジトリ構造定義書 (Repository Structure Document)

## プロジェクト構造（MVP）

本リポジトリは、単一VM（EC2）で動く **Web + API + Keeper + Contracts** を1つにまとめる。
モノレポのパッケージ管理は **pnpm** を前提にする。

```text
bnpl-yield-discount/
├── AGENTS.md                      # プロジェクトメモリ（プロセス/ルール）
├── README.md                      # 立ち上げ手順（pnpm/forge/prisma/デモ動線）
├── .gitignore                     # .data/, node_modules, contracts/out 等
├── .env.example                   # 必須環境変数の雛形（秘密値は入れない）
├── package.json                   # monorepo root scripts / deps
├── pnpm-workspace.yaml            # pnpm workspace definition
├── pnpm-lock.yaml                 # lockfile
├── tsconfig.base.json             # shared tsconfig（apps/packagesからextends）
├── docs/                          # 永続ドキュメント（仕様の正）
│   ├── product-requirements.md
│   ├── functional-design.md
│   ├── architecture.md
│   ├── development-guidelines.md  # 開発ガイドライン
│   ├── glossary.md                # ユビキタス言語定義（用語集）
│   ├── repository-structure.md    # 本ドキュメント
│   └── ideas/                     # アイデア・初期要件（参考）
├── .steering/                     # 作業単位ドキュメント（YYYYMMDD-*)
├── apps/
│   ├── protocol-web/              # Next.js（Checkout + Consumer + Operator Dashboard + Protocol API）
│   ├── merchant-demo/             # Merchant側デモEC（プロトコル外。SDK導入例）
│   └── keeper/                    # Keeper Bot（Node.js常駐/ポーリング）
├── packages/
│   ├── merchant-sdk/              # Merchant向けTypeScript SDK（thin wrapper）
│   └── shared/                    # 共有型/定数/ABI（chainId, token addresses, typed data, ABIs等）
├── contracts/                     # Foundryプロジェクト（Solidity）
│   ├── src/
│   ├── test/
│   └── script/
├── prisma/                        # Prisma schema/migrations/seed
├── scripts/                       # 開発用スクリプト（ABI同期など）
├── ops/                           # EC2運用（systemd, nginx, デプロイ手順など）
└── .data/                         # SQLite DB（git管理しない）
```

## ディレクトリ詳細

### docs/（永続ドキュメント）

**役割**: 仕様の正（要件/設計/技術前提）。

**配置ファイル**:
- `docs/product-requirements.md`: PRD
- `docs/functional-design.md`: 機能設計
- `docs/architecture.md`: 技術仕様
- `docs/development-guidelines.md`: 開発ガイドライン
- `docs/glossary.md`: ユビキタス言語定義（用語集）
- `docs/repository-structure.md`: リポジトリ構造（本書）
- `docs/ideas/*`: 初期の検討メモ（参照用）

### .steering/（作業単位の履歴）

**役割**: 実装タスクごとの「要求/設計/タスク」を時系列で残す。

**命名規則**:
- `.steering/YYYYMMDD-<title>/requirements.md`
- `.steering/YYYYMMDD-<title>/design.md`
- `.steering/YYYYMMDD-<title>/tasklist.md`

### apps/protocol-web（Next.js）

**役割**: プロトコル側のWeb/UIとAPIを提供する。

- Checkout UI
- Consumer UI（ローン表示/返済）
- Operator Dashboard
- Merchant API / Public API（請求作成/署名/照合/ステータス取得）

**配置の基本方針（MVP）**:
- UIレイヤー: `apps/protocol-web/src/app/`, `apps/protocol-web/src/components/`
- Server（API/DB/chain）: `apps/protocol-web/src/server/*`（Prisma、認証、env、viemコール等）

**配置ファイル（例）**:
```text
apps/protocol-web/
├── src/
│   ├── app/                       # Next.js App Router
│   │   ├── checkout/[correlationId]/ # Checkout（オンチェーン照合ID）
│   │   ├── operator/              # Operator Dashboard
│   │   └── api/                   # Route Handlers（Merchant/Public API）
│   ├── components/                # UIコンポーネント
│   ├── server/
│   │   ├── api-error.ts
│   │   ├── auth.ts
│   │   ├── chain.ts               # viem client + contract calls
│   │   ├── crypto.ts
│   │   ├── db.ts                  # Prisma client
│   │   └── env.ts
│   └── lib/                       # 共有ユーティリティ（UIから参照可）
└── public/
```

**依存関係**:
- 依存可能: `packages/shared`, `@prisma/client`
- 依存禁止: `apps/keeper`（アプリ間依存は禁止。共有は `packages/` に出す）

### apps/merchant-demo（Merchant側デモEC）

**役割**: Merchantサイト側のデモアプリ。プロトコルの一部ではなく「加盟店がSDKを導入する例」を示す。

- `packages/merchant-sdk` をインストールして利用する想定（workspace依存、またはローカルパッケージとして参照）
- Merchant API（`apps/protocol-web`）へ請求作成を行い、Checkout URLへ遷移する
- デモ用に `apps/protocol-web` と **別ポート** で起動する（例: `3000` と `3001`）。同一VM上では `ops/nginx/site.conf` で振り分けてもよい。
- `packages/merchant-sdk` は **server-only** で利用する（Merchant APIキーをブラウザに露出させない）
- 例: `apps/merchant-demo` の Route Handler / Server Action がSDK経由で「請求作成→Checkout URL取得」を行い、ブラウザはそのURLへ遷移するだけ
- 接続先は `PROTOCOL_API_BASE_URL`（例: `https://<protocol-domain>`）で設定する（詳細は `docs/architecture.md` を参照）

**配置ファイル（例）**:
```text
apps/merchant-demo/
├── src/
│   ├── app/                       # 商品ページ/カート/購入ボタン等
│   │   └── api/                   # Route Handlers（SDKはここから呼ぶ）
│   └── lib/                       # SDK呼び出しの薄いラッパ
└── README.md
```

**依存関係**:
- 依存可能: `packages/merchant-sdk`, `packages/shared`
- 依存禁止: `apps/protocol-web`（Merchant側はHTTP経由で接続する）

### apps/keeper（Keeper Bot）

**役割**: ポーリングで「新規ローンOpen検知→delegate→DEX運用開始」を自動化する常駐プロセス。

**配置ファイル（例）**:
```text
apps/keeper/
├── src/
│   ├── index.ts                   # エントリポイント（poll loop）
│   ├── jobs/                      # delegate/start/monitor等
│   ├── chain/                     # viem/tempo client + contract calls
│   └── db/                        # Prismaアクセス（ロック/状態保存）
└── README.md                      # 実行方法（systemd/手動）
```

**依存関係**:
- 依存可能: `packages/shared`, `@prisma/client`
- 依存禁止: `apps/protocol-web`（共有は `packages/` に出す）

### packages/merchant-sdk（Merchant SDK）

**役割**: Merchantサイトから請求作成/ステータス取得を数行で呼べるthin wrapper。
このSDKは **server-only（Node runtime）** を前提とし、APIキー等の秘密情報を扱うためブラウザから直接は呼ばない。

**配置ファイル（例）**:
```text
packages/merchant-sdk/
├── src/
│   ├── index.ts
│   └── client.ts                  # fetch wrapper / typed responses
└── README.md
```

### packages/shared（共有）

**役割**: Web/Keeper/SDKで共有する型/定数/ABIを一箇所に集める。

**配置ファイル（例）**:
```text
packages/shared/
├── src/
│   ├── abi/                       # 生成したABI JSONをコミット（契約更新時に同期）
│   ├── chain.ts                   # chainId/RPC/token addresses
│   ├── contracts.ts               # contract addresses (env) + ABIs
│   ├── types.ts                   # InvoiceData等
│   └── constants.ts               # bps, precision, MIN_DEX_ORDER等
└── README.md
```

**ABIの同期方針（MVP）**:
- Foundryで `forge build` を実行してアーティファクトを生成し、必要なABI JSONだけを `packages/shared/src/abi/` に抽出して **コミット** する
- 抽出/同期は `scripts/sync-abis.ts`（例）で自動化し、rootの `pnpm sync:abis` から実行できるようにする
- `contracts/out` 等のビルド成果物は原則コミットしない（差分が大きくなりやすい）。コミット対象は `packages/shared/src/abi/*` のみに絞る

### contracts/（Foundry）

**役割**: Solidityコントラクト（LendingPool/LoanManager/Vaults）を独立して開発する。

**配置方針**:
- 実装: `contracts/src/`
- テスト: `contracts/test/`
- デプロイ/初期化: `contracts/script/`（Deploy/Init）

### prisma/（DB）

**役割**: SQLiteスキーマ、migrations、seed。

**配置方針（標準）**:
```text
prisma/
├── schema.prisma
├── migrations/
└── seed.ts
```

**運用方針（MVP）**:
- PrismaはSQLite `file:` パスを `prisma/schema.prisma` からの相対で解決するため、repo root の `.data/app.db` を使う場合は `DATABASE_URL=file:../.data/app.db` を使用する
- `apps/protocol-web` と `apps/keeper` はDB参照が必要になるため `@prisma/client` を依存に持つ

### scripts/（開発用スクリプト）

**役割**: monorepo全体に跨る開発作業をスクリプト化して、手順漏れを減らす。

**例**:
```text
scripts/
├── sync-abis.ts                   # contracts/out から packages/shared/src/abi に抽出
└── README.md                      # 実行コマンドと前提（forge/pnpmなど）
```

### ops/（EC2運用）

**役割**: EC2にデプロイして動かすための最小リソースを置く（コードから分離）。

**例**:
```text
ops/
├── systemd/
│   ├── protocol-web.service
│   ├── merchant-demo.service
│   └── keeper.service
└── nginx/
    └── site.conf
```

### .data/（実データ）

**役割**: SQLite DBなど実行時データを置く（git管理しない）。

**ルール**:
- `DATABASE_URL="file:../.data/app.db"` を前提にする（Prismaの相対解決に注意）
- `.data/` は `.gitignore` に入れる

## ファイル配置規則（要約）

| 種別 | 配置先 | 例 |
| --- | --- | --- |
| Merchant/Public API | `apps/protocol-web/src/app/api/` | `apps/protocol-web/src/app/api/merchant/invoices/route.ts` |
| UI（画面） | `apps/protocol-web/src/app/` | `apps/protocol-web/src/app/checkout/[correlationId]/page.tsx` |
| UI（部品） | `apps/protocol-web/src/components/` | `apps/protocol-web/src/components/LoanStatusCard.tsx` |
| Server実装（API/DB/chain） | `apps/protocol-web/src/server/` | `apps/protocol-web/src/server/db.ts` |
| MerchantデモUI | `apps/merchant-demo/src/app/` | `apps/merchant-demo/src/app/page.tsx` |
| Keeper | `apps/keeper/src/` | `apps/keeper/src/index.ts` |
| コントラクト | `contracts/src/` | `contracts/src/LoanManager.sol` |
| コントラクトテスト | `contracts/test/` | `contracts/test/LoanManager.t.sol` |
| Prisma | `prisma/` | `prisma/schema.prisma` |

## 命名規則

- ディレクトリ: `kebab-case`、レイヤーは複数形（例: `services/`, `repositories/`）
- TypeScriptファイル: クラスは `PascalCase.ts`、関数/モジュールは `camelCase.ts` も可（混在させない）
- Solidity: `PascalCase.sol`

## 依存関係ルール

- `apps/*` は `packages/*` に依存してよい
- `packages/*` は `apps/*` に依存しない
- Client Components は `apps/protocol-web/src/server/*` を直接 import しない（server-only）。必要な処理は Route Handler / Server Component 経由に寄せる

## pnpmモノレポ運用（MVP）

- `pnpm-workspace.yaml` は最低限 `apps/*` と `packages/*` を含める
- `package.json`（root）に「よく使う操作」を集約する（例: `dev`, `build`, `lint`, `typecheck`, `sync:abis`, `db:migrate:*`, `db:seed`）
- 開発時は「Protocol Web(3000) + Merchant Demo(3001) + Keeper」を同時に起動できるとデモ検証が速い
- 例: rootの `pnpm dev` で3つ同時起動（実装は `concurrently` 等でよい）

## スケーリング戦略

- 追加機能が増えたら `apps/protocol-web/src/server/<feature>/` や `apps/protocol-web/src/server/services/<feature>/` のように機能単位で分割する（MVPは `src/server/*` フラットでもOK）
- Keeperの戦略が増える場合は `apps/keeper/src/strategies/` を増設して切り替え可能にする
- 本番移行時は `sqlite -> postgres` 等へ置換しても `prisma/` を中心に変更を閉じ込める
