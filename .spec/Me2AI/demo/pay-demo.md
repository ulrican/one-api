# 支付接入实现指南（AI 编码参考）

> **文档目的**：沉淀本项目已实测跑通的三种支付方式的完整实现步骤，供其他项目接入支付时作为 AI 编码参考。
> **AI 使用方式**：先读第 0 章（通用设计）；再按目标渠道章节（第 1/2/3 章）的步骤顺序实现，代码可直接复用文中已验证的模式；最后按第 4/5 章完成联调验证。
> **可信度声明**：文中代码与行为结论均来自本项目真实联调（真实商户号/应用实测），非理论推测；`<尖括号>` 内容为需替换的实际材料或参数。

| 章节 | 支付方式 | 渠道接口 | 用户操作 | 本项目验证状态 |
|---|---|---|---|---|
| 1 | 微信支付 Native 扫码 | APIv3 `/v3/pay/transactions/native` | 微信扫二维码 | 实测通过 |
| 2 | 支付宝电脑网站支付 | `alipay.trade.page.pay` | 跳转支付宝收银台 | 实测通过（密钥模式） |
| 3 | 支付宝订单码（当面付） | `alipay.trade.precreate` | 支付宝扫二维码 | 实测通过（密钥模式） |

技术基线：Python 3.10+、FastAPI、uvicorn；依赖：`wechatpayv3`、`python-alipay-sdk`、`qrcode`、`python-multipart`。

> **目录**：0 通用设计 ｜ 1 微信 Native 扫码 ｜ 2 支付宝电脑网站支付 ｜ 3 支付宝订单码（当面付） ｜ 4 新项目落地实现顺序清单 ｜ 5 调试与验证 ｜ 6 实测结论速查 ｜ 附录 A 本项目密钥与证书路径清单

---

## 0. 通用设计（所有渠道共用）

### 0.1 模块划分

| 模块 | 职责 | 本项目文件 |
|---|---|---|
| 配置 | 商户参数 + 证书/密钥路径，全部支持环境变量覆盖 | `app/config.py` |
| 渠道封装 | 每渠道一个文件：初始化、下单、查单、回调解析、状态映射 | `app/wechat_pay.py`、`app/alipay_pay.py` |
| 订单存储 | 统一订单模型与状态流转（Demo 用 JSON 文件，生产换数据库） | `app/store.py` |
| 路由层 | HTTP 接口 + 回调路由 + 二维码渲染 | `app/main.py` |
| 演示页 | 下单按钮 + 二维码/跳转 + 轮询查单 | `app/static/index.html` |

### 0.2 订单状态机与记录模型

状态只有四个：`CREATED`（已下单待支付）→ `PAID`（成功）/ `CLOSED`（关闭/超时）/ `FAILED`（失败）。
所有状态变更走统一入口（`update_order` / `mark_paid`），并追加 `events` 日志；`mark_paid` 必须**幂等**（回调与轮询可能并发到达，已 PAID 不重复改写 `paid_at`）。

推荐订单记录字段：

```json
{
  "out_trade_no": "WX20261011123045001234",
  "channel": "wechat | alipay",
  "pay_method": "native | page | qr",
  "description": "测试商品",
  "amount": "0.01",
  "amount_fen": 1,
  "status": "CREATED",
  "trade_no": "",
  "code_url": "",
  "pay_url": "",
  "error": "",
  "created_at": "", "updated_at": "", "paid_at": "",
  "events": [{"time": "", "status": "CREATED", "note": "订单创建"}]
}
```

### 0.3 金额处理铁律

- 对外统一"元字符串，两位小数"（如 `"0.01"`）；
- 微信接口金额用**分（int）**；支付宝接口金额用**元字符串**；
- 校验用 `Decimal`，禁止用 float 直接运算。

```python
from decimal import Decimal, InvalidOperation

def normalize_amount(amount: str) -> tuple[str, int]:
    """返回 (元字符串, 分)；非法金额抛异常/400"""
    try:
        value = Decimal(str(amount)).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError):
        raise ValueError("金额格式不正确")
    if value <= 0:
        raise ValueError("金额必须大于 0")
    return f"{value:.2f}", int(value * 100)
```

### 0.4 商户订单号规则

前缀 + 时间戳 + 6 位随机数（如 `WX20261011123045001234`），全字符满足 `[A-Za-z0-9_-]{6,32}`；创建前必须查重，保证全局唯一（支付宝上限 64 位、微信 6-32 位，统一按 32 位内设计最省心）。

```python
def resolve_out_trade_no(value: str | None, prefix: str) -> str:
    value = (value or "").strip()
    if not value:
        ts = datetime.now().strftime("%Y%m%d%H%M%S")
        return f"{prefix}{ts}{random.randint(0, 999999):06d}"
    if not re.fullmatch(r"[A-Za-z0-9_-]{6,32}", value):
        raise ValueError("商户订单号需为 6-32 位字母/数字/下划线/中划线")
    if store.get_order(value):
        raise ValueError(f"订单号已存在：{value}")
    return value
```

### 0.5 支付结果双通道：异步通知 + 主动查单

- **异步通知（notify_url）**：生产环境主通道；
- **主动查单**：本地开发 notify_url 不可达时的必须兜底，也是防"丢回调"的对账手段；
- 回调与查单两条路径都汇入幂等的 `mark_paid`，谁先到以谁为准，不会重复计账；
- 前端在展示二维码/跳转后按 3 秒间隔轮询查单接口，直到 `PAID`/`CLOSED` 或超时（5 分钟）停止。

```javascript
const timer = setInterval(async () => {
  const r = await fetch(`/api/orders/${channel}/${outTradeNo}`).then(x => x.json());
  if (r.status === 'PAID') { clearInterval(timer); renderPaid(r); }
}, 3000);
```

### 0.6 回调安全底线

- 必须**验签通过**才更新订单：微信 = 验签 + AES-GCM 解密 `resource`（用 APIv3 密钥）；支付宝 = RSA2 验签；
- 建议顺带校验回调中的金额与本地订单一致，防止篡改/串单；
- 应答规范（决定渠道是否重推）：
  - 微信：成功必须 `200` + `{"code": "SUCCESS", "message": "成功"}`；异常返回 5xx 或 code=FAIL 会触发微信重试；
  - 支付宝：成功返回纯文本 `success`，否则返回 `failure`（支付宝会重试）。

### 0.7 本地订单存储（Demo 模式）

JSON 文件 + 线程锁 + 临时文件原子替换，保证并发写不损坏：

```python
_lock = threading.RLock()

def _save(data: dict) -> None:
    path = _file_path()
    tmp = path.with_suffix(".json.tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)   # 原子替换，避免写一半被读到
```

生产项目替换为数据库时，保持对外接口签名不变：`create_order / get_order / update_order / mark_paid / list_orders`。

---

## 1. 微信支付 APIv3 · Native 扫码支付

### 1.1 步骤 1：准备商户材料（商户平台）

| 材料 | 说明 |
|---|---|
| 商户号 mchid | 商户平台账号 |
| appID | 已与该商户号绑定的公众号/小程序 AppID |
| APIv3 密钥 | 商户平台-账户中心-API安全 设置（32 位） |
| 商户 API 证书 | 商户平台下载，含 `apiclient_key.pem`（私钥）与证书序列号 |
| notify_url | 支付回调地址，需公网可直连（生产建议 HTTPS，不能带参数串） |

### 1.2 步骤 2：确定验签模式（平台证书 vs 微信支付公钥）

2026 年起新开通商户默认使用**"微信支付公钥"模式**（不再有平台证书接口）。判断方法：

- 请求 `GET /v3/certificates`：
  - 返回 200 → 老商户，**平台证书模式**（wechatpayv3 可自动下载并缓存到 `cert_dir`）；
  - 返回 404 `RESOURCE_NOT_EXISTS`（提示"无可用的平台证书，请在商户平台-API安全申请使用微信支付公钥"），且响应头 `Wechatpay-Serial: PUB_KEY_ID_*` → 新商户，**公钥模式**：到商户平台-账户中心-API安全下载"微信支付公钥"（PEM），并记录公钥 ID（形如 `PUB_KEY_ID_0117468575642...`）。
- 两套材料都没有时，可先用 1.4 的**降级模式**把链路跑通，但生产必须补全公钥恢复完整验签。

### 1.3 步骤 3：安装依赖与配置

```bash
pip install wechatpayv3
```

```python
WECHAT = {
    "mchid": os.getenv("WXPAY_MCHID", "<商户号>"),
    "appid": os.getenv("WXPAY_APPID", "<AppID>"),
    "cert_serial_no": os.getenv("WXPAY_CERT_SERIAL_NO", "<商户证书序列号（40位大写HEX）>"),
    "apiv3_key": os.getenv("WXPAY_APIV3_KEY", "<32位APIv3密钥>"),
    "private_key_path": "certs/apiclient_key.pem",
    "platform_cert_dir": "data/wechat_platform_certs",   # 平台证书缓存目录
    "public_key_path": os.getenv("WXPAY_PUBLIC_KEY_PATH", "certs/wechat_public_key.pem"),
    "public_key_id": os.getenv("WXPAY_PUBLIC_KEY_ID", "PUB_KEY_ID_<公钥ID>"),
    "notify_url": f"{BASE_URL}/api/wechat/notify",
}
```

### 1.4 步骤 4：初始化 WeChatPay（公钥优先 + 降级容错，已验证写法）

```python
from wechatpayv3 import WeChatPay, WeChatPayType

def load_platform_public_key() -> tuple[str | None, str | None]:
    """读取微信支付公钥；未下载公钥文件时返回 (None, None) 走降级模式"""
    path = Path(config.WECHAT["public_key_path"])
    if not path.exists():
        return None, None
    key_id = (config.WECHAT.get("public_key_id") or "").strip()
    if not key_id:
        raise WeChatPayError("已配置微信支付公钥文件，但缺少公钥ID（PUB_KEY_ID_ 开头）")
    return path.read_text(encoding="utf-8"), key_id

def enable_verification_fallback() -> None:
    """降级模式：未配置公钥且平台证书不可用时，跳过微信应答验签。

    仅影响应答签名校验；HTTPS 传输加密与回调 resource 的 AES-GCM 解密校验仍生效。
    下载微信支付公钥后重启即可恢复完整校验。
    """
    from wechatpayv3.core import Core
    original_init = Core._init_certificates
    original_verify = Core._verify_signature

    def init_without_raise(self):
        try:
            original_init(self)
        except Exception as exc:
            self._certificates = []
            logger.warning("加载微信支付平台证书失败：%s", exc)

    def verify_lenient(self, headers, body):
        if not self._certificates and not self._public_key_id:
            logger.warning("未配置微信支付公钥/平台证书，跳过微信应答验签")
            return True
        return original_verify(self, headers, body)

    Core._init_certificates = init_without_raise
    Core._verify_signature = verify_lenient

def get_wxpay() -> WeChatPay:
    """懒加载单例（优先公钥模式，其次平台证书模式）"""
    cfg = config.WECHAT
    private_key = Path(cfg["private_key_path"]).read_text(encoding="utf-8")
    kwargs = dict(
        wechatpay_type=WeChatPayType.NATIVE,   # 扫码支付
        mchid=cfg["mchid"],
        private_key=private_key,               # 传 PEM 内容，不是路径
        cert_serial_no=cfg["cert_serial_no"],
        appid=cfg["appid"],
        apiv3_key=cfg["apiv3_key"],
        notify_url=cfg["notify_url"],
        cert_dir=cfg["platform_cert_dir"],
    )
    public_key, public_key_id = load_platform_public_key()
    if public_key:
        kwargs.update(public_key=public_key, public_key_id=public_key_id)
    try:
        return WeChatPay(**kwargs)
    except Exception as exc:
        # 新商户无平台证书且未下载微信支付公钥 → 降级模式重试
        if public_key or "No wechatpay platform certificate" not in str(exc):
            raise WeChatPayError(f"微信支付初始化失败：{exc}") from exc
        logger.warning("未找到微信支付公钥，平台证书不可用，进入降级模式")
        enable_verification_fallback()
        return WeChatPay(**kwargs)
```

### 1.5 步骤 5：Native 下单

```python
def create_native_order(out_trade_no: str, description: str, amount_fen: int) -> dict:
    """Native 下单，返回 {'code_url': 'weixin://wxpay/bizpayurl?...'}"""
    code, message = get_wxpay().pay(
        description=description,                 # 限 127 字符
        out_trade_no=out_trade_no,
        amount={"total": amount_fen, "currency": "CNY"},   # 单位：分（int）
    )
    data = json.loads(message) if isinstance(message, str) else (message or {})
    if code not in range(200, 300):
        raise WeChatPayError(f"微信接口返回异常 code={code}, message={data.get('message', data)}")
    return data
```

要点：
- `pay()` 返回 `(code, message)`，`message` 是 **JSON 字符串**，需 `json.loads`；
- 将 `code_url`（形如 `weixin://wxpay/bizpayurl?pr=xxx`）用 `qrcode` 库渲染成 PNG 给前端展示。

### 1.6 步骤 6：查单 / 关单与状态映射

```python
def query_order(out_trade_no: str) -> dict:
    code, message = get_wxpay().query(out_trade_no=out_trade_no)
    return _parse_response(code, message)    # 含 trade_state

def close_order(out_trade_no: str) -> None:
    code, message = get_wxpay().close(out_trade_no=out_trade_no)
    _parse_response(code, message)

TRADE_STATE_MAP = {
    "SUCCESS": "PAID", "REFUND": "PAID",
    "NOTPAY": "CREATED", "USERPAYING": "CREATED",
    "CLOSED": "CLOSED", "REVOKED": "CLOSED", "PAYERROR": "FAILED",
}
```

注意：微信 Native **下单成功后交易立即存在**，立刻查单会返回 `NOTPAY`（未支付）；这与支付宝不同（见 3.3）。

### 1.7 步骤 7：回调路由（FastAPI）

```python
@app.post("/api/wechat/notify")
async def wechat_notify(request: Request):
    body = await request.body()   # 必须用原始 bytes，不要先解析再重编码
    headers = {k.lower(): v for k, v in request.headers.items()}  # 微信头大小写不定→统一小写
    try:
        result = wechat_pay.parse_callback(headers, body)  # 内部：验签 + AES-GCM 解密 resource
    except Exception as exc:
        logger.exception("微信回调处理异常")
        return JSONResponse({"code": "FAIL", "message": str(exc)}, status_code=500)  # 5xx→微信重推
    if result is None:
        return JSONResponse({"code": "FAIL", "message": "验签失败"}, status_code=401)
    if result.get("event_type") == "TRANSACTION.SUCCESS":
        resource = result.get("resource") or {}
        out_trade_no = resource.get("out_trade_no")
        if out_trade_no:
            store.mark_paid(
                out_trade_no,
                trade_no=resource.get("transaction_id", ""),
                note="微信支付回调确认成功",
                wechat_trade_state=resource.get("trade_state", ""),
            )
    return {"code": "SUCCESS", "message": "成功"}   # 必须 200+SUCCESS，否则微信持续重推
```

`parse_callback` 封装（已验证）：

```python
def parse_callback(headers: dict, body: bytes):
    result = get_wxpay().callback(headers=headers, body=body)  # 验签失败返回 None
    if result is None:
        logger.warning("微信回调验签失败")
    return result
```

### 1.8 微信踩坑清单

| 现象 | 原因 | 解决 |
|---|---|---|
| 初始化报 `No wechatpay platform certificate` | 新商户，无平台证书接口 | 按 1.2 下载微信支付公钥+公钥ID；或暂用降级模式 |
| 请求返回 401 `SIGN_ERROR` | 商户私钥与 `cert_serial_no` 不是同一套证书 | 核对证书序列号与 `apiclient_key.pem` 来源一致 |
| 回调一直收不到/微信重推 | notify_url 不可达，或应答格式错误 | 公网可直连；成功应答 `{"code":"SUCCESS"}` |
| 验签失败（回调） | headers 未转小写 / body 被改动 | headers 统一小写；body 用原始 bytes |
| 金额报错 | 微信金额单位是分（int） | 元→分 `int(Decimal * 100)` |
| 没有平台证书也想要完整校验 | 材料缺失 | 下载微信支付公钥放 `certs/wechat_public_key.pem` 后重启 |

---

## 2. 支付宝 · 电脑网站支付（alipay.trade.page.pay）

### 2.1 步骤 1：开放平台准备

| 材料 | 说明 |
|---|---|
| APPID | 开放平台应用详情页 |
| 应用私钥 | 自己生成（RSA2），PEM 格式，妥善保存 |
| 加签方式材料 | 见 2.2（决定用"密钥模式"还是"公钥证书模式"） |
| 产品签约 | 产品中心签约"电脑网站支付"（订单码另需签约"当面付"，见第 3 章） |
| notify_url / return_url | 异步通知地址（公网可访问）/ 同步回跳地址（可为本地） |

### 2.2 步骤 2：确定加签模式（关键：必须与开放平台"接口加签方式"完全一致）

开放平台"接口加签方式"有两种，商户端实现必须与之匹配，否则必报 `40002 isv.invalid-signature`。

| | 密钥模式（推荐新手） | 公钥证书模式 |
|---|---|---|
| 平台设置 | 接口加签方式=密钥，上传/粘贴**应用公钥** | 接口加签方式=公钥证书，通过 CSR 换发**应用公钥证书** |
| 商户端所需材料 | 应用私钥 + **支付宝公钥**（平台上直接复制，裸 base64 文本） | 应用私钥 + 应用公钥证书（`appCertPublicKey_*.crt`）+ 支付宝公钥证书（`alipayCertPublicKey_RSA2.crt`）+ 支付宝根证书（`alipayRootCert.crt`） |
| SDK 类 | `AliPay` | `DCAliPay` |
| 请求差异 | 无附加参数 | 每个请求自动携带 `app_cert_sn`、`alipay_root_cert_sn`（SDK 自动计算） |
| 验签（响应/通知） | 用支付宝公钥 | 用支付宝公钥证书内公钥 + 校验根证书链 |

判断技巧：
- 平台上能下载到 `alipayCertPublicKey_RSA2.crt`、`appCertPublicKey_*.crt` 三件套的 → 当前是**公钥证书模式**；
- 材料里若出现"两段公钥"：**第一段通常是"支付宝公钥证书"**（验签用，可从中提取公钥），**第二段是 CA 链/根证书**（证书模式才用）——二者都不是"应用公钥"，不能拿来做应用侧配对判断。

### 2.3 步骤 3：安装依赖

```bash
pip install python-alipay-sdk
```

说明：SDK 依赖 `pycryptodomex`（导入命名空间为 `Cryptodome`）。若环境中同时装有 `pycryptodome`（命名空间 `Crypto`）并不冲突，SDK 只用 `Cryptodome`；排查加密相关报错时先确认 `pip show pycryptodomex` 已安装。

### 2.4 步骤 4：初始化（双模式自动切换，已验证写法）

```python
from pathlib import Path
from alipay import AliPay, AliPayConfig

def _extract_public_key_from_cert(cert_pem: str) -> str:
    """归一化"支付宝公钥"材料：证书 → 提取其中的公钥；已是裸公钥 → 原样返回。"""
    if "-----BEGIN PUBLIC KEY-----" in cert_pem:
        return cert_pem.strip() + "\n"
    from cryptography import x509
    from cryptography.hazmat.primitives import serialization
    blocks = cert_pem.split("-----END CERTIFICATE-----")
    if not blocks or not blocks[0].strip():
        raise AlipayError("证书内容异常")
    first_cert = blocks[0] + "-----END CERTIFICATE-----\n"
    cert = x509.load_pem_x509_certificate(first_cert.encode("utf-8"))
    return cert.public_key().public_bytes(
        serialization.Encoding.PEM,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode("utf-8")

def _normalize_cert_chain(pem_text: str) -> str:
    """多张证书规范为以空行分隔的链（SDK 解析根证书时按空行 '\n\n' 拆分）"""
    blocks = [
        block.strip() + "\n-----END CERTIFICATE-----"
        for block in pem_text.split("-----END CERTIFICATE-----")
        if block.strip()
    ]
    return "\n\n".join(blocks) + "\n"

def get_alipay():
    """存在应用公钥证书 → DCAliPay（证书模式）；否则 → AliPay（密钥模式）"""
    cfg = config.ALIPAY
    app_private_key = Path(cfg["app_private_key_path"]).read_text(encoding="utf-8")
    cert_pem = Path(cfg["public_cert_path"]).read_text(encoding="utf-8")
    app_cert_path = Path(cfg["app_public_key_cert_path"])
    if app_cert_path.exists():
        from alipay import DCAliPay
        root_pem = Path(cfg["root_cert_path"]).read_text(encoding="utf-8")
        return DCAliPay(
            appid=cfg["appid"],
            app_notify_url=cfg["notify_url"],
            app_private_key_string=app_private_key,
            app_public_key_cert_string=app_cert_path.read_text(encoding="utf-8"),
            alipay_public_key_cert_string=cert_pem,
            alipay_root_cert_string=_normalize_cert_chain(root_pem),
            sign_type="RSA2",
            debug=cfg["debug"],          # True=沙箱网关
        )
    alipay_public_key = _extract_public_key_from_cert(cert_pem)
    return AliPay(
        appid=cfg["appid"],
        app_notify_url=cfg["notify_url"],
        app_private_key_string=app_private_key,
        alipay_public_key_string=alipay_public_key,   # 裸公钥或从证书提取的公钥均可
        sign_type="RSA2",
        debug=cfg["debug"],
        config=AliPayConfig(timeout=15),
    )
```

配置项：

```python
ALIPAY = {
    "appid": os.getenv("ALIPAY_APPID", "<APPID>"),
    "app_private_key_path": "certs/alipay_app_private_key.pem",
    "public_cert_path": "certs/alipay_public_cert.pem",          # 支付宝公钥（证书或裸公钥文本均可）
    "root_cert_path": "certs/alipay_root_cert.pem",              # 支付宝根证书（证书模式用）
    "app_public_key_cert_path": "certs/alipay_app_cert_public_key.pem",  # 存在即切证书模式
    "debug": ALIPAY_DEBUG,   # 沙箱 True
    "gateway": (
        "https://openapi-sandbox.dl.alipaydev.com/gateway.do"
        if ALIPAY_DEBUG else "https://openapi.alipay.com/gateway.do"
    ),
    "notify_url": f"{BASE_URL}/api/alipay/notify",
    "return_url": f"{BASE_URL}/api/alipay/return",
}
```

### 2.5 步骤 5：下单（生成收银台跳转 URL）

```python
def create_page_pay_url(out_trade_no: str, subject: str, total_amount: str) -> str:
    """total_amount 为元字符串，如 '0.01'；返回收银台 URL"""
    cfg = config.ALIPAY
    order_string = get_alipay().api_alipay_trade_page_pay(
        out_trade_no=out_trade_no,
        subject=subject,           # 限 256 字符
        total_amount=total_amount,
        return_url=cfg["return_url"],   # 支付完成后浏览器同步跳回
        notify_url=cfg["notify_url"],   # 异步通知（最终以它为准）
    )
    return f"{cfg['gateway']}?{order_string}"
```

要点：`api_alipay_trade_page_pay` **不发起网络请求**，本地拼出带签名的查询串即完成下单；把返回的 URL 跳转（或 `window.open`）给用户即可。

### 2.6 步骤 6：查单

```python
def query_order(out_trade_no: str) -> dict | None:
    response = get_alipay().api_alipay_trade_query(out_trade_no=out_trade_no)
    code = response.get("code")
    if code == "10000":
        return response                     # 含 trade_status / trade_no
    if response.get("sub_code") == "ACQ.TRADE_NOT_EXIST":
        return None                         # 正常：买家还未进入收银台/未扫码，交易尚未创建
    raise AlipayError(f"支付宝查单异常 code={code} sub_code={response.get('sub_code')}")

TRADE_STATUS_MAP = {
    "TRADE_SUCCESS": "PAID", "TRADE_FINISHED": "PAID",
    "WAIT_BUYER_PAY": "CREATED", "TRADE_CLOSED": "CLOSED",
}
```

### 2.7 步骤 7：回调（异步通知 + 同步跳转）

```python
from alipay import AliPay

def verify_notify(data: dict) -> bool:
    """校验异步通知/同步返回签名（data 为全部参数；sign 由本函数剥离，sign_type 由 SDK 剥离）"""
    params = dict(data)
    signature = params.pop("sign", None)
    if not signature:
        return False
    try:
        return bool(get_alipay().verify(params, signature))
    except Exception as exc:
        logger.warning("支付宝验签异常：%s", exc)
        return False

@app.post("/api/alipay/notify")
async def alipay_notify(request: Request):
    """异步通知：form-urlencoded，成功必须返回纯文本 success"""
    form = await request.form()                       # 需要 python-multipart 依赖
    data = {key: str(value) for key, value in form.items()}
    if not alipay_pay.verify_notify(data):
        return PlainTextResponse("failure")           # 验签失败→failure，支付宝会重试
    out_trade_no = data.get("out_trade_no", "")
    trade_status = data.get("trade_status", "")
    if out_trade_no and trade_status in ("TRADE_SUCCESS", "TRADE_FINISHED"):
        store.mark_paid(out_trade_no, trade_no=data.get("trade_no", ""),
                        note="支付宝异步通知确认成功", alipay_trade_status=trade_status)
    return PlainTextResponse("success")

@app.get("/api/alipay/return")
async def alipay_return(request: Request):
    """同步跳转：仅用于回跳展示，不能作为支付成功依据（用户可能不跳回）"""
    params = {key: str(value) for key, value in request.query_params.items()}
    if alipay_pay.verify_notify(params):
        if params.get("trade_status") in ("TRADE_SUCCESS", "TRADE_FINISHED"):
            store.mark_paid(params.get("out_trade_no", ""), note="同步跳转确认成功")
    return RedirectResponse(url="/")
```

### 2.8 步骤 8：签名问题排查手册（40002 isv.invalid-signature）

**原理**：请求用"应用私钥"签名 → 网关用你在平台登记的**应用公钥**（密钥模式）或**应用公钥证书内公钥**（证书模式）验签。两者不配对、或模式不一致，必报 `40002 isv.invalid-signature`。这是支付宝接入最高频的错误。

**排查三步**：

1. 确认开放平台"接口加签方式"与代码实际使用的 SDK 类一致（AliPay ↔ 密钥；DCAliPay ↔ 公钥证书，请求会自动带 `app_cert_sn`）；不一致先改正，再继续排查；
2. **指纹比对**（铁证）：比较"私钥导出公钥的模数 SHA256"与"平台材料（应用公钥证书，或平台上复制/登记的应用公钥）的模数 SHA256"，必须一致；
3. 不一致 → 三选一修复：
   - **换私钥**：把与平台登记公钥配对的私钥装到代码（最优）；
   - **重置应用公钥证书**：用当前私钥生成 CSR → 开放平台"接口加签方式→公钥证书→重置/更新"用 CSR 换发新证书（私钥不变）；
   - **改密钥模式**：开放平台改"公钥"方式，把当前私钥导出的应用公钥粘贴上去。

指纹比对脚本：
```python
import hashlib
from cryptography import x509
from cryptography.hazmat.primitives.serialization import load_pem_private_key

def _modulus_fp(public_numbers) -> str:
    n = public_numbers.n
    return hashlib.sha256(n.to_bytes((n.bit_length() + 7) // 8, "big")).hexdigest()[:16]

def fp_of_private_key(pem_path: str) -> str:
    key = load_pem_private_key(open(pem_path, "rb").read(), password=None)
    return _modulus_fp(key.public_key().public_numbers())

def fp_of_cert(cert_path: str) -> str:
    cert = x509.load_pem_x509_certificate(open(cert_path, "rb").read())
    return _modulus_fp(cert.public_key().public_numbers())

print("私钥导出公钥:", fp_of_private_key("certs/alipay_app_private_key.pem"))
print("应用公钥证书:", fp_of_cert("<appCertPublicKey_xxx.crt>"))
# 两者一致 → 配对；不一致 → 无论怎么调都必然 isv.invalid-signature
```

CSR 生成（用于"重置应用公钥证书"路线，支付宝要求空 subject）：

```python
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization

key = serialization.load_pem_private_key(
    open("certs/alipay_app_private_key.pem", "rb").read(), password=None)
csr = (x509.CertificateSigningRequestBuilder()
       .subject_name(x509.Name([]))
       .sign(key, hashes.SHA256()))
open("certs/alipay_app_csr.pem", "wb").write(
    csr.public_bytes(serialization.Encoding.PEM))
```

**常见误区**：
- 把"支付宝公钥（证书）"当作"应用公钥"去比对 → 方向错误。支付宝公钥用于**验签平台响应**，平台登记的应用公钥用于**平台验你的签名**，两者是两个不同密钥；
- 规格/材料里给的是"一行裸 base64"时，套 PEM 头尾（`-----BEGIN PRIVATE KEY-----` / `-----BEGIN PUBLIC KEY-----`，每 64 字符换行）后再用；
- 证书模式下必须用 `DCAliPay`（请求带 `app_cert_sn`/`alipay_root_cert_sn`，由 SDK 自动计算），否则网关找不到你的应用公钥；
- 平台更换加签设置、上传新公钥后立即生效，无需等待审核。

### 2.9 支付宝踩坑清单

| 现象 | 原因 | 解决 |
|---|---|---|
| `40002 isv.invalid-signature` | 私钥与平台登记公钥不配对 / 模式不一致 | 按 2.8 排查手册处理 |
| 查单返回 `ACQ.TRADE_NOT_EXIST` | 买家未进入收银台/未扫码，交易未创建 | **正常现象**，按"仍待支付"返回，不要当异常抛错 |
| 回调路由报 422/无法解析 | FastAPI 需要 `python-multipart` 才能读 form | `pip install python-multipart` |
| 回调验签失败 | 参数包含 sign 未剥离 / 参数被 URL 解码破坏 | 用 SDK `verify(params去掉sign, signature)`（sign_type 由 SDK 剥离） |
| 根证书解析报错（cryptography ExtraData） | 官方根证书含 ECDSA 证书块 | 交给 SDK（pyOpenSSL 解析，ECDSA 块自动跳过）；自解析时逐块解析 |
| 证书模式下 `app_cert_sn` 不匹配 | 平台证书已重置，本地证书未更新 | 重新下载三证书替换本地文件 |
| 沙箱无法下单 | 沙箱需单独 APPID/密钥/网关 | `debug=True` + `openapi-sandbox.dl.alipaydev.com` + 沙箱 APPID |

---

## 3. 支付宝 · 订单码（当面付扫码，alipay.trade.precreate）

### 3.1 步骤 1：签约"当面付"

开放平台-产品中心 → 签约"当面付"（个人/个体户/企业资质要求不同）。未签约时 `precreate` 会返回权限/签约类错误。

### 3.2 步骤 2：下单（获取 qr_code 并本地渲染二维码）

```python
def create_precreate_order(out_trade_no, subject, total_amount, timeout_express=None) -> dict:
    """订单码下单；total_amount 为元字符串（如 '0.01'）。返回含 qr_code 的响应"""
    kwargs = {}
    if timeout_express:
        kwargs["timeout_express"] = timeout_express      # 如 '30m'、'1h'（订单最晚付款时间）
    response = get_alipay().api_alipay_trade_precreate(
        subject=subject,                                 # 限 256 字符
        out_trade_no=out_trade_no,
        total_amount=total_amount,
        notify_url=config.ALIPAY["notify_url"],
        **kwargs,
    )
    if response.get("code") != "10000":
        raise AlipayError(f"订单码下单失败 code={response.get('code')} sub_msg={response.get('sub_msg')}")
    if not response.get("qr_code"):
        raise AlipayError("订单码下单未返回 qr_code")
    return response
```

要点：
- 与 `page.pay` 不同，`precreate` 会**真实发起网关请求**（SDK 内部 HTTP + 响应验签），成功返回 `qr_code`（形如 `https://qr.alipay.com/bax...` 的字符串）；
- `qr_code` 只是字符串，需用 `qrcode` 本地渲染成图片（见 3.4 渲染函数，与微信共用）；
- 无同步跳转（没有 return_url 概念），支付结果靠异步通知或主动查单。

### 3.3 步骤 3：必须了解的行为特性（重要）

| 行为 | 说明 |
|---|---|
| 交易延迟创建 | 下单后**买家扫码/首次进入收银台前**，支付宝侧交易不存在，查单返回 `40004 / ACQ.TRADE_NOT_EXIST`——**这是正常现象**，代码应返回"仍待支付"，不可当异常抛错 |
| 与微信对比 | 微信 Native 下单后交易立即存在（查单返回 `NOTPAY`）；支付宝是扫码后才有交易 |
| 订单码有效期 | 默认由支付宝控制；可用 `timeout_express` 指定（如 `'30m'`） |
| 二维码可重复扫 | 同一订单码，支付成功前可多次扫码进入收银台 |

查单封装（已验证，与网页支付共用同一函数）：

```python
def query_order(out_trade_no: str) -> dict | None:
    response = get_alipay().api_alipay_trade_query(out_trade_no=out_trade_no)
    code = response.get("code")
    if code == "10000":
        return response
    if response.get("sub_code") == "ACQ.TRADE_NOT_EXIST":
        return None      # 正常：买家还没扫，保持本地状态不变
    raise AlipayError(...)
```

同步查单路由中对应处理：

```python
detail = alipay_pay.query_order(out_trade_no)
if detail is None:
    return record      # 买家还没扫码，支付宝侧尚未生成交易，保持本地状态
trade_status = detail.get("trade_status", "")
if trade_status in ("TRADE_SUCCESS", "TRADE_FINISHED"):
    return store.mark_paid(out_trade_no, trade_no=detail.get("trade_no", ""), note="支付宝查单确认支付成功")
```

### 3.4 步骤 4：回调与二维码渲染（与网页支付共用）

- **异步通知**：与网页支付完全相同（同一 `/api/alipay/notify` 路由、同一验签逻辑），按 `out_trade_no` 区分订单即可；
- **二维码渲染**（微信 code_url 与支付宝 qr_code 通用）：

```python
def make_qr_png(content: str) -> bytes:
    """把支付链接渲染成 PNG 二维码"""
    import qrcode
    qr = qrcode.QRCode(box_size=8, border=2)
    qr.add_data(content)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()
```

### 3.5 订单码 vs 网页支付 差异对照表

| 维度 | 网页支付 page.pay | 订单码 precreate |
|---|---|---|
| 用户操作 | 跳转支付宝收银台（PC 浏览器） | 支付宝 App 扫二维码 |
| 接口返回 | 收银台 URL（本地拼接，无网络请求） | qr_code 字符串（真实网关请求+响应验签） |
| 同步跳转 return_url | 有 | 无 |
| 异步通知 | 有 | 有（同一套） |
| 签约产品 | 电脑网站支付 | 当面付 |
| 交易创建时机 | 买家进入收银台后 | 买家扫码后 |
| 适用场景 | PC 网站 | 收银台大屏/PC 页面展示二维码 |

---

## 4. 新项目落地实现顺序（AI 执行清单）

按顺序实现，每步有验收点：

| 步骤 | 内容 | 验收点 |
|---|---|---|
| 1 | 建配置模块（环境变量覆盖、证书/密钥路径集中管理） | `/api/meta` 能输出 notify_url 等（不含密钥） |
| 2 | 建订单存储（先 JSON，接口签名固定） | 下单/查单/更新/`mark_paid` 幂等可测 |
| 3 | 实现渠道封装（先保证初始化） | 初始化无异常；支付宝用 2.8 指纹脚本自检配对 |
| 4 | 实现下单 + 二维码/跳转 URL 接口 | 真实返回 code_url / pay_url / qr_code |
| 5 | 实现查单同步路由 | 微信 NOTPAY、支付宝 TRADE_NOT_EXIST 均正常返回 |
| 6 | 实现回调路由（验签+解密+幂等更新） | 应答格式符合渠道要求（微信 JSON / 支付宝纯文本） |
| 7 | 前端轮询兜底（3 秒） | 支付后 3 秒内页面变"已支付" |
| 8 | 真实小额支付验证（0.01 元） | 订单 PAID，trade_no/paid_at 落库 |

---

## 5. 调试与验证

### 5.1 真实支付验证流程（每渠道必做）

1. 在演示页下单 0.01 元；
2. 发起支付：微信 = 微信扫一扫二维码；支付宝网页 = 跳转收银台；支付宝订单码 = 支付宝扫一扫二维码；
3. 观察结果：前端轮询 3 秒内变"已支付"（查单确认）；公网回调可达时还会看到异步通知日志；
4. 核对本地记录：`status=PAID`、`trade_no`（渠道交易号）、`paid_at` 均已写入。

### 5.2 本地开发回调不可达时的处理

- notify_url 默认 `http://127.0.0.1:8000/...`，渠道服务器无法访问 → 收不到异步通知；
- 两种方式解决：
  - 内网穿透（ngrok/cpolar）映射本地端口，把公网地址配到 `PAY_BASE_URL` 环境变量后重启；
  - 依赖"主动查单"兜底（前端 3 秒轮询；本项目实测无公网回调时，扫码支付后也能正常同步为 PAID）。

### 5.3 错误码/异常速查表

| 渠道 | 错误 | 含义 | 处理 |
|---|---|---|---|
| 微信 | 401 SIGN_ERROR | 请求签名错误（私钥/证书序列号不匹配） | 核对商户 API 证书与序列号 |
| 微信 | 404 RESOURCE_NOT_EXISTS | 新商户无平台证书接口 | 切换"微信支付公钥"模式 |
| 微信 | trade_state=CLOSED | 订单已关闭/超时 | 本地同步 CLOSED，需重新下单 |
| 支付宝 | 40002 isv.invalid-signature | 私钥与平台登记公钥不配对 | 见 2.8 排查手册 |
| 支付宝 | 40004 ACQ.TRADE_NOT_EXIST | 交易不存在（买家未进入收银台/未扫码） | **正常**，保持"待支付" |
| 支付宝 | ACQ.SYSTEM_ERROR | 支付宝系统异常 | 稍后重试/查单确认 |
| 支付宝 | 权限/签约类错误 | 未签约对应产品 | 产品中心签约（网页支付/当面付） |
| 支付宝 | 证书模式 app_cert_sn 错误 | 本地证书与平台不一致 | 重新下载三证书替换本地文件 |

### 5.4 上线前自检清单

- [ ] 所有密钥/证书文件已在 `.gitignore`，未提交仓库；
- [ ] 全渠道回调验签开启（微信降级模式需补全公钥后关闭）；
- [ ] 回调 + 查单双通道验证通过，回调中建议核对金额；
- [ ] 沙箱/调试开关（如 `ALIPAY_DEBUG`）在生产为关闭；
- [ ] notify_url 为生产域名且公网可达；
- [ ] 订单存储切换为数据库（或确认文件存储的并发/备份方案）；
- [ ] 真实小额支付端到端验证已记录。

---

## 6. 本项目已验证的关键结论速查

以下结论均为实测得出，其他项目可直接作为事实使用：
1. 微信 2026 年后新商户为"微信支付公钥"模式（无 `/v3/certificates` 平台证书接口），下载公钥+公钥ID 后可恢复完整验签；材料缺失时降级模式可先跑通链路；
2. 支付宝"加签方式"由开放平台设置决定，商户端模式必须一致；`isv.invalid-signature` 的第一排查对象是"私钥与平台登记公钥的模数配对"（见 2.8 指纹脚本）；
3. 支付宝订单码 = 当面付 `precreate`，需签约；返回的 `qr_code` 为字符串需本地渲染；买家扫码前查单返回 `ACQ.TRADE_NOT_EXIST` 属正常；
4. 微信 Native 下单即存在交易（查单 `NOTPAY`），支付宝下单后买家未操作前交易不存在——两者查单行为不同，代码中要区别对待；
5. 本地开发无公网回调时，前端轮询查单是可靠兜底（3 秒间隔，实测支付后能及时同步 PAID）。

---

## 附录 A. 本项目密钥与证书路径清单（实际使用）

> 项目根目录：`f:\98-CodeDemo\pay`，下表均为相对项目根目录的路径。
> 所有路径均支持环境变量覆盖（见 A.3）；密钥/证书文件必须加入 `.gitignore`，禁止提交仓库。

### A.1 微信支付

| 文件路径 | 用途 | 对应配置项 | 当前状态 |
|---|---|---|---|
| `1746857564_20261009_cert\apiclient_key.pem` | 商户 API 私钥（对请求签名） | `WECHAT["private_key_path"]` | 生效（实测通过） |
| `1746857564_20261009_cert\apiclient_cert.pem` | 商户 API 证书（序列号来源，官方下载原件） | 序列号写入 `cert_serial_no` | 保留 |
| `1746857564_20261009_cert\apiclient_cert.p12` | 商户证书 p12 格式（备用） | — | 保留 |
| `1746857564_20261009_cert.zip`（项目根） | 商户证书官方下载包（原始压缩包） | — | 保留 |
| `certs\wechat_public_key.pem` | 微信支付公钥（验签微信应答，新商户必须） | `WECHAT["public_key_path"]`（环境变量 `WXPAY_PUBLIC_KEY_PATH`） | **未下载**（当前降级模式运行） |
| `certs\wechat_public_key_id.txt` | 公钥 ID 旁路文件（可选，内容形如 `PUB_KEY_ID_...`） | 代码自动读取（或环境变量 `WXPAY_PUBLIC_KEY_ID`） | 未创建 |
| `data\wechat_platform_certs\` | 平台证书缓存目录（老商户平台证书模式用） | `WECHAT["platform_cert_dir"]` | 空（新商户无平台证书接口） |

说明：
- 微信当前以**降级模式**实测跑通（下单/查单/解密均正常，仅跳过微信应答签名校验）；恢复完整验签：到商户平台-账户中心-API安全下载"微信支付公钥"放到 `certs\wechat_public_key.pem`，并配置公钥 ID 后重启即可；
- 商户证书序列号（40 位 HEX）与公钥 ID 等值均写在 `app/config.py` 默认值中，可用环境变量覆盖。

### A.2 支付宝

| 文件路径 | 用途 | 对应配置项 | 当前状态 |
|---|---|---|---|
| `certs\alipay_app_private_key.pem` | **当前生效**应用私钥（PKCS#8，2048 位，模数指纹 14a4a5a2…） | `ALIPAY["app_private_key_path"]` | 生效（实测通过） |
| `certs\alipay_app_private_key.pem.bak` | 旧应用私钥备份（指纹 d6bd91c4…，与平台材料不配对，已弃用） | — | 备份，勿使用 |
| `certs\alipay_app_public_key.pem` | 当前私钥导出的**应用公钥**（供开放平台登记/核对，代码不读取） | — | 参考件 |
| `certs\alipay_public_cert.pem` | 支付宝公钥证书（代码从中提取公钥，校验支付宝响应/通知签名） | `ALIPAY["public_cert_path"]` | 生效 |
| `certs\alipay_root_cert.pem` | 支付宝根证书（官方 4 证书链版本，仅公钥证书模式使用） | `ALIPAY["root_cert_path"]` | 备用（密钥模式不读取） |
| `certs\alipay_app_cert_public_key.pem.off` | 应用公钥证书备份（旧证书，指纹 757acf5a…） | `ALIPAY["app_public_key_cert_path"]`（文件存在即切证书模式） | 已改名 `.off` → 当前走**密钥(公钥)模式** |
| `certs\alipay_app_csr.pem` | 备用 CSR（SHA256withRSA、空 subject；用于"重置应用公钥证书"路线） | — | 备用 |
| `alipayCertPublicKey_RSA2.crt`（项目根） | 开放平台下载的"支付宝公钥证书"原件 | —（内容已装入 `public_cert_path`） | 来源原件 |
| `alipayRootCert.crt`（项目根） | 开放平台下载的"支付宝根证书"原件 | —（内容已装入 `root_cert_path`） | 来源原件 |
| `appCertPublicKey_2021006163665024.crt`（项目根） | 开放平台下载的"应用公钥证书"原件（旧，与当前私钥不配对） | — | 来源原件，弃用 |

模式切换开关（改文件名即切换，无需改代码，重启生效）：
- 切回**公钥证书模式**：把 `certs\alipay_app_cert_public_key.pem.off` 改回 `alipay_app_cert_public_key.pem`；前提是平台为公钥证书模式，且证书与当前私钥配对（指纹比对见 2.8）；
- 保持**密钥(公钥)模式**：维持 `.off` 后缀；平台"接口加签方式"登记的应用公钥必须与 `certs\alipay_app_private_key.pem` 配对。

### A.3 环境变量覆盖一览

| 环境变量 | 覆盖对象 | 本项目默认值 |
|---|---|---|
| `PAY_BASE_URL` | 对外基础地址（notify_url/return_url 前缀） | `http://127.0.0.1:8000` |
| `PAY_DATA_DIR` | 数据目录（payments.json、平台证书缓存） | `<项目根>\data` |
| `WXPAY_MCHID` | 微信商户号 | 见 `app/config.py` |
| `WXPAY_APPID` | 微信 AppID | 见 `app/config.py` |
| `WXPAY_CERT_SERIAL_NO` | 微信商户证书序列号 | 见 `app/config.py` |
| `WXPAY_APIV3_KEY` | 微信 APIv3 密钥 | 见 `app/config.py` |
| `WXPAY_PUBLIC_KEY_PATH` | 微信支付公钥路径 | `certs\wechat_public_key.pem` |
| `WXPAY_PUBLIC_KEY_ID` | 微信支付公钥 ID | 见 `app/config.py` |
| `ALIPAY_DEBUG` | `1` = 支付宝沙箱网关 | `0`（生产网关） |
| `ALIPAY_APPID` | 支付宝 APPID | 见 `app/config.py` |

### A.4 运行数据

| 路径 | 说明 |
|---|---|
| `data\payments.json` | 全部支付记录（订单号、状态、渠道交易号、events 日志） |
| `data\wechat_platform_certs\` | 微信平台证书缓存（自动创建；公钥模式为空） |
| `data\payments.json` 所在目录 | 可通过 `PAY_DATA_DIR` 迁移，勿与代码混放 |

### A.5 其他项目使用本清单的注意事项

- 本清单仅适用于本项目转交/迁移场景；在新项目中应按下表映射为**新项目自己的目录结构**，不要硬编码本项目的绝对路径；
- 迁移时只复制"生效"文件（微信：`apiclient_key.pem` + 公钥（如已下载）；支付宝：`alipay_app_private_key.pem` + `alipay_public_cert.pem`（+证书模式三证书）），备份/弃用文件（`.bak`、`.off`、CSR、原件）按需保留。