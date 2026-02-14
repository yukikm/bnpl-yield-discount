# 用語集 (Glossary / Ubiquitous Language)

**更新日**: 2026-02-14

このドキュメントは、`docs/*` と実装（コントラクト/DB/API/UI）で使う用語を統一するための定義集です。

## 先に決める（混乱しやすい前提）

- **Loan ID = correlationId**: 本プロジェクトではオンチェーン照合IDとして `correlationId(bytes32)` を採用し、コントラクト上の `loanId` と同一とみなす
- **invoiceId はオフチェーンのみ**: `invoiceId(UUID)` はDB/ログ/UIで使うが、オンチェーンには載せない
- **金額は最小単位（decimals=6）**: AlphaUSD/pathUSDの金額は小数ではなく最小単位（整数）で扱う
- **Discountは実現利益のみ**: 未実現PnLはdiscount原資にしない。`harvestProfit` によって確定した実現利益のみを分配する

## ドメイン用語（プロダクト/ビジネス）

| 日本語 | 英語 | 定義 | コード/実装上の呼称 |
| --- | --- | --- | --- |
| Yield Discount BNPL | Yield Discount BNPL | BNPL（後払い）に「DEX運用の実現利益による割引」を組み合わせたプロトコル/プロダクト | プロジェクト名全般 |
| 加盟店 | Merchant | 商品/サービスを販売し、BNPLにより即時入金（`merchantPayout`）を受ける主体 | `Merchant`（DB） |
| 購入者 | Consumer | Checkoutで担保をDepositし、後日返済する主体（=借り手） | Borrower/Consumer（UI） |
| 借り手 | Borrower | ローンを開き、返済/清算の当事者となるアドレス | `borrower`（onchain） |
| 貸し手 | Lender | LendingPoolに預け入れて貸付原資を供給する主体 | `Lender`（UI） |
| 運営 | Operator | DEX運用・利益回収・清算など運用系アクションを実行する権限主体（MVPはKeeperのEOA） | `operator` / `onlyOperator` |
| Keeper | Keeper | DB/オンチェーンをポーリングして運用開始などを自動化する常駐プロセス | `apps/keeper` |
| Protocol Web | Protocol Web | Checkout/Consumer/Operator Dashboard/Merchant API を提供するプロトコル側アプリ | `apps/protocol-web` |
| Merchant Demo | Merchant Demo | Merchant側デモEC（SDK導入例）。Protocolとは別アプリとして動かす | `apps/merchant-demo` |
| Merchant SDK | Merchant SDK | MerchantサイトからMerchant APIを叩くthin wrapper（server-only） | `packages/merchant-sdk` |
| 請求署名者 | invoiceSigner | Merchant APIが発行するEIP-712署名に使う鍵（推奨: operatorと別鍵） | `invoiceSigner`（概念） |
| オーナー | owner | コントラクトの初期設定（operator/strategyWallet等）を行う権限主体 | `owner`（概念） |
| Checkout | Checkout | `correlationId` をキーに請求を表示し、担保Depositと `openLoan` を実行する画面 | `/checkout/[correlationId]` |
| Operator Dashboard | Operator Dashboard | 運用状況（注文ID、NAV、PnL、discount原資）を確認し、運用系Txを実行する画面 | `/operator` |

## 請求（Invoice）と照合ID

| 用語 | 英語 | 定義 | 備考 |
| --- | --- | --- | --- |
| 請求 | Invoice | Merchant APIで作成される「支払い要求」レコード | DBに保持 |
| 請求ID | invoiceId | DB上の請求の主キー（UUID） | オフチェーンのみ |
| 照合ID | correlationId | Invoiceと1:1で紐づく `bytes32` のID。オンチェーン照合、URLキー、ログキーに使う | `loanId` と同義 |
| 返済期日 | dueTimestamp | 返済期日（unix seconds）。`dueTimestamp + gracePeriod` を過ぎると清算対象になる | オフチェーン/オンチェーンに保存 |
| 冪等性キー | Idempotency-Key | Merchant APIで同一リクエストの多重作成を防ぐキー | HTTP Header |

## オンチェーン（コントラクト）用語

| 日本語 | 英語 | 定義 | コード/実装上の呼称 |
| --- | --- | --- | --- |
| レンディングプール | Lending Pool | 貸し手の預け入れと、加盟店への支払い原資を管理するコントラクト | `LendingPool` |
| ローン台帳 | Loan Manager | ローン開始/返済/清算と、会計（債権/手数料）を管理するコントラクト | `LoanManager` |
| 担保Vault | Collateral Vault | Borrowerの担保（AlphaUSD）を保管し、返却/清算を行うコントラクト | `CollateralVault` |
| 割引Vault | Discount Vault | `harvestProfit` で回収した実現利益（AlphaUSD）を保管し、discount/返却に使うコントラクト | `DiscountVault` |

## 主要アクション（コントラクト関数）

| 日本語 | 英語 | 定義 | コード/実装上の呼称 |
| --- | --- | --- | --- |
| ローン開始 | open loan | Invoice署名を検証し、担保Depositと同時にローンを作成して加盟店へ `merchantPayout` を送金する | `openLoan(...)` |
| 返済 | repay | 借り手が返済を行い、`amountDueOutstanding` を減らす（完済でClosed） | `repay(loanId, repayTargetAmount)` |
| 清算 | liquidate | 期日+グレース超過時に、担保から回収してPoolへ返す（penaltyはMVPでは清算時に一括確定） | `liquidate(loanId)` |
| 運用委任 | delegate | `investableCollateral` をStrategy Walletへ移し、Strategy Poolのsharesをmintする | `delegateInvestableToStrategy(loanId)` |
| 利益回収 | harvest profit | 実現利益をDiscountVaultへ回収し、利益分配の累積値を更新する | `harvestProfit(profitAmount)` |
| 元本返却 | return principal | 運用元本をCollateralVaultへ戻し、sharesをburnする | `returnStrategyPrincipal(loanId, amount)` |

## ローンと会計（重要）

| 用語 | 英語 | 定義 | コード/実装上の呼称 |
| --- | --- | --- | --- |
| 価格 | price | 商品価格（AlphaUSD）。MVPでは `principal = price` | `price`（Invoice） |
| 元本 | principal | 借り手が後日返済する元本。MVPは `principal = price` | `principal`（onchain） |
| 残元本 | principalOutstanding | 未返済の元本残高 | `principalOutstanding` |
| 加盟店手数料 | merchantFee | 加盟店に課す手数料（例: 3%）。Poolの純資産増加要因 | `merchantFee` / `MERCHANT_FEE_BPS` |
| 加盟店入金額 | merchantPayout | 加盟店への即時送金額（`price - merchantFee`） | `merchantPayout` |
| 返済残高 | amountDueOutstanding | 未払い総額（`principalOutstanding + feesOutstanding`） | `amountDueOutstanding` |
| 返済目標額 | repayTargetAmount | 今回の返済で減らしたい残債額（部分返済含む） | `repayTargetAmount` |
| 割引適用額 | discountApplied | 返済時に `discountCredits` から実際に消費された割引額（借り手の外部支払額を減らす） | `discountApplied`（概念、派生値） |
| 延滞手数料 | lateFee | 延滞時の固定事務手数料（例: 5 USD、初回のみ） | `lateFee` / `lateFeeCharged` |
| 遅延ペナルティ | penaltyAccrued | `principalOutstanding` に対する日次ペナルティ（simple、複利なし） | `penaltyAccrued`（概念） |
| 未払い手数料 | feesOutstanding | `lateFee + penaltyAccrued`（cap適用後）の未払い分 | `feesOutstanding` |
| グレース期間 | gracePeriod | 期日超過後、清算可能になるまでの猶予（例: 3日） | `gracePeriod` |
| 清算 | liquidation | 期日+グレース後に、担保から回収してPoolへ返す処理 | `liquidate` |
| キャッシュ | cash | Poolが保有するAlphaUSD残高（即時引き出しの原資） | `cash()` |
| 債権 | receivables | 未回収の貸付債権（ローンの `amountDueOutstanding` の合算） | `totalReceivables()`（LoanManager） |

### `discountApplied` の扱い（MVP）

- `discountApplied = min(discountCredits, repayTargetAmount)` の **その場の計算値**（派生値）
- 返済UIは「txレシート/イベント」または `repayTargetAmount` と `discountCredits`（= `pendingProfit`）から表示用に算出する

## LendingPool（shares会計）

LendingPoolの `shares` は「預け入れの持分」を表す。Strategy Poolの `strategyShares` とは別物なので混同しない。

| 用語 | 英語 | 定義 | コード/実装上の呼称 |
| --- | --- | --- | --- |
| 預入資産 | assets | LendingPoolへ預け入れるAlphaUSD量（最小単位） | `assets` |
| プール持分 | shares | 預け入れに対してmintされる持分（LPトークン相当） | `shares` / `totalShares()` |
| 総キャッシュ | cash | Poolが保有するAlphaUSD残高 | `cash()` |
| 総債権 | totalReceivables | LoanManagerの未回収債権合計 | `totalReceivables()`（LoanManager） |
| 総資産 | totalAssets | `cash + totalReceivables`（LoanManagerの債権を含む） | `totalAssets()` |
| 総持分 | totalShares | Poolの発行済みshares合計 | `totalShares()` |
| シェア価格 | share price | `totalAssets / totalShares`（概念。実装はmint/burn計算でfloor） | （概念） |

**shares計算（MVP）**:
- `deposit(assets)`:
  - 初回: `shares = assets`
  - それ以外: `shares = assets * totalShares / totalAssets`（floor）
- `withdraw(shares)`:
  - `assets = shares * totalAssets / totalShares`（floor）
  - `cash < assets` の場合は流動性不足でrevertし得る

## 担保と運用上限

| 用語 | 英語 | 定義 | コード/実装上の呼称 |
| --- | --- | --- | --- |
| 担保Deposit | collateralDeposit | BorrowerがDepositする担保（AlphaUSD） | `collateralDeposit` |
| 温存担保 | reservedCollateral | 最低担保として常に温存する額（MVPは `principal * 125%` を固定） | `reservedCollateral` |
| 運用可能担保 | investableCollateral | DEX運用に回せる上限（MVPはローン開始時に固定） | `investableCollateral` |
| 担保率 | collateral ratio | `collateralDeposit` が `principal` の何%必要か | `COLLATERAL_RATIO_BPS` |
| 運用上限 | max invest ratio | `collateralDeposit` のうち運用に回して良い最大比率 | `MAX_INVEST_BPS` |
| DEX最小注文 | min dex order | `investableCollateral` が運用対象になる最小額（例: $100） | `MIN_DEX_ORDER` |
| 健全性指標 | health factor | 破綻防止のための指標（MVPは運用停止判断に利用） | `healthFactor`（UI/概念） |

### `healthFactor` と `strategyNAV`（MVP）

- `healthFactor = (reservedCollateral + strategyNAV) / amountDueOutstanding`（cap適用後の `amountDueOutstanding` を使用）
- `strategyNAV` は **保守的に評価**する
  - DEXの見積もりは「不利な側（worst-case）のクォート」を使用してAlphaUSD換算する
  - 未約定の注文（オーダーブック上の注文）は評価に入れない（=0扱い）
  - discount原資はあくまで実現利益のみ（NAVが高くても未実現PnLはdiscountに使わない）

## Strategy Pool（利益分配）の用語

複数ローンの `investableCollateral` は単一 `strategyWallet` に集約され、利益はローンごとに按分してdiscount原資になる。

| 用語 | 英語 | 定義 | コード/実装上の呼称 |
| --- | --- | --- | --- |
| Strategy Wallet | Strategy Wallet | DEX注文を実行するEOA（MVPは運営管理、operatorと同一でも可） | `strategyWallet` |
| Strategy Pool | Strategy Pool | Strategy Walletに集約した資金を「shares」で按分管理する会計モデル | `strategyShares` 等 |
| 運用shares | strategyShares | ローンがStrategy Poolに参加しているshares（MVP: 1 share = 1 AlphaUSD） | `strategyShares` |
| shares合計 | strategyTotalShares | Strategy Pool全体のshares合計 | `strategyTotalShares` |
| 利益配賦係数 | accProfitPerShare | 実現利益をsharesへ配賦する累積値（scaled、例: 1e18） | `accProfitPerShare` |
| 消費済み利益 | rewardDebt | 既に利用/返却済みの利益（`accProfitPerShare` 基準） | `rewardDebt` |
| 利用可能利益 | pendingProfit | `strategyShares` に対する未消費の利益（discount原資、下限0） | `pendingProfit`（概念） |
| 割引原資 | discountCredits | UI/表示上の「割引に使えるクレジット」。MVPでは `pendingProfit` と同義 | `discountCredits`（概念） |
| 利益回収 | harvestProfit | 実現利益をStrategy WalletからDiscountVaultへ移し、配賦係数を更新する操作 | `harvestProfit(profitAmount)` |
| 元本返却 | returnStrategyPrincipal | Strategy WalletからCollateralVaultへ運用元本を戻す操作 | `returnStrategyPrincipal(loanId, amount)` |
| 運用委任 | delegateInvestableToStrategy | `investableCollateral` をStrategy Walletへ移し、Strategy Poolのsharesをmintする操作 | `delegateInvestableToStrategy(loanId)` |

## DEX運用（MVP: flip order）

| 用語 | 英語 | 定義 | コード/実装上の呼称 |
| --- | --- | --- | --- |
| TempoネイティブDEX | Native DEX | TempoのActionsで操作できるDEX | `Actions.dex.*` |
| flip order | Flip Order | `placeFlipSync` によるスプレッド狙いの反復注文（MM的挙動） | `placeFlipSync` |
| tick | tick | flip orderの価格パラメータ（例: 1.001） | `tick` |
| flipTick | flipTick | flip側の価格パラメータ（例: 0.999） | `flipTick` |
| 注文ID | orderId | DEX注文の識別子 | `orderId`（DB/ログ） |
| 実現PnL | realized PnL | ポジション解消後にAlphaUSDへ戻して確定した損益 | `profitAmount`（`harvestProfit`入力） |
| 未実現PnL | unrealized PnL | 未解消ポジションの評価損益 | discount対象外 |
| NAV | net asset value | Strategy Walletの資産評価額（AlphaUSD換算、MVPは保守的評価） | `strategyNAV`（概念） |

## ステータス・状態

### InvoiceStatus（オフチェーンDB）

| ステータス | 意味 | いつ更新されるか |
| --- | --- | --- |
| `created` | 請求作成済み（ローン未開始） | Merchant APIがInvoiceを作成 |
| `loan_opened` | ローン開始済み（加盟店へ支払い済み） | `openLoan` のTx成功を検知 |
| `paid` | 完済または清算でクローズ | `repay` or `liquidate` 完了を検知 |

### LoanState（オンチェーン）

| ステータス | 意味 |
| --- | --- |
| `None` | `correlationId` のローンが未作成 |
| `Open` | ローン返済中 |
| `Closed` | 完済または清算で終了 |

### SettlementType（オンチェーン/DB）

| 値 | 意味 |
| --- | --- |
| `repaid` | 返済でクローズ |
| `liquidated` | 清算でクローズ |

### DBステータスとオンチェーン状態の対応（推奨）

Merchant APIが返すステータスは「DBのinvoice情報」と「オンチェーンの `getLoan(correlationId)`」を合成して決める。

| DB: InvoiceStatus | オンチェーン: LoanState | 表示/意味 |
| --- | --- | --- |
| `created` | `None` | 請求作成済み（ローン未開始） |
| `loan_opened` | `Open` | ローン開始済み（加盟店へ支払い済み） |
| `paid` | `Closed` | 完済または清算でクローズ（`settlementType` を併記） |

## 技術用語（実装）

| 用語 | 定義 | 本プロジェクトでの用途 |
| --- | --- | --- |
| Tempo | EVM互換のTempoネットワーク | コントラクト実行、TIP-20、DEX Actions |
| TIP-20 | TempoのERC-20互換トークン規格 | AlphaUSD/pathUSDの入出金 |
| AlphaUSD | stablecoin（decimals=6） | 支払い/担保/Pool/割引の基軸通貨 |
| pathUSD | stablecoin（decimals=6） | DEX運用のquote通貨（AlphaUSD/pathUSD） |
| EIP-712 | typed data署名規格 | Invoice署名の検証（改ざん防止） |
| ABI | コントラクトのインターフェース定義 | `packages/shared/src/abi/*` にコミット |
| Prisma | TypeScript ORM | SQLite永続化、migration/seed |
| systemd | Linuxのプロセスマネージャ | Protocol Web / Merchant Demo / Keeper の常駐 |

## 略語・単位

| 表記 | 正式名称 | 意味 |
| --- | --- | --- |
| BNPL | Buy Now, Pay Later | 後払い |
| DEX | Decentralized Exchange | 分散型取引所 |
| EVM | Ethereum Virtual Machine | Solidity実行環境 |
| RPC | Remote Procedure Call | チェーン接続のエンドポイント |
| UUID | Universally Unique Identifier | `invoiceId` で使用 |
| BPS | Basis Points | 1/10000（例: 300 = 3.00%） |
| PnL | Profit and Loss | 損益（実現/未実現） |
