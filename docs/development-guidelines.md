# 開発ガイドライン (Development Guidelines)

本書は **ハッカソンMVPを最短で作る** ことを優先しつつ、実装の迷いどころ（命名、型、金額、秘密情報、DB/ABI同期、Keeper運用）での事故を減らすためのガイドです。

## 基本原則

- 仕様の正は `docs/*`（破壊的な変更は先にドキュメントを更新）
- 「動く」より「再現できて動く」を優先（`pnpm-lock.yaml` / `forge` / `prisma migrate`）
- 金額・残高・トークン量は **浮動小数を使わない**（decimals=6 を前提に `bigint`/文字列で扱う）
- 秘密情報（API key / private key）は **ブラウザに出さない**（`NEXT_PUBLIC_` は公開情報のみ）

## モノレポ運用（pnpm）

- パッケージ管理: `pnpm`
- workspace: `apps/*`, `packages/*`
- よく使うコマンドは root `package.json` に集約する
- 推奨root scripts（例）:
  - `pnpm dev`: `apps/protocol-web`(3000) + `apps/merchant-demo`(3001) + `apps/keeper` を同時起動
  - `pnpm build`: 全workspaceのビルド
  - `pnpm lint`: 全workspaceのlint
  - `pnpm typecheck`: 全workspaceの型チェック
  - `pnpm sync:abis`: ABI同期（contracts -> packages/shared）
  - `pnpm db:migrate:dev`: `prisma migrate dev`
  - `pnpm db:migrate:deploy`: `prisma migrate deploy`
  - `pnpm db:seed`: `prisma db seed`

## コーディング規約（TypeScript / Next.js）

### 命名規則

- 変数/関数: `camelCase`
- クラス/型/インターフェース/コンポーネント: `PascalCase`
- 定数: `UPPER_SNAKE_CASE`（プロトコル定数やBPS等）
- 真偽値: `is*`, `has*`, `should*`, `can*`

### フォーマット

- Prettier + ESLint を前提（インデント2スペース）
- 迷ったら「既存ファイルに合わせる」

### 金額・IDの取り扱い（重要）

- AlphaUSD/pathUSD は `decimals=6`
- 文字列で入力された金額（例 `"1000.00"`）は **必ず整数最小単位**（例: `1000000000`）に変換してから扱う
  - 方針: 小数が6桁を超える入力はreject（丸めない）
  - 変換: `viem` の `parseUnits(value, 6)`（推奨）などを使い、`number` を経由しない
- DBには `string` で保存（`functional-design.md` の `price/merchantFee/...`）
- `correlationId` は `bytes32` の `0x...` 形式（推測困難なランダム）。URL/ログ/DBではこの形式に統一する

### エラーハンドリング

- APIは「想定エラー」と「想定外エラー」を分ける
- 返却は最低限以下を統一する
  - `400`: バリデーション（入力不正）
  - `401`: 認証（API key）
  - `409`: 冪等性衝突（同一Idempotency-Keyで内容が違う等）
  - `500`: それ以外（内部エラー）
- Keeperは失敗しても継続できるようにし、`correlationId` と `txHash` を必ずログに残す

### `merchant-sdk` は server-only

- `packages/merchant-sdk` は **Node runtimeでのみ使用**する（APIキーを扱うため）
- `apps/merchant-demo` は「Route Handler / Server Action」がSDK経由で請求作成し、ブラウザはCheckout URLへ遷移するだけにする
- 実装時は SDK 側で `import "server-only";`（Next.js）を入れて、誤ってクライアントでバンドルされないようにするのを推奨
- `apps/merchant-demo` の API実装は Node runtime を前提にし、Client ComponentからSDKをimportしない

## API実装ガイド（Protocol Web）

- 入口は `apps/protocol-web/src/app/api/*`
- バリデーションは必須（例: `price` 形式、`dueTimestamp` 未来）
  - `merchantAddress` は原則「merchant作成/更新（Operator用）」等のAPIでのみ入力として扱い、通常の請求作成はAPIキーからmerchantを特定する
- `Idempotency-Key` を受け付けるエンドポイントは「同一キーは同一結果」を保証する
- 認証（Merchant API）は `Authorization: Bearer <apiKey>` を必須にする

## DB（Prisma / SQLite）

- `DATABASE_URL="file:./.data/app.db"` を前提にするため、起動/マイグレーションは **repo root を WorkingDirectory** にする
- Prismaの migration/seed は原則 repo root で実行する
- Keeperのロック/状態保存はDBに寄せる（多重起動対策）

## ABI同期（contracts -> packages/shared）

- コントラクト更新後は `forge build` を実行し、`pnpm sync:abis` で `packages/shared/src/abi/*` を更新する
- `contracts/out` 等のビルド成果物は原則コミットしない（コミット対象は `packages/shared/src/abi/*` のみ）

## Keeper（ポーリング常駐）

- systemdで常駐（推奨）。最低限:
  - 1ループで処理する対象を制限し、次ループに回せる構造にする
  - ロック（DB）で多重起動や重複処理を避ける
  - `correlationId` / `orderId` / `txHash` をログに残す

## Solidity / Foundry

- `contracts/src/*` に実装、`contracts/test/*` にFoundryテスト
- 重要な操作（`openLoan/repay/liquidate/delegate/harvestProfit/returnStrategyPrincipal`）はイベントを出し、テストで最低限検証する
- `forge fmt` を使う（手整形しない）

## Git運用（ハッカソンMVP向け）

- ブランチ戦略は軽量で良い
  - 基本: `main`
  - 必要なら短命の `feature/<topic>` を切って戻す
- コミットメッセージはConventional Commitsを推奨
  - 例: `feat(protocol-web): add merchant invoice create API`
  - 例: `fix(keeper): avoid double-processing with db lock`

## 必須チェック（最小）

- TypeScript: `pnpm lint` / `pnpm typecheck`
- Contracts: `forge test`
- 手動E2E: Merchant Demo → Checkout → openLoan → repay（PRDのデモ手順で固定）
