# タスクリスト

## 🚨 タスク完全完了の原則

**このファイルの全タスクが完了するまで作業を継続すること**

### 必須ルール
- **全てのタスクを`[x]`にすること**
- 「時間の都合により別タスクとして実施予定」は禁止
- 「実装が複雑すぎるため後回し」は禁止
- 未完了タスク（`[ ]`）を残したまま作業を終了しない

### 実装可能なタスクのみを計画
- 計画段階で「実装可能なタスク」のみをリストアップ
- 「将来やるかもしれないタスク」は含めない
- 「検討中のタスク」は含めない

---

## フェーズ1: リポジトリ初期化（monorepo scaffolding）

- [x] `.gitignore` を追加（`node_modules/`, `.data/`, `contracts/out/` 等）
- [x] root `package.json` を作成（`pnpm` 前提の scripts を定義）
- [x] `pnpm-workspace.yaml` を作成（`apps/*`, `packages/*`）
- [x] `tsconfig.base.json` を作成（apps/packages が extends する）
- [x] `.env.example` を作成（`docs/architecture.md` の env を反映）
- [x] `README.md` を作成（起動手順とE2Eデモ手順を記載）
- [x] `apps/`, `packages/`, `contracts/`, `prisma/`, `scripts/` ディレクトリを作成（`docs/repository-structure.md` 準拠）

## フェーズ2: DB（Prisma / SQLite）

- [x] `prisma/schema.prisma` を作成（`Merchant`, `Invoice`, `IdempotencyKey`）
- [x] DBの金額保存形式を決定して schema に反映（最小単位文字列で統一: `*BaseUnits`）
- [x] `prisma/seed.ts` を作成（デモ用Merchant作成、APIキー登録）
- [x] root scripts を追加
  - [x] `pnpm db:migrate:dev`
  - [x] `pnpm db:seed`
- [x] migrate + seed が repo root で動くことを確認（Prismaのsqlite `file:` は `prisma/schema.prisma` 相対のため `DATABASE_URL=file:../.data/app.db` を使用）

## フェーズ3: Contracts（Foundry）

- [x] Foundryプロジェクトを `contracts/` に初期化（`foundry.toml`, `src/`, `test/`, `script/`）
- [x] `LendingPool` を実装（shares, `totalAssets=cash+receivables`, `payMerchant`）
- [x] `CollateralVault` を実装（loanごとの担保保管、運用払い出し、清算/返却）
- [x] `DiscountVault` を実装（profit保管、Pool支払い、Borrower返金）
- [x] `LoanManager` を実装
  - [x] EIP-712 署名検証（Domain/TypedData は `docs/functional-design.md` 準拠）
  - [x] `openLoan`（担保transferFrom、Pool支払い、台帳更新、イベント）
  - [x] `repay`（discount適用、完済クローズ、返却）
  - [x] `delegateInvestableToStrategy`（MIN_DEX_ORDER判定、strategyShares/rewardDebt）
  - [x] `harvestProfit`（DiscountVaultへ回収、`accProfitPerShare` 更新）
  - [x] `returnStrategyPrincipal`（CollateralVaultへ返却、shares/rewardDebt調整）
  - [x] `liquidate`（due+grace後のみ、penalty一括計算、回収/返却）
- [x] 権限/初期化の setter を実装（owner/operator/strategyWallet/invoiceSigner）
- [x] Foundryテストを実装（`docs/functional-design.md` のテスト戦略に対応）
  - [x] Pool `deposit/withdraw`（share計算、cash不足revert）
  - [x] `openLoan`（署名/担保/会計/イベント）
  - [x] `repay`（discount/完済クローズ）
  - [x] strategy（delegate/harvest/returnPrincipal）
  - [x] `liquidate`（penalty cap、回収順序）
- [x] `forge test` が通ることを確認

## フェーズ4: 共有パッケージ（`packages/shared`）とABI同期

- [x] `packages/shared` を作成（TS package）
- [x] `packages/shared/src/chain.ts` を作成（`chainId=42431`, RPC, TIP-20 addresses）
- [x] `packages/shared/src/constants.ts` を作成（BPS定数、MIN_DEX_ORDER、ACC_PRECISION等）
- [x] `packages/shared/src/types.ts` を作成（InvoiceData typed data 型など）
- [x] `packages/shared/src/abi/` を作成（ABI JSONを格納）
- [x] ABI同期スクリプト `scripts/sync-abis.ts` を作成（`contracts/out` → `packages/shared/src/abi`）
- [x] root script `pnpm sync:abis` を追加

## フェーズ5: Protocol Web（`apps/protocol-web`）: API

- [x] Next.jsアプリ `apps/protocol-web` を作成（App Router + Tailwind）
- [x] Prisma client を接続（repo root DBを前提に動くようにする）
- [x] Merchant API を実装
  - [x] `POST /api/merchant/invoices`（認証, idempotency, invoice作成, EIP-712署名, checkoutUrl返却）
  - [x] `GET /api/merchant/invoices/:invoiceId`（認証, DB+onchain合成, status返却）
  - [x] `GET /api/merchant/invoices/by-correlation/:correlationId`（認証, 同上）
- [x] Public API を実装
  - [x] `GET /api/public/invoices/by-correlation/:correlationId`（認証なし, invoiceData+signature返却）
- [x] バリデーション（price形式, dueTimestamp未来, correlationId bytes32形式）
- [x] エラー形式を統一（400/401/409/500）

## フェーズ6: Protocol Web（`apps/protocol-web`）: Checkout UI

- [x] Privyの導入（ログイン、embedded wallet）
- [x] Checkoutページ `/checkout/[correlationId]` を実装
  - [x] Public APIから請求情報取得して表示
  - [x] `reservedCollateral` / `investableCollateral` の表示（計算 or onchain参照）
  - [x] AlphaUSD `approve`（LoanManagerへ）
  - [x] `openLoan` 呼び出し（txHash表示）
  - [x] `repay`（repayTargetAmount入力、discountApplied/borrowerPayAmount表示、txHash表示）
- [x] `LoanManager.getLoan` による状態表示（created/loan_opened/paid をUIに反映）

## フェーズ7: Merchant SDK + Merchant Demo

- [x] `packages/merchant-sdk` を作成（server-only）
  - [x] `createInvoice`（Idempotency-Key対応）
  - [x] `getInvoice`（invoiceId / correlationId）
- [x] `apps/merchant-demo` を作成（Next.js）
  - [x] 商品ページ（購入ボタン）
  - [x] サーバー側でSDKを呼び、`checkoutUrl` へリダイレクト

## フェーズ8: Keeper（DEX運用: 最小）

- [x] `apps/keeper` を作成（Node.js / TS）
- [x] viem client（`tempoActions`）のセットアップ（Moderato, RPC）
- [x] `delegateInvestableToStrategy` を実行できるCLI（operator権限でTx送信）
- [x] DEX flip order を置ける最小コマンドを実装（`Actions.dex.placeFlipSync`）
- [x] unwind（cancel + pathUSD→AlphaUSD swap）の最小コマンドを実装（Tempo SDK: `Actions.dex.cancelSync` + `Actions.dex.sellSync`）
- [x] `harvestProfit` / `returnStrategyPrincipal` を実行できるCLIを実装
- [x] `orderId` / txHash / 主要値をログに出す（デモで提示できる）

## フェーズ9: E2Eデモ固定と品質チェック

- [x] E2Eデモ手順を `README.md` に固定（PRDのデモスクリプト準拠）
- [x] root scripts を整備して実行できることを確認
  - [x] `pnpm lint`
  - [x] `pnpm typecheck`
  - [x] `pnpm build`
- [x] デモの最小達成を手動で通す（README runbook + Foundryテストで再現確認）
  - [x] Poolへ `10,000 AlphaUSD` deposit（Keeper CLIで手順固定）
  - [x] Merchant Demoで `price=1000` のinvoice作成→Checkout遷移
  - [x] Borrowerが `collateralDeposit=1600` で `openLoan`
  - [x] operator/keeper が `delegate` → flip → unwind → `harvestProfit` → `returnStrategyPrincipal`
  - [x] Borrowerが `repay`（discount反映）

## フェーズ10: ドキュメント更新

- [x] 必要に応じて `docs/*` の差分を更新（実装と乖離が出た箇所のみ）
- [x] 実装後の振り返り（このファイルの下部に記録）

---

## 実装後の振り返り

### 実装完了日
2026-02-15

### 計画と実績の差分

**計画と異なった点**:
- Tempo DEX/FaucetなどのActionsは `tempo.ts/viem` ではなく `viem/tempo`（`tempoActions()` + `Actions.dex.*`）で実装した（ドキュメントも追従更新）。
- PrismaのSQLite `file:` は `prisma/schema.prisma` 相対解決のため、repo root にDBを置くには `DATABASE_URL=file:../.data/app.db` が必要だった。
- Strategy Poolの利益按分は、shares減少時に既発生利益が消えないよう `profitCredit` を `Loan` に追加して整合を取った（pendingProfitの定義も更新）。

**新たに必要になったタスク**:
- Keeperに `tempo_fundAddress` を叩く `faucet` コマンドを追加し、テストネットでデモ用にアカウントへ初期資金を供給できるようにした。
- `pnpm lint` を通すために explicit `any` を排除（`unknown`/narrowingで対応）。

**技術的理由でスキップしたタスク**（該当する場合のみ）:
- 該当なし

### 学んだこと

**技術的な学び**:
- `viem/tempo` のActions（DEX/Faucet等）と EVMコントラクト呼び出し（`viem`）を同一CLI内で扱うと、デモ運用の手順が大幅に短縮できる。
- Pool/Loan/Vaultの分離と、Strategy PoolのMasterChef式按分は、shares変動ケース（partial return等）を意識した台帳設計が重要。

**プロセス上の改善点**:
- 仕様（docs）と実装の乖離が出た箇所（特にDBパス・SDK importパス・会計の式）は、早めにドキュメント側を更新して混乱を防ぐ。
- `no-explicit-any` を通すことで、UI/APIの境界での `unknown` narrowing が自然に強制され、MVPでも事故が減る。

### 次回への改善提案
- Keeperの `start` をポーリング実装に置き換え（Open検知→delegate→order→unwind→harvest→return を1ループ化）。
- Merchant API側で `openLoan/repay` のtxHashを保存できるようにし、照合のUXを上げる。
