# FluxAI 系统发布到阿里云服务器指南

> 项目：FluxAI（one-api 二开）· 流光算力 AI 聚合网关
> 发布目标：阿里云 ECS + Docker Compose + MySQL + Nginx 反向代理 + HTTPS
> 文档版本：2026-09-15

***

## 七牛模型渠道配置
BaseUrl： https://api.qiniu.com/v1  
          https://api.qnaigc.com/v1

配置信息：
URL: https://openai.qiniu.com
KEY: sk-e758eb517d7a76372d911ca3fe2c40e46c0a78eb844ed29e09a8358e5875e6e3

## 0. 前置准备清单

| 项目       | 说明                                    | 状态 |
| -------- | ------------------------------------- | -- |
| 阿里云 ECS  | 推荐 2核4G 起，系统盘 ≥40G                    | ☐  |
| 公网域名     | 需 ICP 备案（支付回调强制要求）                    | ☐  |
| SSL 证书   | 域名 HTTPS 证书（阿里云免费 DV 或 Let's Encrypt） | ☐  |
| 易支付商户    | 网关地址 / 商户 PID / 商户密钥                  | ☐  |
| ECS 开放端口 | 22(SSH)、80(HTTP)、443(HTTPS)           | ☐  |

***

## 1. ECS 服务器初始化

### 1.1 系统选择

推荐 **Ubuntu 22.04 LTS** 或 **Alibaba Cloud Linux 3**（兼容 CentOS 生态）。

### 1.2 安装 Docker 与 Docker Compose

```bash
# CentOS（get.docker.com 脚本同时适配 CentOS/Ubuntu，自动配置 docker-ce 官方仓库）
curl -fsSL https://get.docker.com | bash -s docker --mirror Aliyun
systemctl enable --now docker

# 安装 docker compose 插件（v2；get.docker.com 脚本已配好 docker-ce 官方 yum 仓库）
dnf install -y docker-compose-plugin
docker compose version
```

### 1.3 配置阿里云镜像加速（必须）

阿里云控制台 → 容器镜像服务 → 镜像工具 → 镜像加速器，获取专属加速地址，写入 `/etc/docker/daemon.json`：

```json
{
  "registry-mirrors": [
    "https://<你的专属ID>.mirror.aliyuncs.com",
    "https://docker.1panel.live",
    "https://hub.rat.dev"
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

***

## 2. 项目构建与镜像上传

### 2.1 方案 A：本地构建镜像 + 上传到阿里云镜像仓库（推荐，省 ECS 资源）

在本地 Windows 开发机执行：

```powershell
# 1. 构建生产镜像
cd e:\97_OneAI\one-api
docker build -t fluxai:v3.0.0 .

# 2. 登录阿里云容器镜像服务（先在控制台创建命名空间 fluxai）
docker login --username=gezimygood@163.com crpi-yrax2qagqc9gjyr1.cn-shenzhen.personal.cr.aliyuncs.com

# 3. 打标签并推送（region 替换为你的区域，如 hangzhou）
docker tag fluxai:v3.0.0 crpi-yrax2qagqc9gjyr1.cn-shenzhen.personal.cr.aliyuncs.com/flux-ai/fluxai:v3.0.0
docker push crpi-yrax2qagqc9gjyr1.cn-shenzhen.personal.cr.aliyuncs.com/flux-ai/fluxai:v3.0.0
```

### 2.2 方案 B：ECS 上直接构建（简单但慢，需 4G+ 内存）

```bash
# 在 ECS 上
dnf install -y git
git clone <你的代码仓库> /opt/fluxai
cd /opt/fluxai
docker build -t fluxai:v1.0.0 .
```

> 注意：Dockerfile 里 `npm install` 依赖 npm 源，ECS 上可能需要配置 npm 淘宝镜像。构建过程约 10\~15 分钟。

***

## 3. 部署目录结构

在 ECS 上创建部署目录：

```bash
mkdir -p /root/fluxai/{data,logs,mysql-data,redis-data}
cd /root/fluxai
```

### 3.1 docker-compose.yml（生产版）

```yaml
version: '3.8'

services:
  fluxai:
    image: crpi-yrax2qagqc9gjyr1.cn-shenzhen.personal.cr.aliyuncs.com/flux-ai/fluxai:v1.0.0  # 改成你的镜像地址
    container_name: fluxai
    restart: always
    command: --log-dir /app/logs
    ports:
      - "127.0.0.1:3000:3000"        # 只暴露给本机 Nginx，不直接对外
    volumes:
      - ./logs:/app/logs
    environment:
      - SQL_DSN=fluxai:flux1234@tcp(db:3306)/fluxai?charset=utf8mb4&parseTime=True&loc=Local
      - REDIS_CONN_STRING=redis://:flux1234@redis:6379
      - SYNC_FREQUENCY=60          # 必须设置！缺省时 Redis 被静默禁用（日志：SYNC_FREQUENCY not set, Redis is disabled）
      - SESSION_SECRET=yrax2qagqc9gjyr1
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

# docker exec fluxai-mysql mysql -ufluxai -pflux1234 fluxai   -e "SELECT id, name, type, CONCAT('[', base_url, ']') AS base_url_raw FROM channels;"
> 关键变化（相比开发版 docker-compose.yml）：
>
> - 端口绑定 `127.0.0.1:3000:3000` → 只允许本机 Nginx 访问，不直接暴露公网
> - 数据库名/用户名/密码改为自定义强密码
> - Redis 加密码 + AOF 持久化
> - 增加容器日志大小限制（daemon.json 中已配）

### 3.2 Nginx 反向代理配置

```bash
# CentOS 8/Stream 用 dnf；CentOS 7 改用 yum install -y nginx
dnf install -y nginx
systemctl enable --now nginx

# CentOS 默认启用 firewalld（阿里云安全组之外的本机防火墙），必须放行 80/443
firewall-cmd --permanent --add-service=http --add-service=https
firewall-cmd --reload
```

创建 `/etc/nginx/conf.d/fluxai.conf`（**初始只配 80 端口**，HTTPS 配置由 3.3 节 Certbot 自动插入）：

```nginx
server {
    listen 80;
    server_name api.hyenlab.cn;

    # 客户端上传/请求体大小限制
    client_max_body_size 100m;

    # 代理到 FluxAI 容器
    location / {
        proxy_pass http://127.0.0.1:3000;
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
curl -I http://api.hyenlab.cn/api/status   # 确认 80 端口 HTTP 已可访问
```

### 3.3 SSL 证书：Let's Encrypt + Certbot 自动续期（方案 A，推荐）

Certbot 会自动完成「申请证书 → 改写 Nginx 配置插入 443 server 块与 80→443 跳转 → 注册定时续期」，**配置一次永久免手工续期**。

#### 3.3.1 前置条件检查（申请前必须全部满足）

| 检查项 | 验证命令 | 说明 |
| --- | --- | --- |
| 域名 DNS 已解析到 ECS 公网 IP | `nslookup api.hyenlab.cn` | Let's Encrypt 回源验证依赖解析生效 |
| 安全组已开放 80、443 端口 | 阿里云控制台安全组规则 | HTTP-01 验证必须 80 端口公网可达 |
| 80 端口站点可访问 | `curl -I http://api.hyenlab.cn/api/status` | 3.2 节初始配置已生效 |
| Nginx 配置含 `server_name api.hyenlab.cn;` | `nginx -T \| grep server_name` | certbot --nginx 靠它定位要改写的 server 块 |

#### 3.3.2 安装 Certbot（snap 官方推荐方式）

```bash
# CentOS 需先从 EPEL 安装 snapd（CentOS 7 把 dnf 换成 yum）
dnf install -y epel-release
dnf install -y snapd
systemctl enable --now snapd.socket
ln -sf /var/lib/snapd/snap /snap

# 使 snap 命令路径在当前 shell 生效（或重新登录 SSH）
source /etc/profile.d/snapd.sh 2>/dev/null || true

# 安装 Certbot
snap install core && snap refresh core
snap install --classic certbot
ln -sf /snap/bin/certbot /usr/bin/certbot
certbot --version
```

> 备选：CentOS 无 snapd 环境时可用 pip 方式 `dnf install -y python3 augeas-libs && python3 -m pip install certbot certbot-nginx`，但 snap 方式升级维护最省心。

#### 3.3.3 一键申请证书并自动配置 Nginx

```bash
certbot --nginx -d api.hyenlab.cn \
  --email 530028130@qq.com \
  --agree-tos --no-eff-email \
  --redirect
```

参数说明：

- `--nginx`：调用 Nginx 插件，自动完成回源验证 + 改写 `fluxai.conf`（插入 `listen 443 ssl`、`ssl_certificate` 指向 `/etc/letsencrypt/live/api.hyenlab.cn/`、HTTP→HTTPS 301 跳转）
- `--redirect`：强制 HTTP 跳转 HTTPS（推荐；不想要跳转可去掉）
- 成功后输出 `Congratulations!` 与证书路径、到期日期

> ⚠️ Let's Encrypt 有频率限制（同一域名每周 5 次成功签发），命令确认无误再执行；调试请用 `--dry-run` 或 `--staging`。

#### 3.3.4 验证 HTTPS 生效

```bash
nginx -t                                # certbot 改写后配置语法校验
curl -vI https://api.hyenlab.cn/api/status 2>&1 | grep -E "SSL connection|HTTP/"
# 期望：SSL connection using TLSv1.3 ... 和 HTTP/2 200
```

浏览器访问 `https://api.hyenlab.cn` 应显示锁形图标，点击可查看证书（颁发者 R10/R11/Let's Encrypt，有效期 90 天）。

#### 3.3.5 自动续期机制与验证

snap 安装的 Certbot 已自动注册 systemd 定时器，**每天检查两次，剩余有效期 ≤30 天时自动续期**，无需任何手工干预。

```bash
# 1. 确认续期定时器已激活
systemctl list-timers | grep certbot
# 期望输出：certbot.timer ... certbot.service

# 2. 演练一次续期（不实际签发，验证全流程可用）
certbot renew --dry-run
# 期望输出：Congratulations, all simulated renewals succeeded
```

续期后自动生效说明：

- `--nginx` 插件安装的证书，续期后 Certbot 会**自动 reload Nginx**，无需重启 fluxai 容器
- 如需显式钩子（双保险）：`echo 'deploy-hook = systemctl reload nginx' >> /etc/letsencrypt/cli.ini`
- 证书文件固定位于 `/etc/letsencrypt/live/api.hyenlab.cn/fullchain.pem` 与 `privkey.pem`，续期只更新内容、路径不变

#### 3.3.6 常见问题

| 问题 | 排查 |
| --- | --- |
| 申请失败 `Timeout during connect` | 安全组 80 端口未开放 / DNS 未生效 / ECS 上 80 被占用 |
| 申请失败 `Invalid response` | 域名解析到了其他 IP；CDN/云防护拦截了 `/.well-known/acme-challenge/` |
| 后续修改了 fluxai.conf | 不要动 certbot 插入的 `# managed by Certbot` 注释行；改完 `nginx -t && systemctl reload nginx` |
| 换域名/加域名 | 重新执行 3.3.3 命令（`-d 新域名`），旧证书可 `certbot delete` 清理 |

---

### 3.4 备选：阿里云免费 DV 证书（方案 B，手工续期）

若不想装 Certbot（如 80 端口不便开放回源验证），可用阿里云免费证书，但**有效期仅 3 个月、到期必须手工重新申请**：

1. **申请**：阿里云控制台 → 数字证书管理服务 → 免费证书 → 0 元购买 → 证书申请（绑 `api.hyenlab.cn`，DNS 自动验证）→ 约 1~10 分钟签发
2. **下载**：证书列表 → 下载 → 服务器类型选 **Nginx**，解压得 `api.hyenlab.cn.pem` + `api.hyenlab.cn.key`
3. **上传安装**（本地 PowerShell 执行 scp，再在 ECS 归位）：

   ```powershell
   scp .\api.hyenlab.cn.pem .\api.hyenlab.cn.key root@<ECS公网IP>:/root/
   ```

   ```bash
   mkdir -p /etc/nginx/ssl
   mv /root/api.hyenlab.cn.pem /etc/nginx/ssl/fluxai.pem
   mv /root/api.hyenlab.cn.key /etc/nginx/ssl/fluxai.key
   chmod 600 /etc/nginx/ssl/fluxai.key && chmod 644 /etc/nginx/ssl/fluxai.pem
   ```

4. **改写 fluxai.conf 为完整 HTTPS 版**（在 3.2 节配置基础上追加跳转与 443 server 块）：

   ```nginx
   server {
       listen 80;
       server_name api.hyenlab.cn;
       return 301 https://$host$request_uri;
   }

   server {
       listen 443 ssl http2;
       server_name api.hyenlab.cn;
       ssl_certificate     /etc/nginx/ssl/fluxai.pem;
       ssl_certificate_key /etc/nginx/ssl/fluxai.key;
       ssl_protocols       TLSv1.2 TLSv1.3;
       ssl_ciphers         HIGH:!aNULL:!MD5;
       client_max_body_size 100m;

       location / {
           proxy_pass http://127.0.0.1:3000;
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
cd /opt/fluxai
docker compose up -d

# 查看启动日志（首次启动需 2~3 分钟初始化 token encoders）
docker logs -f fluxai
```

### 4.1 验证启动

```bash
# 健康检查
curl http://127.0.0.1:3000/api/status
# 应返回 {"success":true,"data":{...}}

# 公网访问验证
curl https://api.hyenlab.cn/api/status
```

### 4.2 初始管理员登录

- 访问 `https://api.hyenlab.cn`
- 默认管理员账号：**root**，密码：**123456**（首次登录后立即修改）

***

## 5. 上线前必须配置的系统项

登录后台后，进入 **运营设置**，逐项配置：

### 5.1 通用设置

| 配置项                       | 值                  | 说明                              |
| ------------------------- | ------------------ | ------------------------------- |
| **服务器地址 (ServerAddress)** | `https://api.hyenlab.cn` | ⚠️ 支付回调地址由此拼接，必须配公网 HTTPS 域名    |
| 系统名称                      | FluxAI             | 已改，确认                           |
| 聊天页面链接 (ChatLink)         | 可选                 | 第三方聊天前端地址，不配则按钮回退到内置 Playground |

### 5.2 在线支付设置

| 配置项       | 值                                  |
| --------- | ---------------------------------- |
| 启用在线支付    | 勾选                                 |
| 支付网关地址    | 你的易支付平台地址（如 `https://pay.xxx.com`） |
| 商户 PID    | 易支付平台分配的商户 ID                      |
| 商户密钥      | 易支付平台分配的 MD5 密钥                    |
| 充值价格      | 默认 7.3（元/1美元额度）                    |
| 最低/最高充值金额 | 按需（默认 1 / 5000）                    |

> 支付回调地址由系统自动拼接为：`https://api.hyenlab.cn/api/user/pay/notify`，确保公网可达。

### 5.3 模型与倍率

- 进入 **渠道管理 → 添加渠道**，填入你的上游 API Key
- 确认 **运营设置 → 倍率设置** 中各模型价格正确
- ⚠️ 注意：未配置倍率的模型会按兜底 30（最贵档）收费，务必补全

***

## 6. 支付联调验证（上线前必做）

1. 配置完支付参数后，充值 **1 元** 测试
2. 完成支付，确认：
   - 页面跳回并显示支付成功
   - 账户余额实时到账（quota 增加）
   - 订单状态变为"已支付"
3. 若支付成功但未到账，检查：
   - `docker logs -f fluxai` 中是否有 `/api/user/pay/notify` 回调日志
   - 易支付平台后台的回调记录是否成功
   - ServerAddress 是否为公网 HTTPS 域名

***

## 7. 数据备份

### 7.1 MySQL 定时备份

```bash
# 创建备份脚本
cat > /opt/fluxai/backup.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR=/opt/fluxai/backups
mkdir -p $BACKUP_DIR

docker exec fluxai-mysql mysqldump -u root -p你的Root密码 fluxai > $BACKUP_DIR/fluxai_$DATE.sql

# 保留最近 30 天
find $BACKUP_DIR -name "*.sql" -mtime +30 -delete
EOF

chmod +x /opt/fluxai/backup.sh

# 添加到 crontab，每天凌晨 3 点执行
crontab -e
# 加入：0 3 * * * /opt/fluxai/backup.sh
```

### 7.2 异地备份

将 `/opt/fluxai/backups/` 同步到阿里云 OSS 或其他服务器：

```bash
# 使用 ossutil 或 rclone
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

### 8.2 版本升级流程

1. 本地构建新版本镜像并推送到阿里云镜像仓库
2. 修改 ECS 上 `docker-compose.yml` 的镜像 tag
3. `docker compose pull && docker compose up -d`
4. 验证 `https://api.hyenlab.cn/api/status` 返回 success

### 8.3 监控建议

- 阿里云云监控：CPU/内存/磁盘使用率告警
- 容器健康检查失败告警
- 支付回调失败率监控（可在易支付平台后台查看）

***

## 9. 常见问题排查

| 问题              | 排查方向                                             |
| --------------- | ------------------------------------------------ |
| 页面打不开           | 检查 Nginx 状态、SSL 证书、443 端口安全组                     |
| 502 Bad Gateway | `docker ps` 确认 fluxai 容器在运行；检查 3000 端口监听         |
| 支付成功不到账         | 确认 ServerAddress 为公网域名；查看 fluxai 日志的 notify 回调记录 |
| 接口响应慢           | 检查 MySQL/Redis 容器状态；查看是否有渠道故障                    |
| 镜像拉取超时          | 确认阿里云镜像加速器已配置；检查网络                               |

***

## 10. 安全加固清单

- [ ] 修改 root 管理员默认密码（123456）
- [ ] MySQL root 密码使用强密码，不对外开放 3306 端口
- [ ] Redis 设置密码，不对外开放 6379 端口
- [ ] ECS 安全组只开放 22/80/443
- [ ] SESSION\_SECRET 改为随机长字符串
- [ ] 定期执行 MySQL 备份并验证可恢复
- [ ] 配置 HTTPS，禁止 HTTP 明文传输
- [ ] 支付回调已做签名校验（系统内置，无需额外配置）

***

## 附录：开发环境 → 生产环境差异对照

| 项             | 开发环境（本地）                       | 生产环境（阿里云）                      |
| ------------- | ------------------------------ | ------------------------------ |
| 数据库           | MySQL 容器（同网络 one-api\_default） | MySQL 容器（同 compose 网络）         |
| 端口暴露          | 3008:3000（直接对外）                | 127.0.0.1:3000:3000 + Nginx 反代 |
| ServerAddress | 空（localhost）                   | 公网 HTTPS 域名                    |
| 支付            | 未配置                            | 易支付商户 + 公网回调                   |
| SSL           | 无                              | Nginx 终止 SSL                   |
| 数据持久化         | 命名卷/MySQL 容器                   | 挂载宿主机目录 + 定时备份                 |

