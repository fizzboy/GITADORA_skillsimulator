# GD Pocket Board

GitHub Pages + Supabase で動作する GD Pocket Board の初期版です。

## 1. Supabase

1. Supabaseでプロジェクトを作成
2. SQL Editorを開く
3. `supabase/schema.sql` を全文貼り付けて実行
4. Authentication > Providers > Email を開く
5. **Confirm email をOFF**にする

このアプリは「登録名 + パスワード」のUIにするため、登録名から内部的に
`登録名@users.gd-pocket-board.local` というAuth用メールアドレスを生成しています。

## 2. GitHub

`js/config.js` を開き、

- YOUR_SUPABASE_URL
- YOUR_SUPABASE_ANON_KEY

を自分のSupabaseプロジェクトの値に変更します。

Supabaseの Project Settings > API から確認できます。
**service_role key は絶対に使わないでください。**

その後、このフォルダをGitHubリポジトリにpushします。

## 3. GitHub Pages

GitHubリポジトリの Settings > Pages で
Deploy from a branch / main / root を選択して公開できます。

## データ構造

- profiles: ユーザー
- songs: 曲・パート・難易度マスター
- user_scores: ユーザーごとの達成率

Skillは `my_score_details` view で

`難易度 × 20 × 達成率 ÷ 100`

を小数点第3位以下切り捨てして算出します。

例:
8.20 × 20 × 80.00 / 100 = 131.20


## Cloudflare Turnstile
- Provider: Cloudflare Turnstile
- Site Key is public and stored in `js/config.js`.
- Secret Key must exist only in Supabase Authentication > Attack Protection and must never be committed to GitHub.
