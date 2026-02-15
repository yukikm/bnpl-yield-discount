# 技術仕様書 (Architecture Design Document)

## 対象スコープ（ハッカソンMVP / P0）

- `docs/product-requirements.md` と `docs/functional-design.md` を技術的に実現するための構成・技術選定・運用前提を定義する
- 本番運用レベルのリスク管理（オラクル、ヘッジ、保険、SLA）はスコープ外（MVPはデモ成功を優先）

## デプロイ/運用（MVP: 単一VM, EC2）

- 1台のEC2で以下を動かす
  - Next.js Web（Protocol: Checkout + Consumer + Dashboard + API）
  - Next.js Web（Merchant Demo: Merchant側デモEC）
  - Keeper Bot（DEX運用 + 状態同期のポーリング）
  - SQLite（Prisma管理）
- Protocol Web と Merchant Demo は別ポートで起動する（例: `3000` と `3001`）。外部公開は `nginx` で振り分ける想定でもよい
- プロセス管理は `systemd` を推奨
  - 落ちても自動再起動でき、ログが `journalctl` に集約される
  - `cron` は可能だが「重複実行の排除（ロック）」が必須になり、MVPでは手戻りが増えやすい

## テクノロジースタック

### 言語・ランタイム

| 技術 | バージョン | 用途 | 選定理由 |
| --- | --- | --- | --- |
| Node.js | 22.x (LTS推奨) | Web/Keeper実行環境 | Next.js/Keeperを同一言語圏で高速に実装するため |
| TypeScript | 5.x | Web/Keeper/SDK | 仕様変更の多いハッカソンで型安全に開発速度を出すため |
| Solidity | 0.8.x | コントラクト | Tempo EVM上で実装しやすく、Foundryで開発体験が良い |

### フレームワーク・ライブラリ

| 技術 | バージョン | 用途 | 選定理由 |
| --- | --- | --- | --- |
| Next.js | 16.x 以上 | Web（Protocol UI/API + Merchantデモ） | UI/サーバー処理を同一スタックで揃え、E2Eを最短で作るため |
| React | 19.x 以上 | UI | Privy/Wallet連携とUI構築のため |
| Tailwind CSS | 3.x 以上 | UI | 画面作成速度を優先 |
| Privy | latest | 認証/Embedded Wallet | Web3非専門ユーザーのオンボーディング最短化 |
| viem | 2.x 以上 | EVM RPC + Tempo Actions | 型安全なTx組み立てと、`viem/tempo` 経由のTempoネイティブActions（DEX等）のため |
| Prisma | latest | DBアクセス/マイグレーション | SQLiteの永続化、migration/seed、簡易ロック実装を最短で行うため |

### 開発ツール

| 技術 | バージョン | 用途 | 選定理由 |
| --- | --- | --- | --- |
| Foundry | latest | コントラクト開発/テスト/デプロイ | Solidityのテスト速度と開発体験が良い |
| ESLint | latest | 静的解析 | MVPでも最低限の品質を担保 |
| Prettier | latest | フォーマット | PR/レビュー負担を減らす |

### 開発手法（MVP）

- 仕様の正は `docs/` とし、破壊的な変更は先にドキュメントへ反映してから実装する
- 主要な品質ゲートは `forge test`（コントラクト）と型チェック/リント（Web/SDK）に寄せる

## システム構成（オフチェーン + オンチェーン）

- オフチェーン
  - Protocol Web(Next.js): Checkout、Consumer画面、Operator Dashboard、Merchant API/Public API
  - Merchant Demo Web(Next.js): Merchant側デモEC（`packages/merchant-sdk` 導入例）
  - DB(SQLite): merchant/invoice/idempotency + keeper状態（ロック/注文ID/最終処理時刻等）
  - Keeper Bot(Node): DEX運用（flip order）、状態同期のポーリング、運用停止/回収補助
  - Strategy Wallet(EOA, 単一): DEX運用実行アカウント（MVPは運営管理）
- オンチェーン（Tempo EVM）
  - LendingPool: Lenderの入出金（shares）とMerchant支払い原資
  - LoanManager: BNPL（open/repay/liquidate）と会計（receivables、`merchantFee` 記録）
  - CollateralVault: Borrower担保の保管と返却/清算
  - DiscountVault: `harvestProfit` で回収した「実現利益（AlphaUSD）」を保管し、返済discount/返却に使用

## ネットワーク/チェーン接続（MVP固定）

| 項目 | 値 |
| --- | --- |
| Network | Tempo Testnet (Moderato) |
| Chain ID | `42431` |
| RPC URL | `https://rpc.moderato.tempo.xyz` |
| Explorer | `https://explore.tempo.xyz` |

### TIP-20（decimals=6）

| Token | Address |
| --- | --- |
| AlphaUSD | `0x20c0000000000000000000000000000000000001` |
| pathUSD (DEX quote) | `0x20c0000000000000000000000000000000000000` |

## データ永続化戦略（SQLite + Prisma）

- DBファイルはEC2の永続ディスク上に置く
  - `DATABASE_URL="file:../.data/app.db"`
  - `.data/` を作ってそこに格納（git管理しない）
  - NOTE: PrismaはSQLite `file:` パスを `prisma/schema.prisma` からの相対で解決するため、repo root に置くには `../` が必要

### Migration/Seed

- 開発: `prisma migrate dev`
- デプロイ: `prisma migrate deploy`
- Seed（デモ用merchant作成など）: `prisma db seed`

## 環境変数/Secrets（MVP）

原則:
- `NEXT_PUBLIC_` はブラウザに露出するので秘密情報を入れない
- 秘密鍵/APIキーはEC2上の環境変数（systemdの `EnvironmentFile` 等）で注入する

| 変数名 | 必須 | どこで使う | 例 | 備考 |
| --- | --- | --- | --- | --- |
| `TEMPO_RPC_URL` | Yes | Web(Server)/Keeper | `https://rpc.moderato.tempo.xyz` | Tempo RPC |
| `TEMPO_CHAIN_ID` | Yes | Web(Server)/Keeper | `42431` | EIP-712/クライアント設定 |
| `DATABASE_URL` | Yes | Protocol Web(Server)/Merchant Demo(Server)/Keeper | `file:../.data/app.db` | Prisma/SQLite |
| `NEXT_PUBLIC_APP_URL` | Yes | Protocol Web(Client) | `https://<domain>` | Checkout URL生成等 |
| `PROTOCOL_API_BASE_URL` | Yes | Merchant Demo(Server) | `https://<protocol-domain>` | Merchant DemoがProtocolのMerchant APIを叩くため |
| `NEXT_PUBLIC_PRIVY_APP_ID` | Yes | Web(Client) | `xxxxx` | Privy |
| `PRIVY_APP_SECRET` | Yes | Web(Server) | `xxxxx` | Privy server SDK |
| `INVOICE_SIGNER_PRIVATE_KEY` | Yes | Web(Server) | `0x...` | EIP-712署名用（推奨: operatorとは別鍵） |
| `KEEPER_PRIVATE_KEY` | Yes | Keeper | `0x...` | DEX注文 + `onlyOperator` Tx送信（MVPはOperator=StrategyWalletでOK） |
| `DEMO_MERCHANT_API_KEY` | Yes | Protocol Web(Server)/Merchant Demo(Server) | `...` | DB seedでハッシュ保存して認証 |
| `LOAN_MANAGER_ADDRESS` | Yes | Web(Server)/Keeper | `0x...` | デプロイ後に設定 |
| `LENDING_POOL_ADDRESS` | Yes | Web(Server)/Keeper | `0x...` | デプロイ後に設定 |
| `COLLATERAL_VAULT_ADDRESS` | Yes | Web(Server)/Keeper | `0x...` | デプロイ後に設定 |
| `DISCOUNT_VAULT_ADDRESS` | Yes | Web(Server)/Keeper | `0x...` | デプロイ後に設定 |
| `ALPHA_USD_ADDRESS` | Yes | Web(Server)/Keeper | `0x20c0...0001` | TIP-20 |
| `PATH_USD_ADDRESS` | Yes | Keeper | `0x20c0...0000` | DEX quote |

## オンチェーン/オフチェーンの状態同期（オンチェーンを正）

- オフチェーンDBは「照合/認証/冪等性/運用の補助」のために持つ
- 支払い成立/返済/清算はオンチェーン（`LoanManager`）を正とする

### Merchant請求ステータス（推奨）

- Merchant APIのステータス取得は、DBのinvoice情報 + オンチェーンの `getLoan(correlationId)` を合成して返す
  - `LoanState.None`: `status=created`
  - `LoanState.Open`: `status=loan_opened`
  - `LoanState.Closed`: `status=paid`（`settlementType=repaid|liquidated`）
- DBの `status` はキャッシュとして更新しても良いが、MVPは「都度オンチェーン照会」で成立する

## Keeper実行モデル（ポーリングで自動運用）

MVP要件:
- 「新規ローンがOpenになったら自動で運用開始」までを自動化する
- 失敗した場合は `discount=0` でBNPL自体は成立する（運用はベストエフォート）

### 推奨: 常駐ポーリング（systemd）

- Keeperは常駐プロセスとして動かし、一定間隔で以下を行う
  - DBから「未処理のinvoice（correlationId）」を取得し、オンチェーン `getLoan` を見て `Open` を検知
  - `delegateInvestableToStrategy(loanId)` を実行
  - Strategy Walletで `Actions.dex.placeFlipSync` を実行し、flip orderを開始
  - `orderId`/実行時刻/簡易ロック等をSQLiteに保存（再起動に備える）

### 代替: cron実行（やるなら最低限これ）

- 例: 1分ごとに `keeper:tick` を叩く構成
- 必須: 二重起動を防ぐロック
  - 例: DBに `keeper_lock` 行を置き、`locked_until` が未来ならexit

## 役割/権限と初期化（デプロイ直後にやること）

### 役割（MVP）

- `owner`: コントラクト初期設定を行う権限（デプロイしたEOA）
- `operator`: `delegateInvestableToStrategy/harvestProfit/returnStrategyPrincipal/liquidate` を実行できる権限（MVPはKeeperのEOA）
- `strategyWallet`: DEX注文を実行するEOA（MVPはoperatorと同一でOK）
- `invoiceSigner`: Merchant APIがEIP-712署名に使用する鍵（推奨: operatorとは別鍵）

### 初期化の手順（MVP）

1. コントラクトをデプロイ（LendingPool / LoanManager / CollateralVault / DiscountVault）
2. `LoanManager` に設定
   - `setOperator(<keeper EOA>)`
   - `setStrategyWallet(<keeper EOA>)`
   - `setInvoiceSigner(<invoice signer EOA>)`
3. `LendingPool` に `LoanManager` を許可（`payMerchant` を `onlyLoanManager` にする等）
4. Vault類に `LoanManager` を許可（LoanManager-onlyで資金移動できるようにする）
5. DB seed（デモ用merchant作成、APIキー登録）
6. Webを起動
7. Keeperを起動

補足:
- 初期化は「Foundry script」または「TypeScriptスクリプト（viem）」で自動化し、デプロイ直後に1コマンドで実行できる形を目指す

## ログ/デバッグ（MVP）

- 目的: デモ中に詰まったときに原因追跡できること
- 方針:
  - Web/API: リクエスト単位で `invoiceId/correlationId` をログに含める
  - Keeper: `loanId(correlationId)`、txHash、DEXの `orderId` を必ずログに含める
  - systemd運用なら `journalctl -u <service>` で確認できる

## セキュリティ（MVP最小）

- 機密情報
  - 秘密鍵（invoiceSigner/keeper）はコードにハードコードしない（環境変数で注入）
  - Merchant APIキーは平文保存しない（ハッシュ化して保存）
- アクセス制御
  - Merchant APIは `Authorization: Bearer <apiKey>` で保護
  - オンチェーンの運用系（`delegateInvestableToStrategy/harvestProfit/returnStrategyPrincipal/liquidate`）は `onlyOperator` で保護
- 改ざん耐性
  - `openLoan` はEIP-712署名を検証し、`merchant/price/dueTimestamp/correlationId` の改ざんをrevertする
- プライバシー
  - オンチェーン照合は `correlationId(bytes32)` を使用し、`invoiceId` はオンチェーンに載せない
  - ただしMVPでは **送金先（merchant）や送金額は公開**（完全な秘匿はP1）

## テスト戦略（MVP）

- コントラクト: Foundryでユニットテスト（open/repay/delegate/harvestProfit/returnStrategyPrincipal/liquidate、会計、イベント）
- API/SDK: 最低限のユニットテスト（idempotency、署名、バリデーション）
- E2E: PRDのデモスクリプトを手順として固定し、毎回同じ順で確認（txHashを記録）

## 技術的制約（MVPで固定）

- 単一Strategy Walletに複数ローンの運用資金を集約して運用する（Strategy Pool）
  - ローンごとのdiscount原資（実現利益）は `strategyShares` に対して按分して算出する（`accProfitPerShare` / `rewardDebt`）
- DEX最小注文（AlphaUSD換算）: `MIN_DEX_ORDER = 100 * 10**6`
- `discountCredits` は実現PnL（>=0）のみ。負値はdiscountにしない
- 延滞中の任意返済はスコープ外。ペナルティは `liquidate()` 実行時に一括確定
- `merchantFee` はオンチェーン（Loan storage / `LoanOpened` event）に記録し、照合可能にする

## スケーラビリティ（将来拡張の方向）

- DB: SQLite -> Postgres/Turso等へ置換し、複数環境/複数インスタンスへ対応
- Keeper/Strategy: Strategy Poolの高度化（複数ペア、在庫/スプレッド制御、複数Wallet運用、リスク管理）
- Merchant: Webhook/署名付きイベントで、Merchant側の同期実装を容易にする

## 依存関係管理

- MVPではまず動くことを優先する
- ただし `pnpm-lock.yaml` で依存は固定し、EC2上で再現できる状態を維持する
