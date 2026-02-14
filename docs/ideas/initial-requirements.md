# Initial Requirements (Idea Freeze)

## プロダクト名（仮）
YieldDiscount BNPL

## 一言コンセプト
「後払い + 自動資産運用」で、運用益ぶんだけ支払い額が安くなるBNPL。加盟店はStripe級に簡単導入。

## 背景 / 解決したい課題
- BNPLは利便性が高いが、ユーザ側の金銭的メリットが薄く、加盟店手数料も含め“既存の後払い”との差別化が難しい
- Web3決済はUX/導入が難しく、加盟店にとって導入障壁が高い
- Tempoは安定通貨決済・ネイティブDEX・memos・並列TX等により「決済」と「運用」を近い距離で組み合わせられる

## 価値提案（2本柱）
### 1) 加盟店: 導入が簡単
- SDK/APIで導入（Stripe風）
- 受け取りは即時確定（安定通貨、Tempo）
- 注文/請求書IDをmemoで照合できる

### 2) 消費者: Depositするだけで「運用 + BNPL」
- 事前にDeposit（担保/コラテラル）すると、プロトコルがその一部をTempoネイティブDEXで自動運用
- 加盟店への即時支払いは「貸し手の流動性（Lending Pool）」から行い、購入者は後日返済する（BNPLとして成立）
- 運用益（実現PnL）を返済原資に充当し、購入者が実際に支払う額をdiscountする

### 3) 貸し手: Poolに預けるだけで利回り
- 誰でもLending Poolに預け入れできる
- 収益原資は加盟店手数料（例: 3%）と延滞手数料
- 預け入れ比率に応じてPool残高が増え、引き出し時に利回りを獲得する

## ハッカソンの位置付け（Track）
- Track 1（Consumer Payments）: Privyでメール/電話ログイン、ウォレット自動作成、低摩擦Checkout
- Track 2（Stablecoin Infrastructure）: DEX運用でYieldを生み、discountに反映

## ターゲットユーザー（プライマリーペルソナ）
### Persona A: 加盟店オーナー/運用担当
- 目的: 簡単にBNPLを導入してCVRを上げたい
- 求めるもの: 早い導入、分かりやすい手数料/入金、決済照合

### Persona B: EC購入者（Web3に詳しくない想定）
- 目的: 今すぐ買って後で払いたい。さらに支払い総額を下げたい
- 求めるもの: ログインが簡単、返済が柔軟、運用は自動、損失が出ても破綻しない設計

## コア体験（P0デモシナリオ）
1. Merchantが商品/請求を作成し、Checkoutリンクを発行
2. Consumerがメール/電話でログイン（Privy）
3. ConsumerがDeposit（担保）して「Pay Later（Yield Discount付き）」を実行
4. Lending PoolがMerchantへ即時支払い（Tempoの送金、memoで照合）
5. 運用ボットがDEXにflip orderを出して運用（スプレッド収益）
6. Consumerが任意額を部分返済
7. 運用益がdiscountとして反映され、実支払額が下がったことをUIで確認

## Yield（P0: DEX flip order中心）
### 目標
TempoネイティブDEXでのMarket Making（flip order）により、スプレッド収益（実現PnL）を得る。

### 実行イメージ（tempo.ts）
- flip注文の発行: `Actions.dex.placeFlipSync(...)`
- 板/約定監視: `Actions.dex.getOrderbook(...)` / `Actions.dex.watchOrderFilled(...)`
- パラメータ: `tick` / `flipTick` / `amount` / `spread`

## AIエージェントの位置付け（現実的な範囲）
- AIは「自由裁量トレード」ではなく、運用ルールのパラメータ提案・説明生成・異常検知に使う
- 実行はkeeper（ボット）が行い、コントラクト側で上限/下限などのリスク制限を強制する

## 返済モデル（いつでも部分返済）と延滞の扱い
- 返済: 期日前後を問わず、任意タイミング/任意額で部分返済可能
- BNPLらしさ: 「利息ゼロ（または固定手数料）+ 延滞時のみペナルティ」を基本とする
- ハッカソン版の方針（案。PRDで数値確定）:
  - 期日までは固定手数料のみ
  - 期日超過後は、グレース期間 + 遅延損害金（例: 日次 or 月次）+ 上限（cap）を設定

## MVP機能（P0）
- Merchant
  - SDK/APIで商品/請求作成（amount, memo/invoiceId）
  - Checkout導入（デモ用Merchantサイトに組み込み）
  - 入金履歴・照合（memo/イベント）
- Consumer
  - Privyログイン
  - Deposit（担保） + BNPL実行
  - Loan状態表示（残債、discount、運用状況）
  - いつでも部分返済
- Lender / Pool（デモでは運営がシードでも可）
  - 誰でもLending Poolに流動性を供給し、貸付原資を提供
  - 加盟店手数料/延滞手数料を収益として受け取る
- Protocol
  - ローン台帳（オンチェーン）
  - discount計算（実現PnLをベースに上限付き）
  - DEX運用（flip orderの発注/監視/再配置）
  - Lending Pool（貸付・返済・清算）
- Analytics（デモに必要な範囲）
  - PnL/discountの可視化

## スコープ外（今回やらない）
- 複数戦略（flip以外のarb/LP等）の完全対応
- 無担保BNPL（LP資金で貸す等）
- 厳密な信用スコアリング/KYC/与信モデル
- 取引所/オラクル連携による高度なリスク管理

## 主要リスク / 制約
- DEXの最小注文・流動性次第で「必ず儲かる」保証はできない（デモでは運用が走り追跡できることを重視）
- 価格レンジ（tick）により収益機会が限定される可能性
- テストネット環境では出来高が薄い場合がある（デモ用のシナリオ設計が必要）

## 担保率（暫定方針）
- 価格変動リスクは小さい（stablecoin同士）が、DEX運用損失のリスクがあるため最低担保率を置く
- ハッカソン版は `collateralDeposit >= principal * 125%` を採用（投資上限50%と運用停止/回収条件を組み合わせてPool安全性を担保）

## プライバシー方針
### ゴール
第三者が「誰が誰に送金したか」「誰がどのローンを使ったか」を追跡しにくくする。

### 現実的な対応（ハッカソン版）
- Tempoは将来的にprivate balances/transfers等のopt-inプライバシー機能を提供予定だが、現時点のテストネットでは一般的に送金は公開情報として扱う前提で設計する
- そのためハッカソン版では以下を優先:
  - オンチェーンにPII（メール/電話など）を載せない
  - memoは生のinvoiceIdを載せず、ハッシュ化したID（bytes32）で照合する（オフチェーンDBで復元）
  - merchant側には「必要最小限の選択的開示」を提供（支払い照合に必要な情報のみ）
  - UI上も履歴表示は最小限（公開されうる情報の明示）
