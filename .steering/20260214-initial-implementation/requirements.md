# 要求内容

## 概要

ハッカソンMVP（P0）として、**YieldDiscount BNPL のE2Eデモが再現可能な最小実装**をこのリポジトリに初期実装する。

対象となる最小動線は以下:

- Merchant Demo →（SDK/API）→ Merchant請求作成 → Checkout遷移
- Consumer（Privy）→ Deposit（担保）→ `openLoan`（加盟店へ即時支払い）
- Operator/Keeper → DEX運用（ベストエフォート）→ `harvestProfit`
- Consumer → `repay`（discount反映）→ `paid`（完済）

## 背景

現状、このリポジトリには `docs/` の仕様ドキュメントのみが存在し、実装（monorepo / apps / packages / contracts / prisma）が未作成である。
`docs/*` で定義したP0要件を「動く実装」に落とし込み、デモ手順を固定できる状態にする。

## 実装対象の機能

### 1. リポジトリ初期実装（monorepo scaffolding）

- `docs/repository-structure.md` の構造に従ってディレクトリ/パッケージを作成する
- `pnpm` workspace（`apps/*`, `packages/*`）を前提に、root scripts を整備する
- `.env.example` と `README.md`（起動/デモ動線）を用意する

### 2. Protocol（オンチェーン）: Pool / Loan / Vaults / discount（MVP）

- Lending Pool（share方式）を実装する
- Loan台帳（`openLoan/repay/liquidate`）と会計（`cash/receivables/totalAssets`）を実装する
- 担保Vault（Collateral）と discount利益Vault（Discount）を分離して実装する
- `openLoan` は EIP-712 署名を検証し、`merchant/price/dueTimestamp/correlationId` の改ざんをrevertする

### 3. Protocol Web（Next.js）: Merchant API / Public API / Checkout / Dashboard（MVP）

- Merchant API（請求作成/ステータス取得、APIキー認証、冪等性）を実装する
- Public API（Checkout向けに `correlationId` で請求取得）を実装する
- Checkout UI（Privyログイン、表示、`openLoan`、`repay`）を実装する
- Operator向けに運用/確認のための最小UIまたは代替手段（スクリプト/ログ）を用意する

### 4. Merchant SDK + Merchant Demo（MVP）

- `packages/merchant-sdk`（server-only）で Merchant API を数行で呼べるようにする
- `apps/merchant-demo` にSDK導入例（購入ボタン→請求作成→Checkoutリダイレクト）を実装する

### 5. Keeper（ベストエフォート / MVP簡略）

- 新規ローンのOpen検知 → `delegateInvestableToStrategy` → DEX `placeFlipSync` の実行を行える（自動 or 手動のどちらでもデモ成立する）
- `orderId`/txHash 等を追跡できる（ログ or DB）

## 受け入れ条件

### E2Eデモ（PRDのデモスクリプト準拠）

- [ ] LenderがPoolへ `10,000 AlphaUSD` をdepositできる（UIまたはスクリプトでよい）
- [ ] Merchant DemoがSDK/APIで `price=1,000`、期日=14日後 の請求を作成できる
  - [ ] `invoiceId` と `correlationId(bytes32相当)` と `checkoutUrl` を取得できる
- [ ] CheckoutでBorrowerが `collateralDeposit=1,600` をDepositして `openLoan` できる（署名検証を含む）
  - [ ] `collateralDeposit >= principal * 125%` を満たさない場合はrevertする
  - [ ] `reservedCollateral` と `investableCollateral` が画面に表示される
- [ ] `openLoan` 実行時に、**Borrower→Merchant の直接送金が発生しない**
  - [ ] `Pool/コントラクト → Merchant` へ `merchantPayout=970` の送金が発生する（`merchantFee=30`、固定3.0%）
- [ ] Merchant APIで請求ステータスが取得でき、状態が `created -> loan_opened -> paid` に遷移する
  - [ ] 部分返済後も `status=loan_opened` のまま `amountDueOutstanding` が減少する
  - [ ] `paid` の場合 `settlementType`（`repaid`/`liquidated`）を返せる
- [ ] Operator/Keeperが `delegateInvestableToStrategy` を実行できる（権限で保護される）
- [ ] `harvestProfit` により「実現利益（>=0）」が discount 原資として計上される（未実現PnLは使わない）
- [ ] Borrowerが `repayTargetAmount` を指定して `repay` できる（期日内 + グレース期間まで）
  - [ ] `borrowerPayAmount = repayTargetAmount - discountApplied` が成立する
  - [ ] `0 < repayTargetAmount <= amountDueOutstanding` を満たさない場合はrevertする
- [ ] 主要Tx（`openLoan/repay/delegate/harvest/returnPrincipal`）のtxHashが追跡できる（UIまたはログ）
- [ ] DEX運用の可視化（最低限 `orderId` と `strategyNAV` と `実現PnL`）が提示できる（UIまたはExplorer/ログ）

### Merchant API / SDK（仕様）

- [ ] Merchant APIは `Authorization: Bearer <apiKey>` による認証が必須
- [ ] `Idempotency-Key` により請求作成の二重作成を防止できる
  - [ ] 同一 `merchantId + Idempotency-Key` で同一bodyなら同一レスポンス
  - [ ] 同一 `merchantId + Idempotency-Key` で異なるbodyなら `409`
- [ ] `invoiceId` はオンチェーンに載せず、照合キーは `correlationId` のみを使用する

### 品質（最小ゲート）

- [ ] `pnpm lint` / `pnpm typecheck` / `pnpm build` が通る
- [ ] `forge test` が通る（主要I/Fと会計・イベント）

## 成功指標

- PRDのE2Eデモスクリプトを最後まで再現できる（成功率 100%）
- Merchant導入デモ（SDK/APIで請求作成→Checkout遷移→ステータス確認）が通る

## スコープ外

以下は今回（初回実装）では扱わない:

- 本番レベルのリスク管理（オラクル、ヘッジ、保険、SLA、監査）
- 複数Merchant/複数Strategy Wallet/複数ペアの本格対応（MVPは単一Strategy Wallet、単一ペア）
- Fiat on/off ramp、fee sponsorship
- 延滞中の任意返済フロー（MVP対象外）
- 送金先/金額の秘匿（MVPでは公開情報）

## 参照ドキュメント

- `docs/product-requirements.md` - プロダクト要求定義書
- `docs/functional-design.md` - 機能設計書
- `docs/architecture.md` - 技術仕様書
- `docs/repository-structure.md` - リポジトリ構造定義書
- `docs/development-guidelines.md` - 開発ガイドライン
- `docs/glossary.md` - ユビキタス言語定義

