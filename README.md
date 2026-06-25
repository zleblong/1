# 今天煮什么

一个给两个人用的点菜小网页。

## 现在能做什么

- 手机打开后输入暗号进入
- 你可以加菜、删菜、按分类看菜单
- 她可以直接选今天想吃的菜
- 如果配了 Supabase，会自动云端同步

## 怎么跑

1. 先把 `config.js` 里的 `passcode` 改成你们自己的暗号。
2. 如果要云端同步，把 `supabaseUrl` 和 `supabaseAnonKey` 填进去。
3. 在 Supabase 里执行 `supabase-schema.sql`。
4. 直接打开 `index.html` 就能看本地版本。
5. 如果浏览器不方便直接开本地文件，可以运行 `serve.ps1` 后访问 `http://127.0.0.1:4173`。

## 数据结构

- `dishes`
- `meal_picks`

## 备注

如果没有配 Supabase，页面会自动退回本地缓存模式，先把界面和流程跑通。
