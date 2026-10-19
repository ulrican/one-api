# FluxAI 系统发布到腾讯云服务器指南

> 项目：FluxAI（one-api 二开）· 流光算力 AI 聚合网关
> 发布目标：腾讯云 CVM + Docker Compose + MySQL + Nginx 反向代理 + HTTPS
> 镜像方案：本地构建 → 推送**阿里云 ACR**（沿用现有仓库）→ 腾讯云 CVM 跨云拉取
> 文档版本：2026-10-15（OpenCloudOS 9 适配版）
> 说明：云平台差异点：ECS→CVM、镜像仓库沿用阿里云 ACR、OSS→COS、镜像加速器、免费证书来源。

***

## 七牛模型渠道配置
BaseUrl： https://api.qiniu.com/v1  
          https://api.qnaigc.com/v1

配置信息：
URL: https://openai.qiniu.com
KEY: sk-e758eb517d7a76372d911ca3fe2c40e46c0a78eb844ed29e09a8358e5875e6e3

## 0. 前置准备清单

| 项目       | 说明                                       | 状态 |
| -------- | ---------------------------------------- | -- |
| 腾讯云 CVM  | 推荐 2核4G 起，系统盘 ≥40G（OS：OpenCloudOS 9）     | ☐  |
| 公网域名     | 需 ICP 备案（支付回调强制要求）                       | ☐  |
| SSL 证书   | 域名 HTTPS 证书（腾讯云免费 DV 或 Let's Encrypt）    | ☐  |
| 阿里云 ACR  | 沿用现有阿里云镜像仓库（无需在腾讯云新建仓库）                 | ☐  |
| CVM 开放端口 | 22(SSH)、80(HTTP)、443(HTTPS)、3008(FluxAI 直连)（CVM 安全组配置） | ☐  |

> 支付说明：微信/支付宝直连商户凭证已代码内置（go:embed 随二进制打包），无需申请易支付商户，服务器上零支付配置。

***

## 1. CVM 服务器初始化

### 1.1 系统选择

腾讯云服务器操作系统为 **OpenCloudOS 9**（腾讯自研，RPM/dnf 生态，与 CentOS 9 命令兼容）。

> ⚠️ 与 CentOS 的两个关键差异，本文档已按此适配：
> 1. `get.docker.com` 官方脚本不识别 OpenCloudOS → Docker 改用 docker-ce 仓库方式安装（1.2 节）
> 2. 官方仓库无 snapd/EPEL → Certbot 改用 pip 方式安装，且需手动注册续期定时器（3.3.2 / 3.3.5 节）

### 1.2 安装 Docker 与 Docker Compose

```bash
# OpenCloudOS 9：配置腾讯云内网 docker-ce 仓库（$releasever 解析为 9，与 CentOS 9 的包兼容）
curl -o /etc/yum.repos.d/docker-ce.repo https://mirrors.cloud.tencent.com/docker-ce/linux/centos/docker-ce.repo
dnf makecache

# 安装 Docker Engine + Compose 插件（v2）
dnf install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
docker compose version
```

### 1.3 配置腾讯云镜像加速（必须）

腾讯云提供**内网镜像加速地址**（仅 CVM 上可访问，免登录、无流量费），写入 `/etc/docker/daemon.json`：

```json
{
  "registry-mirrors": [
    "https://mirror.ccs.tencentyun.com"
  ],
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "100m",
    "max-file": "3"
  }
}
```

```bash
systemctl restart docker
```

> ⚠️ 不配置镜像加速器，`docker pull node:16`、`golang:alpine` 等大镜像大概率拉取超时失败。
> 注意：加速器只对 Docker Hub 官方镜像生效；阿里云 ACR 私有镜像走 1.4 节的登录拉取流程。

### 1.4 配置阿里云 ACR 登录凭证（拉取私有镜像必须）

腾讯云 CVM 需要登录阿里云镜像仓库才能拉取私有镜像：

```bash
# 用户名与密码 = 阿里云 ACR 个人版的登录凭证（与本地推送用的是同一套）
docker login crpi-yrax2qagqc9gjyr1.cn-shenzhen.personal.cr.aliyuncs.com \
  --username=gezimygood@163.com
# 输入 ACR 访问密码（阿里云控制台 → 容器镜像服务 → 访问凭证 设置的固定密码）
```

登录凭证持久化在 `/root/.docker/config.json`，**登录一次后 `docker compose pull` 可一直使用**，无需重复登录。

***

## 2. 项目构建与镜像上传

### 2.1 本地构建镜像 + 推送阿里云 ACR（沿用现有仓库）

在本地 Windows 开发机执行：

```powershell
# 1. 构建生产镜像（多阶段构建，前端在镜像内编译）
cd e:\97_OneAI\one-api
docker build -t fluxai:v3.0.0 .

# 2. 登录阿里云容器镜像服务（与 CVM 拉取用同一账号）
docker login --username=gezimygood@163.com crpi-yrax2qagqc9gjyr1.cn-shenzhen.personal.cr.aliyuncs.com

# 3. 打标签并推送
docker tag fluxai:v3.0.0 crpi-yrax2qagqc9gjyr1.cn-shenzhen.personal.cr.aliyuncs.com/flux-ai/fluxai:v3.0.0
docker push crpi-yrax2qagqc9gjyr1.cn-shenzhen.personal.cr.aliyuncs.com/flux-ai/fluxai:v3.0.0
```

### 2.2 跨云拉取说明（腾讯云 CVM ← 阿里云 ACR）

- 走公网传输，镜像约 300MB；CVM 公网带宽较小时（如 1~5Mbps），**首次拉取约需 5~15 分钟**，属正常现象
- 增量发布时 docker 分层复用，只传输变更层，通常 1~2 分钟完成
- 若长期驻留腾讯云且拉取速度不可接受，可迁移为腾讯云 TCR（`ccr.ccs.tencentyun.com`），流程见文末附录

### 2.3 方案 B：CVM 上直接构建（简单但慢，需 4G+ 内存）

```bash
# 在 CVM 上
dnf install -y git
git clone <你的代码仓库> /opt/fluxai
cd /opt/fluxai
docker build -t fluxai:v1.0.0 .
```

> 注意：Dockerfile 里 `npm install` 依赖 npm 源，CVM 上可能需要配置 npm 淘宝镜像。构建过程约 10~15 分钟。

***

## 3. 部署目录结构

在 CVM 上创建部署目录：

```bash
mkdir -p /root/fluxai/{data,logs,mysql-data,redis-data}
cd /root/fluxai
```

### 3.1 docker-compose.yml（生产版）

```yaml
version: '3.8'

services:
  fluxai:
    image: crpi-yrax2qagqc9gjyr1.cn-shenzhen.personal.cr.aliyuncs.com/flux-ai/fluxai:v3.0.0  # 阿里云 ACR，与推送 tag 一致
    container_name: fluxai
    restart: always
    command: --log-dir /app/logs
    ports:
      - "3008:3000"        # 宿主机 3008（服务器 3000 被占用）→ 容器内固定 3000；Nginx 反代 + 公网直连均可
    volumes:
      - ./logs:/app/logs
    environment:
      - SQL_DSN=fluxai:flux1234@tcp(db:3306)/fluxai?charset=utf8mb4&parseTime=True&loc=Local
      - REDIS_CONN_STRING=redis://:flux1234@redis:6379
      - SYNC_FREQUENCY=60          # 必须设置！缺省时 Redis 被静默禁用（日志：SYNC_FREQUENCY not set, Redis is disabled）
      - SESSION_SECRET=请改为随机长字符串
      - TZ=Asia/Shanghai
      - PORT=3000
    depends_on:
      redis:
        condition: service_healthy   # 等 Redis 就绪再启动
      db:
        condition: service_healthy   # 等 MySQL 就绪再启动，根治启动时 connection refused 反复重试
    healthcheck:
      test: ["CMD-SHELL", "wget -q -O - http://localhost:3000/api/status | grep -o '\"success\":\\s*true' | awk -F: '{print $2}'"]
      interval: 30s
      timeout: 10s
      retries: 3

  redis:
    image: redis:7-alpine
    container_name: fluxai-redis
    restart: always
    volumes:
      - ./redis-data:/data
    command: redis-server --appendonly yes --requirepass flux1234
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "flux1234", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  db:
    image: mysql:8.2.0
    container_name: fluxai-mysql
    restart: always
    volumes:
      - ./mysql-data:/var/lib/mysql
    environment:
      TZ: Asia/Shanghai
      MYSQL_ROOT_PASSWORD: Root@12345
      MYSQL_USER: fluxai
      MYSQL_PASSWORD: flux1234
      MYSQL_DATABASE: fluxai
    command: --character-set-server=utf8mb4 --collation-server=utf8mb4_unicode_ci
    healthcheck:
      test: ["CMD-SHELL", "mysql -uroot -pRoot@12345 -e 'SELECT 1'"]
      interval: 10s
      timeout: 5s
      retries: 10   # 首次启动初始化数据目录耗时较长，多留重试次数
```

> 关键点：
>
> - 端口绑定 `3008:3000` → 宿主机 3008（服务器 3000 被占用），Nginx 反代与公网直连均可访问
> - **容器内固定 3000**（main.go / Dockerfile EXPOSE 约定），compose 中 `PORT=3000` 环境变量勿改
> - 容器 healthcheck 走容器内 `localhost:3000`，与宿主机端口无关，同样保持不变
> - ⚠️ 直连 3008 为 HTTP 明文（无 TLS、不过 Nginx 的 SSE/上传限制配置），生产访问仍推荐 `https://tkonegeo.com`（443→Nginx）；调试直连用 `http://<CVM公网IP>:3008`
> - 公网直连 3008 需：安全组放行 3008 端口；若本机 firewalld 启用，执行 `firewall-cmd --permanent --add-port=3008/tcp && firewall-cmd --reload`
> - `REDIS_CONN_STRING` 必须带密码（`redis://:密码@redis:6379`），否则容器内鉴权失败
> - 数据库/Redis 密码改为强密码；`SESSION_SECRET` 用随机长字符串
> - 容器日志大小限制由 daemon.json 全局配置（1.3 节已配）
> - 镜像为阿里云 ACR 私有仓库 → 拉取前必须完成 1.4 节的 docker login

### 3.2 Nginx 反向代理配置

```bash
dnf install -y nginx
systemctl enable --now nginx

# OpenCloudOS 9 默认通常未启用 firewalld（公网入口仅由安全组管控）；
# 若本机 firewalld 处于运行状态，必须放行 80/443，否则 Certbot 回源验证会超时
systemctl is-active firewalld && {
  firewall-cmd --permanent --add-service=http --add-service=https
  firewall-cmd --reload
}
```

创建 `/etc/nginx/conf.d/fluxai.conf`（**初始只配 80 端口**，HTTPS 配置由 3.3 节 Certbot 自动插入）：

```nginx
server {
    listen 80;
    server_name tkonegeo.com;

    # 客户端上传/请求体大小限制
    client_max_body_size 100m;

    # 代理到 FluxAI 容器
    location / {
        proxy_pass http://127.0.0.1:3008;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # SSE 流式响应支持（聊天接口必需）
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_read_timeout 300s;
    }
}
```

使初始配置生效：

```bash
nginx -t && systemctl reload nginx
curl -I http://tkonegeo.com/api/status   # 确认 80 端口 HTTP 已可访问
```

### 3.3 SSL 证书：Let's Encrypt + Certbot 自动续期（方案 A，推荐）

Certbot 会自动完成「申请证书 → 改写 Nginx 配置插入 443 server 块与 80→443 跳转 → 注册定时续期」，**配置一次永久免手工续期**。

#### 3.3.1 前置条件检查（申请前必须全部满足）

| 检查项 | 验证命令 | 说明 |
| --- | --- | --- |
| 域名 DNS 已解析到 CVM 公网 IP | `nslookup tkonegeo.com` | Let's Encrypt 回源验证依赖解析生效 |
| 安全组已开放 80、443 端口 | CVM 控制台 → 安全组规则 | HTTP-01 验证必须 80 端口公网可达 |
| 80 端口站点可访问 | `curl -I http://tkonegeo.com/api/status` | 3.2 节初始配置已生效 |
| Nginx 配置含 `server_name tkonegeo.com;` | `nginx -T \| grep server_name` | certbot --nginx 靠它定位要改写的 server 块 |

#### 3.3.2 安装 Certbot（pip 方式，适配 OpenCloudOS 9）

OpenCloudOS 9 官方仓库无 snapd/EPEL，采用 pip 方式安装：

```bash
dnf install -y python3 python3-pip augeas-libs
python3 -m pip install --upgrade pip
python3 -m pip install certbot certbot-nginx

certbot --version
# 若提示命令不存在：ln -sf /usr/local/bin/certbot /usr/bin/certbot
```

> ⚠️ pip 方式安装**不会自动注册续期定时器**，必须按 3.3.5 节手动创建 systemd 定时器，否则证书到期不会自动续。

#### 3.3.3 一键申请证书并自动配置 Nginx

```bash
certbot --nginx -d tkonegeo.com \
  --email 530028130@qq.com \
  --agree-tos --no-eff-email \
  --redirect
```

参数说明：

- `--nginx`：调用 Nginx 插件，自动完成回源验证 + 改写 `fluxai.conf`（插入 `listen 443 ssl`、`ssl_certificate` 指向 `/etc/letsencrypt/live/tkonegeo.com/`、HTTP→HTTPS 301 跳转）
- `--redirect`：强制 HTTP 跳转 HTTPS（推荐；不想要跳转可去掉）
- 成功后输出 `Congratulations!` 与证书路径、到期日期

> ⚠️ Let's Encrypt 有频率限制（同一域名每周 5 次成功签发），命令确认无误再执行；调试请用 `--dry-run` 或 `--staging`。

#### 3.3.4 验证 HTTPS 生效

```bash
nginx -t                                # certbot 改写后配置语法校验
curl -vI https://tkonegeo.com/api/status 2>&1 | grep -E "SSL connection|HTTP/"
# 期望：SSL connection using TLSv1.3 ... 和 HTTP/2 200
```

浏览器访问 `https://tkonegeo.com` 应显示锁形图标，点击可查看证书（颁发者 Let's Encrypt，有效期 90 天）。

#### 3.3.5 自动续期机制与验证

pip 方式安装的 Certbot **不会自动注册定时器**，必须手动创建 systemd 定时器（每天检查两次，剩余有效期 ≤30 天时自动续期）：

```bash
# 1. 创建续期 service 与 timer
cat > /etc/systemd/system/certbot-renew.service << 'EOF'
[Unit]
Description=Certbot Renewal

[Service]
Type=oneshot
ExecStart=/usr/local/bin/certbot renew --quiet
EOF

cat > /etc/systemd/system/certbot-renew.timer << 'EOF'
[Unit]
Description=Run Certbot twice daily

[Timer]
OnCalendar=*-*-* 00,12:00:00
RandomizedDelaySec=3600
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now certbot-renew.timer

# 2. 确认定时器已激活
systemctl list-timers | grep certbot
# 期望输出：certbot-renew.timer ...

# 3. 演练一次续期（不实际签发，验证全流程可用）
certbot renew --dry-run
# 期望输出：Congratulations, all simulated renewals succeeded
```

> 注：`ExecStart` 的 certbot 路径以 `which certbot` 实际输出为准（root 下 pip 安装通常为 `/usr/local/bin/certbot`）。

续期后自动生效说明：

- `--nginx` 插件安装的证书，续期后 Certbot 会**自动 reload Nginx**，无需重启 fluxai 容器
- 如需显式钩子（双保险）：`echo 'deploy-hook = systemctl reload nginx' >> /etc/letsencrypt/cli.ini`
- 证书文件固定位于 `/etc/letsencrypt/live/tkonegeo.com/fullchain.pem` 与 `privkey.pem`，续期只更新内容、路径不变

#### 3.3.6 常见问题

| 问题 | 排查 |
| --- | --- |
| 申请失败 `Timeout during connect` | 安全组 80 端口未开放 / DNS 未生效 / CVM 上 firewalld（如启用）未放行 / 80 被占用 |
| 申请失败 `Invalid response` | 域名解析到了其他 IP；CDN/云防护拦截了 `/.well-known/acme-challenge/` |
| 后续修改了 fluxai.conf | 不要动 certbot 插入的 `# managed by Certbot` 注释行；改完 `nginx -t && systemctl reload nginx` |
| 换域名/加域名 | 重新执行 3.3.3 命令（`-d 新域名`），旧证书可 `certbot delete` 清理 |

---

### 3.4 备选：腾讯云免费 DV 证书（方案 B，手工续期）

若不想装 Certbot，可用腾讯云免费证书（TrustAsia 签发，**有效期 90 天、到期必须手工重新申请**）：

1. **申请**：腾讯云控制台 → 搜索 **SSL 证书** → 我的证书 → **创建免费证书**（绑 `tkonegeo.com`；域名在腾讯云 DNSPod 解析可自动添加验证记录）→ 约 1~10 分钟签发
2. **下载**：证书列表 → 下载 → 服务器类型选 **Nginx**，解压得 `tkonegeo.com.pem` + `tkonegeo.com.key`
3. **上传安装**（本地 PowerShell 执行 scp，再在 CVM 归位）：

   ```powershell
   scp .\tkonegeo.com.pem .\tkonegeo.com.key root@<CVM公网IP>:/root/
   ```

   ```bash
   mkdir -p /etc/nginx/ssl
   mv /root/tkonegeo.com.pem /etc/nginx/ssl/fluxai.pem
   mv /root/tkonegeo.com.key /etc/nginx/ssl/fluxai.key
   chmod 600 /etc/nginx/ssl/fluxai.key && chmod 644 /etc/nginx/ssl/fluxai.pem
   ```

4. **改写 fluxai.conf 为完整 HTTPS 版**（在 3.2 节配置基础上追加跳转与 443 server 块）：

   ```nginx
   server {
       listen 80;
       server_name tkonegeo.com;
       return 301 https://$host$request_uri;
   }

   server {
       listen 443 ssl http2;
       server_name tkonegeo.com;
       ssl_certificate     /etc/nginx/ssl/fluxai.pem;
       ssl_certificate_key /etc/nginx/ssl/fluxai.key;
       ssl_protocols       TLSv1.2 TLSv1.3;
       ssl_ciphers         HIGH:!aNULL:!MD5;
       client_max_body_size 100m;

       location / {
           proxy_pass http://127.0.0.1:3008;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_http_version 1.1;
           proxy_set_header Connection "";
           proxy_buffering off;
           proxy_read_timeout 300s;
       }
   }
   ```

   ```bash
   nginx -t && systemctl reload nginx
   ```

5. **续期**：到期前重新申请 → 下载 → 覆盖 `/etc/nginx/ssl/` 两个文件 → `nginx -t && systemctl reload nginx`（无需重启容器）。务必设置**到期前 15 天日历提醒**。

***

## 4. 启动服务

```bash
cd /root/fluxai

# 1. 确认已登录阿里云 ACR（1.4 节，未登录则先 docker login）
docker compose pull     # 跨云拉取 fluxai 镜像 + MySQL/Redis 官方镜像（走内网加速器）

# 2. 启动
docker compose up -d

# 3. 查看启动日志（首启需 2~3 分钟初始化 token encoders）
docker logs -f fluxai
```

### 4.1 验证启动

```bash
# 健康检查
curl http://127.0.0.1:3008/api/status
# 应返回 {"success":true,"data":{...}}

# 公网访问验证（Nginx 443 反代）
curl https://tkonegeo.com/api/status

# 公网直连验证（3008 直连，需安全组已放行 3008）
curl http://<CVM公网IP>:3008/api/status
```

### 4.2 初始管理员登录

- 访问 `https://tkonegeo.com`
- 默认管理员账号：**root**，密码：**123456**（首次登录后立即修改）

***

## 5. 上线前必须配置的系统项

登录后台后，逐项配置：

### 5.1 通用设置（管理 → 系统）

| 配置项                       | 值                        | 说明                           |
| ------------------------- | ------------------------ | ---------------------------- |
| **服务器地址 (ServerAddress)** | `https://tkonegeo.com` | ⚠️ 支付回调地址由此拼接，必须配公网 HTTPS 域名 |
| 系统名称                      | FluxAI                   | 确认                           |

### 5.2 在线支付设置（管理 → 支付 → 支付设置）

| 配置项       | 值                          | 说明                             |
| --------- | -------------------------- | ------------------------------ |
| 启用在线支付    | 勾选                         | 充值页显示支付入口                       |
| 支付模式      | **直接到账**（微信/支付宝直连）         | 易支付模式仅当接入第三方聚合支付时选择             |
| 支付宝开关     | 按需勾选                       | 勾选后充值页显示支付宝扫码选项                 |
| 充值价格      | 按需（元/单位额度）                 | 到账 quota = 金额 ÷ PayPrice × 500000 |
| 最低/最高充值金额 | 按需（默认 1 / 5000）            |                                |

> 支付凭证说明：微信/支付宝直连的商户号、APPID、私钥、公钥等 8 项凭证已 go:embed 内置进二进制，
> 页面与接口均已禁止修改，服务器上**无需任何支付配置**。
> 支付回调地址由系统自动拼接为：`https://tkonegeo.com/api/user/pay/wechat/notify` 与 `/api/user/pay/alipay/notify`，确保公网可达。

### 5.3 模型与倍率

- 进入 **管理 → 渠道**，添加渠道，填入你的上游 API Key（七牛 BaseUrl 见文档头部）
- 确认 **管理 → 倍率** 中各模型价格正确（七牛价目自动计算 + 人工锁定双轨）
- ⚠️ 注意：未配置倍率的模型会按兜底价收费，务必补全

***

## 6. 支付联调验证（上线前必做）

1. 配置完 ServerAddress 与支付开关后，充值 **0.01~1 元** 测试（微信、支付宝各一轮）
2. 完成扫码支付，确认：
   - 扫码弹窗 3~5 秒内自动提示支付成功（到账链路：异步回调为主 + 轮询查单兜底，双通道）
   - 账户余额实时到账（quota 增加）
   - 订单状态变为"已支付"
3. 若支付成功但未到账，检查：
   - `docker logs -f fluxai` 中是否有 `/api/user/pay/wechat/notify` 或 `/api/user/pay/alipay/notify` 回调日志
   - 微信商户平台 / 支付宝开放平台后台的回调记录与交易状态
   - ServerAddress 是否为公网 HTTPS 域名（`https://tkonegeo.com`）
   - 服务器防火墙：确认 Nginx 443 → 127.0.0.1:3008 链路通（公网 curl /api/status 正常即通）

***

## 7. 数据备份

### 7.1 MySQL 定时备份

```bash
# 创建备份脚本
cat > /root/fluxai/backup.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR=/root/fluxai/backups
mkdir -p $BACKUP_DIR

docker exec fluxai-mysql mysqldump -u root -p你的Root密码 fluxai > $BACKUP_DIR/fluxai_$DATE.sql

# 保留最近 30 天
find $BACKUP_DIR -name "*.sql" -mtime +30 -delete
EOF

chmod +x /root/fluxai/backup.sh

# 添加到 crontab，每天凌晨 3 点执行
crontab -e
# 加入：0 3 * * * /root/fluxai/backup.sh
```

### 7.2 异地备份到腾讯云 COS

```bash
# 安装 COSCMD（腾讯云官方 Python 命令行工具）
pip3 install coscmd

# 配置密钥（在腾讯云控制台 → 访问管理 CAM → API 密钥管理 创建）
coscmd config -a <SecretId> -k <SecretKey> -b <BucketName-APPID> -r <地域，如 ap-shenzhen>

# 手动同步一次备份目录
coscmd upload -r /root/fluxai/backups/ backups/
```

在 backup.sh 末尾追加一行实现备份后自动上传异地：

```bash
coscmd upload $BACKUP_DIR/fluxai_$DATE.sql backups/ || echo "COS upload failed" >> /var/log/cos_backup_err.log
```

***

## 8. 日常运维

### 8.1 常用命令

```bash
# 查看服务状态
docker compose ps

# 查看日志
docker logs -f --tail=200 fluxai

# 重启服务
docker compose restart fluxai

# 更新版本（拉新镜像后）
docker compose pull fluxai
docker compose up -d fluxai

# 进入 MySQL
docker exec -it fluxai-mysql mysql -u fluxai -p fluxai
```

### 8.2 版本升级流程（增量发布）

1. 本地构建新版本镜像并推送到阿里云 ACR（2.1 节命令，换新版本号 tag）
2. 修改 CVM 上 `docker-compose.yml` 的镜像 tag（`v3.0.0` → 新版本号）
3. `docker compose pull fluxai && docker compose up -d fluxai`（仅重建 fluxai 容器，MySQL/Redis 与数据卷不动；增量分层拉取通常 1~2 分钟）
4. 验证 `https://tkonegeo.com/api/status` 返回 success 且 version 为新版本号
5. 回滚：image tag 改回旧版本号 → `docker compose up -d fluxai`（旧镜像层仍在本地，秒级回滚）

### 8.3 监控建议

- 腾讯云**可观测平台（云监控）**：CPU/内存/磁盘使用率告警策略
- 容器健康检查失败告警
- 支付到账监控：微信商户平台交易账单 + 系统内订单状态比对

***

## 9. 常见问题排查

| 问题              | 排查方向                                              |
| --------------- | ------------------------------------------------- |
| 页面打不开           | 检查 Nginx 状态、SSL 证书、443 端口安全组与 firewalld           |
| curl 80/443 返回 `403 Forbidden` 且 `Server: Beaver` | 域名未在腾讯云完成 ICP 备案/接入备案，边缘层拦截（请求未到 Nginx）；用 `curl -I http://<CVM公网IP>/api/status`（IP 直连）对比——返回 `Server: nginx` 即确认；解决：腾讯云提交备案，备案期间用 3008 直连验证 |
| 502 Bad Gateway | `docker ps` 确认 fluxai 容器在运行；检查宿主机 3008 端口监听（容器内仍为 3000）    |
| 支付成功不到账         | 确认 ServerAddress 为公网域名；查看 fluxai 日志的 notify 回调记录   |
| 接口响应慢           | 检查 MySQL/Redis 容器状态；查看是否有渠道故障                     |
| 官方镜像拉取超时        | 确认 1.3 节腾讯云内网镜像加速器已配置；检查网络                        |
| ACR 拉取报 `unauthorized` / `authentication required` | 重新执行 1.4 节 `docker login`（用户名 + ACR 访问密码）；确认镜像 tag 已 push 且 compose 中 tag 一致 |
| ACR 拉取极慢        | 跨云公网传输，受 CVM 带宽限制；增量发布只传变更层会快很多；长期方案见附录 TCR 迁移     |

***

## 10. 安全加固清单

- [ ] 修改 root 管理员默认密码（123456）
- [ ] MySQL root 密码使用强密码，不对外开放 3306 端口
- [ ] Redis 设置密码（REDIS_CONN_STRING 带密码 + requirepass），不对外开放 6379 端口
- [ ] CVM 安全组只开放 22/80/443/3008
- [ ] SESSION\_SECRET 改为随机长字符串
- [ ] 定期执行 MySQL 备份并验证可恢复（COS 异地备份）
- [ ] 配置 HTTPS，禁止 HTTP 明文传输
- [ ] 支付回调已做签名校验（微信 AES-GCM 解密 + 查单复核；支付宝 RSA2 验签 + 金额校验，系统内置）

***

## 附录：镜像仓库方案对照与 TCR 迁移路径

**当前方案（本文档主体）**：本地构建 → 阿里云 ACR（`crpi-...aliyuncs.com/flux-ai/fluxai`）→ 腾讯云 CVM 公网跨云拉取。
优点：零迁移成本，沿用现有仓库与 CI 习惯；缺点：跨云公网传输，首拉受 CVM 带宽限制。

**可选迁移：腾讯云 TCR 个人版**（拉取走腾讯云内网，速度快且免带宽计费）：

1. 腾讯云控制台 → 容器镜像服务（个人版）→ 初始化（设置访问密码）→ 创建命名空间 `flux-ai`
2. 本地推送一份镜像：`docker tag <ACR镜像> ccr.ccs.tencentyun.com/flux-ai/fluxai:v3.0.0 && docker push ...`（登录用户名 = 腾讯云账号 ID）
3. CVM 上 `docker login ccr.ccs.tencentyun.com` 后，compose 的 image 换成 TCR 地址即可，其余流程不变

***

## 附录：开发环境 → 腾讯云生产环境差异对照

| 项             | 开发环境（本地）                       | 腾讯云生产环境                                |
| ------------- | ------------------------------ | -------------------------------------- |
| 数据库           | MySQL 容器（同网络 one-api\_default） | MySQL 容器（同 compose 网络）                 |
| 端口暴露          | 3008:3000（直接对外）                | 3008:3000（Nginx 反代 + 公网直连；容器内 3000）   |
| ServerAddress | 空（localhost）                   | `https://tkonegeo.com`               |
| 支付            | 直连凭证内置（本机靠轮询查单到账）              | 直连凭证内置（公网异步回调为主 + 查单兜底）                |
| SSL           | 无                              | Certbot 自动续期 / 腾讯云免费证书手工续期             |
| 镜像仓库          | —                              | 阿里云 ACR（跨云公网拉取）；可选迁移 TCR 个人版（内网拉取）     |
| 数据持久化         | 命名卷/MySQL 容器                   | 挂载宿主机目录 + 定时备份 + COS 异地备份              |
