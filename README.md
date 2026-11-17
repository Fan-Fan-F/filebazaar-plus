# FileBazaar Plus

> 基于比特币闪电网络的轻量级数字文件微支付销售系统。
> Lightweight digital file eCommerce store powered by Bitcoin Lightning Network.

[中文文档](#中文文档) | [English Documentation](#english-documentation)

---

## 中文文档

### 简介

FileBazaar Plus 是基于比特币闪电网络（Bitcoin Lightning Network）的轻量级数字商品与文件微支付电商系统。商家只需将待售文件（电子书、音频、视频、图片、压缩包、代码等）放入指定目录，启动服务即可自动生成美观轻量的网页店面。顾客在网页浏览商品，通过闪电网络瞬时结账，并在支付确认后获取安全带时效的专属 HMAC 访问令牌即刻提货。

### 功能与改进点

本项目在原项目基础上针对**商品管理健壮性**、**店面体验与交互提示**、**安全防护**与**离线自测能力**进行了实质性增强，改进点均一一对应 `CHANGES.md`：

1. **修复敏感隐藏目录与系统缓存越权访问安全漏洞（Path Traversal & Hidden Directory Access Fix）**
   - 增强路径解析与安全防护，递归校验所有路径分段（包括 `relpath.split(/[\\/]/)`），彻底阻断针对 `_filebazaar_cache` 预览缓存目录、`.git` 以及任意以 `.` 或 `_` 开头的隐藏敏感文件的探测与越权读取。
   - 全面弃用易引起中文与特殊字符乱码的旧式 `escape()`，换用现代标准的 `encodeURI()` 与 `encodeURIComponent()` 进行规范化 URL 编解码。

2. **修复页面编码声明与商品购买按钮配置不一致 Bug（Charset & Button Config Fix）**
   - 修复原视图模板 `views/layout.pug` 中 HTML 元信息误写为 `meta(chartset='utf-8')` 的低级拼写 Bug，确保中文字符、多币种符号与长篇 Markdown 说明在主流浏览器中稳定渲染。
   - 解决官方示例配置文件 `_filebazaar.yaml` 与代码实现不匹配问题，统一兼容 `button` 与 `buy_button` 两种属性配置，使自定义按钮文案开箱即用。

3. **解耦 Image 预览与 Canvas 强依赖，增加 GraphicsMagick 容错与平滑回退（Preview Resilience & GM Fallback）**
   - 原项目强绑定 `canvas` C++ 原生动态库，在未安装 libcairo 开发库或现代 Node.js 环境下会引发启动阶段崩溃。改造为动态安全探测与按需加载；
   - 当 `canvas` 模块不可用时，系统自动平滑回退至纯 GraphicsMagick（`gm`）图像管道，执行图像半模糊处理、中轴分隔线与 PREVIEW 水印绘制；
   - 完善预览模块并发队列管理，将任务清理逻辑放入 `finally` 块中，并在预览生成异常时妥善返回规范 HTTP 状态码，避免未捕获异常导致服务意外退出。

4. **优化店面支付体验与状态轮询防护机制（Storefront UX & Safe Polling Backoff）**
   - **一键复制发票**：在结账页（`_checkout`）增设「Copy Invoice」一键复制按钮与即时反馈动画，避免用户手动选中长字符串出错。
   - **安全轮询退避**：重写原项目中因 `onerror="this.src=this.src"` 引发的死循环重试 Bug，加入 1.5 秒安全退避延时与防缓存时间戳，防止网络异常时耗尽客户端与服务器资源。
   - **交付体验增强**：在提货页面（`_access`）提供「一键复制专属提货链接」功能与过期倒计时提示；在商品列表目录页（`dir`）新增前端实时搜索过滤栏与商品总数统计。

5. **增加内置 Mock 支付网关与离线自测运行支持（Mock Charge Gateway & Standalone Testability）**
   - 新增内置轻量级 Mock Charge 支付适配层（`src/lib/mock-charge.js`），支持配置 `CHARGE_URL=mock` 或 `MOCK_CHARGE=1`。开发者无需预先搭建复杂的比特币全节点与 c-lightning 即可完整体验与测试发票生成、模拟付款、令牌签发和文件下载全链路。
   - 在应用入口统一引入 `babel-polyfill`，解决预编译环境下缺少 `regeneratorRuntime` 的兼容问题。

### 快速开始

#### 1. 环境准备

确保系统已安装 Node.js（v14 及以上，实测兼容 Node v24）与基础图像处理工具：

```bash
# Ubuntu / Debian
sudo apt-get install graphicsmagick ffmpeg

# 安装项目依赖并编译静态资产
npm install --ignore-scripts
npm run dist
```

#### 2. 本地快速演示模式（无需比特币节点）

无需安装 Lightning Charge，使用内置 Mock 网关直接跑通电商全流程：

```bash
# 初始化配置与商品目录
mkdir -p my-store
node dist/cli.js init my-store

# 放入测试文件
echo "This is a paid digital book." > my-store/book.txt

# 启动服务（监听 9678 端口）
PORT=9678 CHARGE_URL=mock node dist/cli.js my-store
```

访问 `http://localhost:9678/`，即可浏览商品、发起购买并在结账页面点击「[Demo] Simulate Pay」完成模拟支付并提货。

#### 3. 生产环境部署（连接真实闪电网络）

生产环境中，FileBazaar Plus 与 [Lightning Charge](https://github.com/ElementsProject/lightning-charge) 配套运行：

```bash
# 使用环境变量启动
PORT=9678 \
HOST=0.0.0.0 \
URL=https://store.yourdomain.com/ \
TOKEN_SECRET=YOUR_RANDOM_SECRET_KEY \
CHARGE_URL=http://localhost:9112 \
CHARGE_TOKEN=YOUR_LIGHTNING_CHARGE_API_TOKEN \
npm start /path/to/my-store
```

或者在 `my-store/_filebazaar.yaml` 中配置：

```yaml
---
port: 9678
host: 0.0.0.0
url: https://store.yourdomain.com/

charge_url: http://localhost:9112
charge_token: YOUR_LIGHTNING_CHARGE_API_TOKEN

token_secret: YOUR_RANDOM_SECRET_KEY
default_price: 1.00 USD

files:
  book.txt:
    price: 2.50 USD
    button: 立即购买电子书
```

#### 4. 自动化测试

运行内置的 10 项端到端业务与安全自动化测试：

```bash
npm test
```

### 来源与致谢

本项目基于 [filebazaar](https://github.com/ElementsProject/filebazaar) 二次开发，原项目由 ElementsProject 以 MIT 许可证开源。

### 许可证

沿用原许可证，全文见根目录 [LICENSE](LICENSE)。

---

## English Documentation

### Introduction

FileBazaar Plus is a lightweight eCommerce system for selling digital files via the Bitcoin Lightning Network. Store owners can simply place files (ebooks, audio, video, graphics, archives, documents) into a directory, and FileBazaar Plus will automatically generate an elegant, lightning-fast storefront. Customers can browse products, pay instantly using micro-invoices over Lightning, and immediately download purchased items using secure, time-limited HMAC access tokens.

### Key Enhancements

Building on the original project, FileBazaar Plus brings substantive improvements in **product management robustness**, **storefront & checkout UX**, **security protections**, and **out-of-the-box testability** (aligned with `CHANGES.md`):

1. **Path Traversal & Hidden Directory Access Protection**
   - Upgraded path resolution to recursively inspect all path segments (`relpath.split(/[\\/]/)`), completely blocking unauthorized probing and retrieval of internal preview cache (`_filebazaar_cache`), `.git`, and any hidden/dot files.
   - Replaced deprecated, encoding-fragile `escape()` calls with standard `encodeURI()` and `encodeURIComponent()`, preventing UTF-8 character corruption.

2. **Charset Declaration & Product Button Config Bug Fixes**
   - Corrected the typo in `views/layout.pug` (`meta(chartset='utf-8')` -> `meta(charset='utf-8')`), ensuring UTF-8 characters and currency symbols render properly across all modern browsers.
   - Reconciled documentation and template mismatch: both `button` and `buy_button` file properties are now supported, allowing custom button labels configured in `_filebazaar.yaml` to display immediately.

3. **Decoupled Image Previews with Graceful GraphicsMagick Fallback**
   - Decoupled hard dependencies on the `canvas` C++ addon to prevent fatal crashes during server boot in environments without libcairo development packages or modern Node runtimes.
   - Added seamless fallback to GraphicsMagick (`gm`) for half-pixelation, separator lines, and "PREVIEW" watermark generation.
   - Guarded concurrent preview caching with a proper `finally` block, eliminating potential promise deadlocks and unhandled rejections.

4. **Storefront & Checkout UX Enhancements**
   - **One-Click Invoice Copy**: Integrated a "Copy Invoice" button with instant visual confirmation ("Copied!") on the checkout page to avoid manual selection mistakes on long bolt11 strings.
   - **Safe Polling Backoff**: Replaced fragile `onerror="this.src=this.src"` polling with a throttled retry backoff (1.5s delay + timestamp query), preventing CPU spin-loops and server connection flooding during network hiccups.
   - **Delivery & Directory UX**: Added a "Copy Access Link" button on the file delivery page (`_access`), and introduced real-time client-side search filtering and item counts on the directory index (`dir`).

5. **Built-in Mock Charge Gateway & Standalone Testing**
   - Implemented an in-memory Mock Charge gateway (`src/lib/mock-charge.js`) triggered via `CHARGE_URL=mock` or `MOCK_CHARGE=1`. Developers can run through the entire eCommerce lifecycle (invoice creation, payment confirmation, token issuance, and file download) without external Bitcoin or Lightning nodes.
   - Added `babel-polyfill` initialization in `src/app.js` to ensure runtime stability across environments.

### Quickstart

#### 1. Requirements

Ensure Node.js (v14+, verified on Node v24) and media libraries are installed:

```bash
# Ubuntu / Debian
sudo apt-get install graphicsmagick ffmpeg

# Install dependencies and build assets
npm install --ignore-scripts
npm run dist
```

#### 2. Quick Demo Mode (Standalone / Zero Node Dependencies)

Experience the full shopping and payment workflow using the built-in mock gateway:

```bash
# Prepare store folder
mkdir -p my-store
node dist/cli.js init my-store

# Add a sample digital product
echo "Digital art license contents" > my-store/artwork.txt

# Start FileBazaar Plus
PORT=9678 CHARGE_URL=mock node dist/cli.js my-store
```

Open `http://localhost:9678/` in your browser to browse files, generate an invoice, and click "[Demo] Simulate Pay" to unlock and download the file.

#### 3. Production Deployment with Lightning Charge

For production, pair FileBazaar Plus with [Lightning Charge](https://github.com/ElementsProject/lightning-charge):

```bash
PORT=9678 \
HOST=0.0.0.0 \
URL=https://store.yourdomain.com/ \
TOKEN_SECRET=YOUR_RANDOM_SECRET_KEY \
CHARGE_URL=http://localhost:9112 \
CHARGE_TOKEN=YOUR_LIGHTNING_CHARGE_API_TOKEN \
npm start /path/to/my-store
```

Or configure via `my-store/_filebazaar.yaml`:

```yaml
---
port: 9678
host: 0.0.0.0
url: https://store.yourdomain.com/

charge_url: http://localhost:9112
charge_token: YOUR_LIGHTNING_CHARGE_API_TOKEN

token_secret: YOUR_RANDOM_SECRET_KEY
default_price: 0.50 USD

files:
  artwork.txt:
    price: 1.00 USD
    button: Buy this Artwork
```

#### 4. Running Verification Tests

Run the built-in end-to-end test suite:

```bash
npm test
```

### Attribution & Acknowledgments

This project is a secondary development based on [filebazaar](https://github.com/ElementsProject/filebazaar), originally open-sourced by ElementsProject under the MIT License.

### License

Distributed under the MIT License. See [LICENSE](LICENSE) for details.
