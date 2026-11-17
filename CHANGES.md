# 改进记录 CHANGES

本项目基于 [ElementsProject/filebazaar](https://github.com/ElementsProject/filebazaar) 进行二次开发（A 路线），围绕商品管理与交付流程健壮性、店面体验与支付状态提示优化展开实质性改进。

---

## 改进计划与实施内容

### 1. 修复敏感隐藏目录与缓存目录越权访问安全漏洞（Path Traversal & Hidden Directory Access Fix）
- **问题定位**：原 `src/lib/files.js` 在加载文件时仅校验了最终文件名 `name` 是否以 `.` 或 `_` 开头，未对多级相对路径中段做校验。当用户或爬虫请求 `_filebazaar_cache/xxx`、`.git/config` 等内部路径时，能够直接绕过校验读取服务内部缓存文件或潜在敏感信息。
- **实质改进**：
  - 重构路径安全校验，对相对路径的所有各级分段进行遍历校验（`relpath.split(/[\\/]/).some(p => /^[._]/.test(p))`），并严密防范 `..` 路径越级跳转，彻底阻断越权访问隐藏目录及缓存目录。
  - 将原代码中已废弃且对非 ASCII / UTF-8 字符（如中文文件名）会导致编码异常的 `escape()` 全面替换为符合现代标准的 `encodeURI()` 与 `encodeURIComponent()`。

### 2. 修复页面编码声明与商品购买按钮配置不一致 Bug（Charset & Button Config Fix）
- **问题定位**：
  - `views/layout.pug` 第 7 行 HTML 元标签误写为 `meta(chartset='utf-8')`（拼写多了一个 `t`），导致浏览器无法正确声明 UTF-8 编码，非 ASCII 字符（如中文文件名、描述及多币种符号）在某些浏览器下可能出现乱码。
  - 原项目 `_filebazaar.yaml.example` 与 README 示例中商品属性配置为 `button: Buy this book`，但在视图 `views/_preview.pug` 中却硬编码读取 `attr.buy_button`，导致商家按照官方文档配置的自定义购买按钮文案完全无法生效。
- **实质改进**：
  - 修复 `views/layout.pug` 中的拼写错误为 `meta(charset='utf-8')`。
  - 在 `views/_preview.pug` 中统一支持 `attr.button || attr.buy_button`，使官方文档中的配置开箱即用。

### 3. 解耦 Image 预览与 Canvas 强依赖，增加 GraphicsMagick 容错与平滑回退（Preview Resilience & GM Fallback）
- **问题定位**：原 `src/lib/preview/image.js` 硬依赖 `canvas` C++ 原生扩展。在较新的 Node.js 版本（如 Node 20+ / 24+）或未安装完整 cairo/node-gyp 依赖的系统环境中，缺失 `canvas.node` 二进制会导致整个 FileBazaar 服务在启动阶段直接崩溃退出；且 `src/lib/preview.js` 中的并发预览缓存 `_gen[fullpath]` 未在 `finally` 块中清理（原代码遗留 `@TODO in finally`），一旦预览生成抛出异常，会导致该文件并发任务永久死锁。
- **实质改进**：
  - 对 `canvas` 模块实行动态安全检测与按需加载（try-catch），避免因 native 扩展不可用导致整个进程启动失败。
  - 当 `canvas` 不可用时，自动无缝回退至纯 GraphicsMagick（`gm`）管道完成图像半像素化/模糊处理、红线分割与居中 "PREVIEW" 水印合成。
  - 完善 `src/lib/preview.js` 的错误捕获，将 `delete _gen[fullpath]` 移入 `finally` 块中，并在预览失败时返回规范 HTTP 状态码，避免未捕获 Promise 异常触发服务退出。

### 4. 优化店面支付体验与状态轮询防护机制（Storefront UX & Safe Polling Backoff）
- **问题定位**：
  - 结账页面 `views/_checkout.pug` 仅以纯文本 `<pre>` 展示长达数百字符的 Lightning 发票字符串（payreq），缺少一键复制功能，用户手动选中极易漏字符导致付款失败。
  - 客户端长轮询通过 `<img onerror="this.src=this.src">` 探测支付状态，当长轮询接口超时（402）或发生网络抖动时，浏览器会瞬间进入极高频重试死循环，严重消耗客户端 CPU 并对服务端形成雪崩冲击。
- **实质改进**：
  - 在 `views/_checkout.pug` 结账卡片中增加「一键复制发票（Copy Invoice）」交互按钮与「Copied!」即时反馈提示。
  - 重写长轮询失败重试机制（`retryLongpoll`），引入 1.5 秒安全延迟与防缓存时间戳，彻底消除高频重试死循环。
  - 在交付页面 `views/_access.pug` 增加「一键复制专属提货链接（Copy Access Link）」功能，方便消费者保存提货地址。
  - 在目录索引页面 `views/dir.pug` 增加前端实时搜索过滤栏（Filter files by name or type）与文件计数统计，大幅提升多商品浏览体验。

### 5. 增加内置 Mock 支付网关与离线自测运行支持（Mock Charge Gateway & Standalone Testability）
- **问题定位**：原项目强绑定外部运行中的 `lightning-charge` 服务与 Core Lightning 节点。普通开发者在没有搭建完整比特币测试节点的环境下无法将项目跑通完整交易闭环；且编译打包为 CJS 后若直接由 Node 运行，会因缺失 Babel polyfill 抛出 `regeneratorRuntime is not defined`。
- **实质改进**：
  - 新增内置轻量级 Mock Charge 适配器（`src/lib/mock-charge.js`），支持通过环境变量 `CHARGE_URL=mock` 或 `MOCK_CHARGE=1` 启用模拟支付网关，支持发票生成、长轮询等待、模拟付款确认（Simulate Pay），使项目具备零外部依赖完整跑通电商闭环的能力。
  - 在 `src/app.js` 最顶部导入 `babel-polyfill`，解决 Node 直接执行编译文件或应用入口时的运行时环境兼容问题。

---

## 自测记录

- **测试环境**：Linux 7.0.0-44-generic x86_64 / Node.js v24.22.1 / npm 10.9.4 / GraphicsMagick 1.3.46
- **测试时间**：2026-11-17

### 1. 构建与编译测试
- **测试命令**：
  ```bash
  npm install --ignore-scripts
  npm run dist
  ```
- **测试结果**：
  - Babel 成功将 `src/` 转译为 `dist/`，Stylus 成功编译 `static/style.styl` 为 `static/style.css`，exit code 0。

### 2. 命令行与初始化测试
- **测试命令**：
  ```bash
  node dist/cli.js init test-files
  ```
- **测试结果**：
  - 成功在目标目录创建 `_filebazaar.yaml`，并自动生成安全的随机 32 字节 `token_secret`。

### 3. 完整业务闭环与安全自动化测试
- **测试命令**：
  ```bash
  npm test
  # 内部执行 node test_runner.js
  ```
- **测试输出**：
  ```text
  Waiting for FileBazaar server to boot on port 9789...
  Server started successfully!
  Testing Test 1: Directory list & charset...
  ✓ Test 1 passed: Storefront directory listing, UTF-8 charset, search filter verified.
  Testing Test 2: Path traversal & hidden files security...
  ✓ Test 2 passed: Path traversal and hidden/internal file access strictly forbidden (403).
  Testing Test 3: File detail & checkout form...
  ✓ Test 3 passed: File detail page loaded with CSRF token and custom button.
  Testing Test 4: Image preview generation via GM fallback...
  ✓ Test 4 passed: Image preview generated successfully without canvas native binary crash (size: 5986 bytes).
  Testing Test 5: Invoice creation (POST /_invoice)...
  ✓ Test 5 passed: Lightning invoice created successfully with ID: mock_inv_3c8f05b87f7c2fdd
  Testing Test 6: Checkout page UX...
  ✓ Test 6 passed: Checkout page UX enhancements verified.
  Testing Test 7 & 8: Payment simulation and access token issue...
  ✓ Test 7 & 8 passed: Payment confirmed and HMAC access token issued.
  Testing Test 9 & 10: File download and access page...
  ✓ Test 9 & 10 passed: Paid file downloaded successfully with valid HMAC token!

  =========================================
  ALL 10 VERIFICATION TESTS PASSED PERFECTLY!
  =========================================
  ```

### 4. 服务直接启动与运行测试
- **测试命令**：
  ```bash
  PORT=9792 CHARGE_URL=mock TOKEN_SECRET=testsecret npm start test-files
  ```
- **测试结果**：
  - 服务正常监听并输出：
    `FileBazaar serving test-files on port 9792, browse at http://localhost:9792/`
    `Notice: running with Mock Lightning Charge gateway (demo/test mode)`
  - 核心功能验证通过，整体通过。
