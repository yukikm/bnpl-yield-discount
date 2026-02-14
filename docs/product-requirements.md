# プロダクト要求定義書 (Product Requirements Document)

## プロダクト概要

### 名称

**YieldDiscount BNPL** - Deposit運用益で実支払額が下がるBNPL Checkout

### プロダクトコンセプト

- **Stripe級の導入容易性**: 加盟店はSDK/APIで数行の実装を追加するだけでBNPL Checkoutを提供できる
- **Deposit後に自動運用（MVPはkeeper/運営操作）**: 消費者は担保Deposit後、keeper（運営ボット）がその一部をTempoネイティブDEXで運用する（デモではAdmin操作で開始してよい）
- **運用益で割引**: 実現PnLを返済原資に充当し、消費者が実際に支払う額をdiscountする

### プロダクトビジョン

加盟店が「簡単に」後払いを提供でき、消費者が「運用とセットで」後払いを利用できる決済体験を、Tempo上で実現する。
従来BNPLの利便性に加え、Deposit資金の自動運用によるdiscountという明確な金銭的メリットを提示する。
Web3を意識しないオンボーディングと、オンチェーンの透明性・即時決済を両立し、Web3版Stripeを目指す。

### 目的

- 加盟店が数分で導入できる「BNPL Checkout」を提供する
- 消費者がDepositした後、keeperにより運用が開始され、返済額がdiscountされる体験を提供する（MVPは運営管理、デモは手動開始でも可）
- Tempoのmemos/ネイティブDEX/即時finalityを活用し、決済照合と運用の透明性を担保する
- 「購入者Depositで即時決済」ではなく、貸し手の流動性から加盟店へ即時支払いを行い、後日返済されるBNPLとして成立させる

## ビジネス要件

### 用語と計算式（MVPで固定）

- `invoiceId`: Merchant APIで発行されるオフチェーン請求ID（DB主キー）
- `correlationId`: オンチェーン照合ID（bytes32相当、MVPはランダム生成）
  - 生成: `correlationId = randomBytes32()`（`0x` + 64 hex）
  - 要件: invoice単位でユニーク / 推測困難 / memo・イベントにはこれのみ載せる（invoiceIdは載せない）
- `price`: 加盟店が設定する請求額（AlphaUSD建て）
- `principal`: 借り手が後日返済する元本（MVPでは `principal = price`）
- `principalOutstanding`: 残元本（初期値は `principal`、返済で減る）
- `merchantFee`: 加盟店手数料（`price * 3.0%`）
- `merchantPayout`: 加盟店への即時入金額（`price - merchantFee`）
- `collateralDeposit`: 借り手がロックする担保Deposit（AlphaUSD建て）
- `reservedCollateral`: 最低担保として常に温存する額（MVPではローン開始時に `principal * 125%` を固定）
- `maxInvestRatio`: 運用上限比率（MVPでは `50%`）
- `investableCollateral`: 運用に回せる最大額（MVPではローン開始時に固定）
  - `investableCollateral = min(collateralDeposit - reservedCollateral, collateralDeposit * maxInvestRatio)`（0未満なら0）
- `lateFee`: 事務手数料（延滞時、固定 `5 USD`、初回延滞時に1回のみ）
- `penaltyAccrued`: 遅延ペナルティ（`0.10%/日`、`principalOutstanding` に対してsimple、複利なし）
  - MVP: オンチェーンでは日次でaccrueしない。`liquidate()` 実行時に `daysLate` から一括計算して確定する（Open中は0のままでも良い）
- `feesOutstanding`: 未払いの `lateFee + penaltyAccrued`（cap適用後）
  - MVP: オンチェーンでは清算時に確定する（Open中は0のままでも良い）。UIは推定値を表示しても良い
- `amountDueOutstanding`: 未払いの総額（`principalOutstanding + feesOutstanding`）
- `discountCredits`: ローン単位のdiscount原資（AlphaUSD建て、実現利益のみ、下限0）
  - MVP: 単一Strategy Walletで資金が混ざるため、利益はStrategy Poolのsharesで按分して算出する（`pendingProfit` を `discountCredits` として扱う）
- `strategyShares`: Strategy Poolの持ち分（shares）。`delegateInvestableToStrategy` により増える（MVP: `1 share = 1 AlphaUSD delegated`）
- `strategyTotalShares`: Strategy Poolの全shares合計
- `accProfitPerShare`: 実現利益配賦用の累積値（scaled、MVPは `1e18`）
- `rewardDebt`: 既に消費/返却済みの利益（sharesベース）
- `pendingProfit`: 現在このローンが利用できる実現利益（discount原資）
  - `pendingProfit = strategyShares * accProfitPerShare / 1e18 - rewardDebt`
- `repayTargetAmount`: 返済で減らしたい残債額（`0 < repayTargetAmount <= amountDueOutstanding`）
- `discountApplied`: 今回の返済に適用されたdiscount（`min(discountCredits, repayTargetAmount)`）
- `borrowerPayAmount`: 借り手が今回外部から支払う額（`repayTargetAmount - discountApplied`）
- `settlementType`: `paid` 状態の内訳（`repaid` / `liquidated`）

### 収益モデル（ハッカソン版の確定方針）

- 加盟店手数料（Merchant Discount Fee）: `3.0%`
  - 取り方: 加盟店への入金を `price - merchantFee` にする（merchantFeeはPoolの収益原資）
- 消費者手数料: 期日内は `0%`（利息なし）
- 延滞時のみ、事務手数料（late fee）と遅延ペナルティ（後述）を課す

### コスト/負担者

- MVPではユーザー支払い（手数料はAlphaUSD建て）で固定する
  - 追加要件（P1）としてfee sponsorship（運営負担）を検討する

### 加盟店導入要件（MVP: SDK/API）

- 加盟店が用意するもの:
  - 受取アドレス（Tempo EVMアドレス）
  - 認証情報（デモ用のAPIキー）
- 加盟店が行う実装（ハッカソン版の到達ライン）:
  - デモ用のMerchantサイト（EC）に **SDKまたはHTTP API** を導入し、チェックアウト時に請求を作成してBNPL Checkoutへ遷移できる
- 提供物（MVP）:
  - Merchant API（HTTP）:
    - 請求作成（invoice作成→照合ID発行→checkout URL返却）
    - 請求ステータス取得（未払い/支払い済み/ローン開始済み など）
  - Merchant SDK（TypeScript）:
    - 上記APIのthin wrapper（デモサイトから数行で組み込み可能）

#### Merchant API（MVPのインターフェース要件）

- エンドポイント（例）:
  - `POST /api/merchant/invoices`（請求作成）
  - `GET /api/merchant/invoices/:invoiceId`（ステータス取得）
  - `GET /api/merchant/invoices/by-correlation/:correlationId`（ステータス取得）
- 認証:
  - デモ用APIキー方式: `Authorization: Bearer <apiKey>`
- 冪等性:
  - `Idempotency-Key` ヘッダーをサポートし、同一キーでの請求作成は二重作成しない
- エラー:
  - 例: `400`（バリデーション）、`401`（認証）、`409`（冪等性衝突/状態衝突）
- レスポンス（例: 請求作成）:
  - `invoiceId`（オフチェーンID）
  - `correlationId`（オンチェーン照合ID、bytes32相当）
  - `checkoutUrl`
  - `price/principal/merchantFee/merchantPayout/dueTimestamp`
- レスポンス（例: ステータス取得）:
  - `invoiceId/correlationId`
  - `status`（`created` / `loan_opened` / `paid`）
  - `settlementType`（`paid` の内訳: `repaid` / `liquidated`）
  - `amountDueOutstanding/principalOutstanding/feesOutstanding`
  - `dueTimestamp`
  - `merchantPayoutTxHash`（`loan_opened` 以降で返る）

### 技術前提（ハッカソン版）

- Network: Tempo Testnet (Moderato), `chainId=42431`
- 通貨: `USD`（Tempo）
- トークン（TIP-20、decimals=6）:
  - AlphaUSD: `0x20c0000000000000000000000000000000000001`
  - pathUSD（DEX quote）: `0x20c0000000000000000000000000000000000000`

### 価値配分

- 貸し手（Lender）の収益:
  - 加盟店手数料（3.0%）と延滞手数料（late fee/遅延ペナルティ）をPoolに蓄積し、預け入れ比率に応じて分配される
  - 利回りは「貸付実行数（取扱高）」に依存し、一定期間の利回りを保証しない
- 消費者（Borrower）のdiscount:
  - DEX運用の実現PnL（>=0）のみを返済原資に充当し、消費者が外部から支払う必要額を減らす
  - discountによってPoolの受取額が減らないようにする（discount分は運用益からPoolへ支払われる）

### discount精算タイミング（MVPで固定）

- discountは返済時に適用する
  - 実現利益（AlphaUSD建て、下限0）は **Discount Vault（プロトコル管理の残高）** に蓄積される（Pool資産と分離）
    - keeper/operator が `harvestProfit` で「実現利益」をDiscount Vaultへ回収し、`accProfitPerShare` を更新する
    - 各ローンの `discountCredits` は `strategyShares` に対して按分された `pendingProfit` としてオンチェーンで算出できる
    - `discountCredits` はBorrower側の原資（運用益）であり、Poolの `totalAssets` には含めない（返済時にPoolへ支払われる）
    - ローン完了時に未使用の `discountCredits`（= `pendingProfit`）がある場合はBorrowerへ返す
  - `repay`（部分返済）では `repayTargetAmount`（減らしたい残債額）に対して以下を適用する
    - `discountApplied = min(discountCredits, repayTargetAmount)`
    - `borrowerPayAmount = repayTargetAmount - discountApplied`
    - 返済充当順序は `feesOutstanding -> principalOutstanding`
  - `discountCredits` が不足する場合はdiscountは自動的に減額される（Poolへの支払必要額を優先）

### Pool会計（share方式の資産定義）

- `totalAssets` は以下の合算（ハッカソン版は担保/清算によりbad debtを起こさない前提）:
  - `cash`: Poolコントラクトが保有するAlphaUSD残高
  - `receivables`: 未回収の貸付債権（各ローンの `amountDueOutstanding` の合算）
- ローン開始時（`principal=price` のMVP）:
  - `cash` は `merchantPayout` 減少する
  - `receivables` は `principal` 増加する
  - その結果、`totalAssets` は `merchantFee` 分だけ増加する（加盟店手数料がLender収益として蓄積される）
- sharesのmint/burnは `totalAssets` を用いて計算する
- 引き出しは `cash` の範囲でのみ成立し、足りない場合はrevertし得る（UXとして許容）

### 担保率と運用資金のルール（ハッカソン版の確定値）

- 最小担保率（Collateral Ratio）: `125%`（= LTV 80%）
  - 例: `collateralDeposit=1000` のとき `principal<=800`
- 運用資金は「最低担保」を毀損しない範囲でのみ使用する（Pool保護を最優先）
  - `reservedCollateral = principal * 125%`（この分は運用に回さず、常にコントラクト内で温存する）
  - `maxInvestRatio = 50%`
  - `investableCollateral = min(collateralDeposit - reservedCollateral, collateralDeposit * maxInvestRatio)`（0未満なら0）
- DEX最小注文（$100相当）に満たない場合は運用しない（discount=0のまま）
- 運用停止トリガー（延滞以外）: `healthFactor < 1.10` で運用停止・ポジション解消が可能
  - `healthFactor = (reservedCollateral + strategyNAV) / amountDueOutstanding`
  - `strategyNAV`: DEX運用口座の資産評価額（AlphaUSD換算、保有トークンの時価評価を含む）
  - `amountDueOutstanding = principalOutstanding + feesOutstanding`（cap適用後）

### strategyNAVの評価方針（ハッカソン版）

- 過大評価を避けるため、NAV評価は保守的に行う
  - `getSellQuote/getBuyQuote` に基づく「不利な側の見積もり」でAlphaUSD換算する
  - 未約定の注文（オーダーブック上の注文）は評価に入れない（=0扱い）

### 実現PnLと `harvestProfit`（ハッカソン版の確定方針）

- discountに使う「実現利益」は `harvestProfit` によってのみ確定する（未実現PnLはdiscountに使わない）
- 運用資金は単一Strategy Walletでプール運用されるため、実現利益は Strategy Pool のsharesで按分される
  - 前提: keeperがDEX注文を解消（cancel/close）し、保有分をAlphaUSDへ戻して「利益額」を確定できる
  - `harvestProfit(profitAmount)`:
    - `profitAmount` を Discount Vaultへ回収する（Pool資産と分離）
    - `accProfitPerShare += profitAmount * 1e18 / strategyTotalShares` を更新し、各ローンの `pendingProfit` が増える
- ローン別 `discountCredits`（利用可能なdiscount原資、下限0）:
  - `discountCredits = pendingProfit = strategyShares * accProfitPerShare / 1e18 - rewardDebt`
  - `repay` で `discountApplied` を使った分だけ `rewardDebt += discountApplied` として消費扱いにする
- 運用元本の返却:
  - 完済/清算で担保を返す前に、operatorが `returnStrategyPrincipal(loanId, amount)` で運用元本をCollateral Vaultへ戻す（MVPの実装容易性を優先）
- 収益が出ない/損失が出た場合:
  - `discountCredits = 0`（負値をdiscountにしない）
  - 損失は `investableCollateral` の範囲でBorrowerが負担し得る（`reservedCollateral` は運用に回さない）
- デモでは「運用を回す -> unwind -> `harvestProfit` -> 返済でdiscount反映」を基本フローとする

## ターゲットユーザー

### プライマリーペルソナ: 加盟店オーナー/運用担当(30-45、EC/デジタル商材)

- 小規模〜中規模ECを運営し、CVR改善・カゴ落ち削減が課題
- 新しい決済手段は導入が面倒だと採用しない
- 入金サイクルが遅いと困る（即時確定が望ましい）
- 注文/請求と入金の照合を簡単にしたい

### セカンダリーペルソナ: 加盟店導入担当エンジニア(25-45、Webエンジニア)

- 目的: 既存ECサイトに決済（BNPL）を短時間で安全に組み込みたい
- 求めるもの: 分かりやすいSDK/API、少ない実装行数、冪等性、エラー仕様、検証手順

### セカンダリーペルソナ: EC購入者(20-40、Web3非専門)

- 高額商品を「今すぐ欲しい」が、一括払いは避けたい
- BNPLは使うが、手数料や総支払額の増加には敏感
- 面倒な設定なしで「得する」ならDepositも検討する

### セカンダリーペルソナ: 貸し手（Lender）(20-50、DeFiユーザー/運用担当)

- Poolに預けるだけで安定した利回り（merchant fee/late fee）を得たい
- 元本毀損（bad debt）が最も嫌で、担保と清算ルールが明確であることを求める
- いつでも引き出したい（流動性）ため、Poolの利用率や引き出し制約が気になる
- DEX運用益はBorrowerのdiscount原資であり、Lender利回りとは別建てであることを理解している

## 成功指標(KPI)

### プライマリーKPI（ハッカソン版）

- E2Eデモ成功率: 100%（デモスクリプトを最後まで再現できる）
- 運用可視化: 運用注文/約定/PnLがUIまたはExplorerで追跡できる（デモ中に提示）

### セカンダリーKPI

- Consumerの期日内部分返済成功率: 100%
- memo照合成功: 照合ID（`bytes32`）で入金が一意に追える
- Merchant導入デモ成功: デモ用MerchantサイトでSDK/API呼び出しにより請求作成→Checkout遷移→ステータス確認まで一連が通る

### デモスクリプト（検証手順の最小セット）

- 前提:
  - LenderがPoolへ `10,000 AlphaUSD` を預け入れる
  - MerchantデモサイトがSDK/APIで `price=1,000`、期日=14日後 の請求を作成する
  - Borrowerが `collateralDeposit=1,600` をDepositする
    - `reservedCollateral = principal*125% = 1,250`
    - `investableCollateral = min(1,600-1,250=350, 1,600*50%=800) = 350`（DEX最小注文$100を満たす）
- 期待結果:
  - Merchant API/SDKで `invoiceId` と `correlationId(bytes32相当)` と `checkoutUrl` が取得できる
  - BNPL実行時に「Pool/コントラクト→Merchant」へ `merchantPayout=970` の送金が発生する（Borrower→Merchantの直接送金は発生しない）
  - Merchant APIで請求ステータスを取得できる（例: created → loan_opened → paid）
  - Admin/Strategy Dashboardで `orderId` と `strategyNAV` と `実現PnL` を確認できる
  - Borrowerが部分返済でき、discountがあれば支払額が減ることをUIで確認できる

## 機能要件

### 主要な機能一覧（MVP）

- Merchant
  - SDK/APIで請求作成（価格、商品名、期日、返済条件の表示文言）
  - Checkout遷移（Stripe風の組み込み体験）
  - SDK/APIで請求ステータス取得
  - 入金の照合（memo/イベント/ハッシュID）
- Consumer
  - Privyログイン（メール/電話）
  - Deposit（担保）とBNPL開始
  - ローン状況表示（残債、期日、discount、運用状況）
  - 期日内の部分返済（延滞中の任意返済はデモ対象外）
- Lender
  - Lending Poolへ預け入れ/引き出し
  - Poolの収益（merchant fee/late fee）の増加を確認
- Operator（運営/keeper）
  - DEX運用の開始/停止（安全装置）
  - 運用状況（注文ID、NAV、実現PnL、discount原資）の可視化
- Protocol
  - Lending Pool（貸し手資金の入出金、貸付、返済受領）
  - ローン台帳（オンチェーン）
  - DEX運用（flip orderの発注/監視/再配置）
  - discount計算（実現PnLの範囲でのみ、上限は「消費者の支払必要額」）
  - 延滞清算（担保からの回収）

### コア機能(MVP)

#### 1. Merchant: 商品/請求作成とCheckout提供

**ユーザーストーリー**:
加盟店として、既存のECサイトに後払い（Yield Discount付き）を導入するために、SDK/APIで請求を作成し、ユーザーをCheckoutへ遷移させたい

**受け入れ条件**:

- [ ] Merchant APIまたはSDKで、商品名・金額（USD相当）・期日（例: 14日後）を指定して請求を作成できる
- [ ] API/SDKのレスポンスとしてCheckoutリンク（URL）が返り、Consumerがアクセスできる
- [ ] 請求ID（invoiceId）が生成され、オンチェーン照合ID（`correlationId`、`bytes32`相当）が同時に発行される（invoiceIdそのものはオンチェーンに載せない）
- [ ] 加盟店入金額が `price - merchantFee` であることが画面に表示される（merchantFeeは固定3.0%）
- [ ] デモ用MerchantサイトにSDK/APIが導入され、購入ボタンからCheckoutへ遷移できる
- [ ] 請求作成APIは `Idempotency-Key` により二重作成を防止できる

#### 1.1. Merchant: 請求ステータス取得（SDK/API）

**ユーザーストーリー**:
加盟店として、注文処理と照合のために、請求が「作成済み/ローン開始/支払い済み」かをAPIで取得したい

**受け入れ条件**:

- [ ] `invoiceId` または `correlationId` で請求ステータスを取得できる
- [ ] ステータスは少なくとも `created` / `loan_opened` / `paid` を持つ
- [ ] ステータス取得は認証が必須（APIキー）
- [ ] 状態遷移が定義されている（`created -> loan_opened -> paid`）
  - `created`: 請求作成済み（未BNPL実行）
  - `loan_opened`: BNPL実行済み（加盟店への `merchantPayout` 送金が完了）
  - `paid`: `amountDueOutstanding = 0`（返済完了または清算完了）
- [ ] 部分返済が行われても `status=loan_opened` のまま、`amountDueOutstanding` が減少する
- [ ] `paid` の場合 `settlementType` が返り、`repaid`（完済）/`liquidated`（担保清算）を区別できる

**優先度**: P0(必須)

#### 2. Consumer: PrivyログインとBNPL Checkout（Deposit担保 + 加盟店へ即時支払い）

**ユーザーストーリー**:
購入者として、簡単にログインして後払いで購入するために、メール/電話でログインし、DepositしてBNPLを開始したい

**受け入れ条件**:

- [ ] メール/電話でログインするとウォレットが自動作成される（Privy）
- [ ] Checkout画面で、価格・返済期日・必要Deposit（担保）・遅延ペナルティ・「discountのルール（実現PnLのみ、下限0）」が表示される
- [ ] BNPL実行により、Lending PoolからMerchantへ即時支払いが行われる（Tempoの安定通貨送金）
- [ ] 支払いと請求が「照合ID（bytes32）」で照合できる（memoまたはイベント）
- [ ] 必要Deposit（担保）は `collateralDeposit >= principal * 125%` を満たす
- [ ] Checkout画面に `reservedCollateral` と `investableCollateral`（運用に回る最大額）が表示される

**優先度**: P0(必須)

#### 3. Protocol: ローン台帳（オンチェーン）とdiscount計算

**ユーザーストーリー**:
プロトコルとして、運用益で返済額をdiscountするために、ローン状態・返済・discount適用をオンチェーンで正しく管理したい

**受け入れ条件**:

- [ ] ローンがオンチェーンで作成され、principal/dueTimestamp/collateralDeposit/merchantFee/照合IDが記録される
- [ ] 期日+グレース期間まで任意額で部分返済でき、残債が更新される（延滞中の任意返済はMVPスコープ外）
- [ ] discountは「実現PnL（>=0）のみ」を原資とし、消費者が支払う必要額から差し引かれる（上限は「消費者の支払必要額」まで）
- [ ] 未実現PnLはdiscountに含めない（デモの一貫性のため）
- [ ] ローン終了時にDeposit（担保）残高が返却される（完済なら全額、清算なら残額）

#### 3.1. Lending Pool（貸し手資金）

**ユーザーストーリー**:
貸し手として、BNPLの貸付原資を提供するために、流動性をPoolへ預け入れ、返済と手数料を受け取りたい

**受け入れ条件**:

- [ ] Poolへ誰でも預け入れ/引き出しができる
- [ ] 引き出しは「即時」だが、Poolの利用率によっては流動性不足でrevertし得る（ハッカソン版はこのシンプル仕様で良い）
- [ ] ローン開始時にPoolから加盟店への支払いが行われる
- [ ] 返済はPoolに戻り、Poolの残高が増える（返済+延滞手数料）
- [ ] 加盟店手数料（3.0%）はローン開始時の会計（`cash -= merchantPayout`、`receivables += principal`）により `totalAssets` の増加として説明できる（MVPでは `principal=price` のため増加分は `merchantFee`）
- [ ] 返済により `receivables` が減り `cash` が増える（`principalOutstanding` の返済は資産内の置換であり、late fee/penalty/merchant feeのみが純増要因）
- [ ] Poolの残高計算は「share方式」とする（実装容易性を優先）
  - `deposit`: sharesをmint（`shares = amount * totalShares / totalAssets`、初回は1:1）
  - `withdraw`: sharesをburnしてassetsを返す（`assets = shares * totalAssets / totalShares`）
  - 収益が入ると `totalAssets` が増え、share価格が上がる
- [ ] `totalAssets` の定義が明示され、`cash` と `receivables` を含む（ビジネス要件の定義に従う）

**優先度**: P0(必須)

#### 4. Yield運用: TempoネイティブDEXでのflip order Market Making

**ユーザーストーリー**:
購入者として、Deposit後にkeeperにより運用が走り、運用益がdiscountに反映されることを確認したい（デモではOperator操作で開始してよい）

**受け入れ条件**:

- [ ] keeper（ボット）が `Actions.dex.placeFlipSync` を用いて注文を出せる
- [ ] Web UI（Admin/Strategy Dashboard）で運用状態を可視化できる（最低限: `orderId`、現在のbest bid/ask、strategyNAV、実現PnL、discount原資）
- [ ] 実現PnL（>=0）がdiscount原資として集計され、返済時に適用される

**運用対象（MVPで固定）**:

- 取引ペア: `AlphaUSD` / `pathUSD`
- 初期パラメータ:
  - `type=sell`（AlphaUSDを売ってpathUSDを得る。初期在庫がAlphaUSDのためsell-startで始める）
  - `tick=1.001`、`flipTick=0.999`
  - 注文額: Strategy Walletに委任された合計残高の範囲（`sum(investableCollateral)`、ただしDEX最小注文$100以上）

**成立条件（ハッカソン版の確定方針）**:

- DEX最小注文（$100相当）に満たない場合は運用しない（Yield=0、discount=0）
- 運用が走らない/約定しない場合でもBNPLは成立する（discountはベストエフォート）
- 損失が出た場合:
  - discountは0（負値をdiscountにしない）
  - `investableCollateral` の範囲でのみ損失が発生し得る（`reservedCollateral` は運用に回さない）
  - `healthFactor < 1.10` の場合は運用を停止し、ポジションを解消してAlphaUSDへ回収する（運用ポジションの解消。担保清算とは別）

**優先度**: P0(必須)

#### 4.1. Operator（運営/keeper）: 運用の開始/停止・回収

**ユーザーストーリー**:
運営として、Poolの安全性を守るために、DEX運用を開始/停止し、必要ならポジションを解消して回収したい

**受け入れ条件**:

- [ ] Operatorが運用の開始/停止を実行できる
- [ ] Operatorが「全ポジション解消→AlphaUSD回収」を実行できる
- [ ] これらの操作は権限（operator）で保護される（ハッカソン版は運営のみで良い）

#### 5. Consumer: 期日内の部分返済（MVP）

**ユーザーストーリー**:
購入者として、都合の良いタイミングで返済したいので、期日内（+グレース期間まで）に任意額で部分返済したい

**受け入れ条件**:

- [ ] 期日+グレース期間まで、任意額で部分返済できる（0 < `repayTargetAmount` <= `amountDueOutstanding`）
- [ ] `repayTargetAmount` は「減らしたい残債額」を指し、実際のBorrower支払額は `borrowerPayAmount = repayTargetAmount - discountApplied` となる
- [ ] 返済後、残債・discount適用額・支払履歴が更新される
- [ ] 返済トランザクションがExplorerで確認できる

**優先度**: P0(必須)

#### 6. 延滞の扱い（一般的BNPLに寄せる）

**ユーザーストーリー**:
加盟店として、支払い期限が守られない場合に備えたいので、期日超過時のペナルティルールが欲しい

**受け入れ条件**:

- [ ] 期日までは消費者利息は発生しない（0%）
- [ ] 期日超過後は、グレース期間後に遅延ペナルティが発生する（MVPでは清算時に一括計算して確定する）
- [ ] ペナルティには上限（cap）があり、過大な増加にならない
- [ ] 延滞が発生した場合、担保Depositからの清算により回収できる（MVPは `reservedCollateral` と penalty cap により不足が起きない前提。想定外に不足した場合の扱いはスコープ外）

**優先度**: P0(必須)

**ハッカソン版の確定ルール**:

- 期日: loan作成時に指定（デフォルト例: 14日後）
- グレース期間: `3日`
- 事務手数料（late fee）: `5 USD`（固定、初回延滞時に1回のみ）
- 遅延ペナルティ: `0.10%/日`（`principalOutstanding` に対してsimple、複利なし）
- ペナルティ上限: `principalの10%`（cap、late fee含む）
- 清算順序: late fee/遅延ペナルティ → principal（MVPでは清算時にこの順で充当。延滞中の任意返済はデモ対象外）

#### 7. 清算（延滞・担保不足時の回収）

**ユーザーストーリー**:
貸し手として、延滞や担保不足が起きても元本を守れるように、担保から自動で回収できるようにしたい

**受け入れ条件**:

- [ ] 期日+グレース期間を過ぎたローンは清算可能（担保から回収し、Poolへ返す）
- [ ] 清算時はまず運用ポジションを解消してAlphaUSDへ回収し、その後に担保を充当する
- [ ] `reservedCollateral` は `amountDueOutstanding`（penalty cap適用後）をカバーできるように設計し、ハッカソン版ではbad debtが起きない制約を置く（例: 運用は `investableCollateral` のみ）
- [ ] 清算実行者はOperator（運営）のみとする（ハッカソン版の実装容易性を優先）
- [ ] 清算は「全額清算のみ」とし、partial liquidationは行わない（実装を単純化）

**ハッカソン版の確定手順**:

- トリガー: `block.timestamp > dueTimestamp + gracePeriod` かつ `amountDueOutstanding > 0`
- 手順（Operatorが1txで実行できる範囲を優先）:
  - 1. DEX運用ポジションの解消（cancel/close）→ AlphaUSDへ戻す →（任意）`harvestProfit` で利益をDiscount Vaultへ回収し、必要なら `returnStrategyPrincipal` で元本をCollateral Vaultへ返却
  - 2. 清算時に `feesOutstanding`（late fee/penalty、cap適用）を確定し、`feesOutstanding -> principalOutstanding` の順に充当してPoolへ送金する
  - 3. ローンをクローズし `settlementType=liquidated` として記録する
  - 4. 余剰担保がある場合はBorrowerへ返却する（清算時は「残額のみ返る」）

### 将来的な機能(Post-MVP)

#### AIエージェントの高度化（提案→自動実行まで）

- spread/在庫/停止条件などのパラメータ最適化
- 異常検知と自動停止（kill switch）
- 複数ペア対応、裁定戦略、Fee AMM LPなど複数戦略の統合

**優先度**: P2(できれば)

#### 加盟店API/SDKの拡充

MVPでSDK/APIを提供した上で、より本番に近づける拡充。

- Webhook（支払い完了/延滞/清算など）、署名付きイベント
- 請求キャンセル/返金API
- Shopify/WooCommerce等のプラグイン

**優先度**: P2(できれば)

## 次の設計で詰める点（Functional DesignのToDo）

- 資金フロー図（Pool / Collateral Vault / Strategy / Discount Vault のトークン移動と責務分離）
- オンチェーンイベント設計（最低限 `LoanOpened` / `Repaid` / `StrategyProfitHarvested` / `Liquidated`）と、Merchant Status更新の紐付け
- Merchant API/SDKのrequest/responseスキーマ（バリデーション、`Idempotency-Key` 衝突時の `409` 条件）
- Operator Dashboardの最小画面と操作（start/stop/harvestProfit/liquidate）をUIとコントラクト関数に1:1で対応付け

## 非機能要件

### パフォーマンス

- Checkout操作（UI）: 主要操作が体感で1秒以内に反応する（ローディング表示含む）
- 取得系（板/注文）: 10秒以内に更新できる（デモではポーリングでも可）

### ユーザビリティ

- 新規ユーザーがメール/電話ログインからBNPL実行まで3分以内に到達できる
- 重要用語（Deposit/discount/期日/延滞）がUI上で説明される

### 信頼性

- ローン台帳と返済はオンチェーンを正とし、UI/DBが壊れても復元可能である
- keeperが停止しても、ローン返済・完済・Deposit返却ができる

### セキュリティ

- discount適用は上限付き（残債を超えない）
- keeper/AIが暴走しても過大発注できない（コントラクトでパラメータ上限）
- 入力値バリデーション（amount、dueTimestamp、memo、slippageなど）

### プライバシー

- オンチェーンにPII（メール/電話など）を記録しない
- memoには生の請求IDを入れず、ランダム生成の照合ID（`correlationId`、bytes32相当）を用いる（対応関係はオフチェーンDB）
- 公開チェーン上では送金元/送金先/金額が第三者から観測され得る前提を明示し、ハッカソン版では「データ最小化/選択的開示」を実装する
- P0（実装可能）: 支払いは常にPool/コントラクト経由とし、第三者の観測では「borrower→merchant」の直接支払いが発生しない状態にする
  - 受け入れ条件: Explorer上で、Checkout 1件につき「Borrower→MerchantへのTransfer」が存在しないことを確認できる
- P0（実装可能）: UI上で「公開チェーンで見える情報/見えない情報」を明示する
- P1（Tempo対応が出たら）: Tempoのネイティブなopt-inプライバシー（private balances / confidential transfers / selective disclosure）が利用可能になった場合、Payment Adapterでprivate送金へ差し替える

### スケーラビリティ

- 単一Merchant/単一ペアのデモから、将来的に複数Merchant/複数ペアに拡張できる設計

## スコープ外

明示的にスコープ外とする項目:

- 無担保BNPL（担保なしで貸し倒れリスクを取る与信）
- 厳密な与信モデル（信用スコア、KYC/AML）
- 返金/キャンセル/チャージバック対応（ハッカソン版では扱わない）
  - チャージバック: カード決済で「購入者の異議申立て」により決済が強制的に取り消される仕組み
- 本番運用レベルのリスク管理（オラクル、ヘッジ、保険）
- すべてのYield手段（arb、LP、複数戦略）の完全実装
