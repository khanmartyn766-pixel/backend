# 微信小程序版本

本目录是由网页版刷题应用迁移的微信小程序实现。

## 已实现
- 本地加载 `data/seed_bank.js` 题库（由 `seed_bank.json` 转换）
- 首页（章节/范围/顺序随机）
- 练习页（单选/多选/判断/简答）
- 错题本页
- 本地进度与错题持久化（`wx.setStorageSync`）
- 学生门禁登录（手机号+邀请码，学号可选）
- 设备标识上报（用于后端设备数限制）

## 使用方式
1. 打开微信开发者工具。
2. 选择本目录：`/Users/apple/Downloads/专升本/wechat-miniprogram`。
3. 在 `project.config.json` 替换 `appid` 为你自己的小程序 AppID。
4. 在 `config.js` 填写后端地址 `API_BASE_URL`。
5. 预览调试，确认后提交审核。
