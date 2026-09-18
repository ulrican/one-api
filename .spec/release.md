# FluxAI 系统发布到阿里云服务器指南

> 项目：FluxAI（one-api 二开）· 流光算力 AI 聚合网关
> 发布目标：阿里云 ECS + Docker Compose + MySQL + Nginx 反向代理 + HTTPS
> 文档版本：2026-09-15

***

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
# Ubuntu
curl -fsSL https://get.docker.com | bash -s docker --mirror Aliyun
systemctl enable --now docker

# 安装 docker compose 插件（v2）
apt-get install -y docker-compose-plugin
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
docker build -t fluxai:v1.0.0 .

# 2. 登录阿里云容器镜像服务（先在控制台创建命名空间 fluxai）
docker login --username=gezimygood@163.com crpi-yrax2qagqc9gjyr1.cn-shenzhen.personal.cr.aliyuncs.com

# 3. 打标签并推送（region 替换为你的区域，如 hangzhou）
docker tag fluxai:v1.0.0 crpi-yrax2qagqc9gjyr1.cn-shenzhen.personal.cr.aliyuncs.com/flux-ai/fluxai:v1.0.0
docker push crpi-yrax2qagqc9gjyr1.cn-shenzhen.personal.cr.aliyuncs.com/flux-ai/fluxai:v1.0.0
```

### 2.2 方案 B：ECS 上直接构建（简单但慢，需 4G+ 内存）

```bash
# 在 ECS 上
apt install -y git
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
      - REDIS_CONN_STRING=redis://redis:6379
      - SESSION_SECRET=yrax2qagqc9gjyr1
      - TZ=Asia/Shanghai
      - PORT=3000
    depends_on:
      - redis
      - db
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
```

> 关键变化（相比开发版 docker-compose.yml）：
>
> - 端口绑定 `127.0.0.1:3000:3000` → 只允许本机 Nginx 访问，不直接暴露公网
> - 数据库名/用户名/密码改为自定义强密码
> - Redis 加密码 + AOF 持久化
> - 增加容器日志大小限制（daemon.json 中已配）

### 3.2 Nginx 反向代理配置

```bash
apt install -y nginx
```

创建 `/etc/nginx/conf.d/fluxai.conf`：

```nginx
server {
    listen 80;
    server_name 你的域名.com;
    return 301 https://$host$request_uri;   # HTTP 强制跳转 HTTPS
}

server {
    listen 443 ssl http2;
    server_name 你的域名.com;

    # SSL 证书路径（阿里云控制台下载后上传到 ECS）
    ssl_certificate     /etc/nginx/ssl/fluxai.pem;
    ssl_certificate_key /etc/nginx/ssl/fluxai.key;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

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

上传 SSL 证书并启动：

```bash
mkdir -p /etc/nginx/ssl
# 把阿里云下载的证书文件上传到 /etc/nginx/ssl/

nginx -t && systemctl reload nginx
```

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
curl https://你的域名.com/api/status
```

### 4.2 初始管理员登录

- 访问 `https://你的域名.com`
- 默认管理员账号：**root**，密码：**123456**（首次登录后立即修改）

***

## 5. 上线前必须配置的系统项

登录后台后，进入 **运营设置**，逐项配置：

### 5.1 通用设置

| 配置项                       | 值                  | 说明                              |
| ------------------------- | ------------------ | ------------------------------- |
| **服务器地址 (ServerAddress)** | `https://你的域名.com` | ⚠️ 支付回调地址由此拼接，必须配公网 HTTPS 域名    |
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

> 支付回调地址由系统自动拼接为：`https://你的域名.com/api/user/pay/notify`，确保公网可达。

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
4. 验证 `https://你的域名.com/api/status` 返回 success

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

