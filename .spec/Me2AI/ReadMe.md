# 本地部署命令
# 1) 构建自定义镜像（首次较慢：三套主题 npm install + go build，需联网）
docker build -t one-api-custom:latest .

# 2) 旧容器占用了名字 one-api 和端口，先停掉删除（数据在挂载卷里，不丢）
docker stop one-api
docker rm one-api

# 3) 用新镜像启动，数据卷、端口、时区保持原样
#    注意：容器内服务监听 3000 端口（EXPOSE 3000），映射为主机 3008，故为 3008:3000
docker run --name one-api -d --restart always -p 3008:3000 -e TZ=Asia/Shanghai -v D:/one-api/one-api:/data one-api-custom:latest

# docker run --name one-api -d --restart always -p 3000:3000 -e TZ=Asia/Shanghai -v D:/one-api/one-api:/data justsong/one-api

## 3. 仅本地快速预览（不打镜像）
前端开发服务器已配好代理（ package.json 里 proxy: http://localhost:3008 ，指向上面的 Docker 容器）：
cd web/default; npm start
（如遇 3000 端口占用或想多实例：$env:PORT='3007' 后再启动，访问对应端口）
后访问 http://localhost:3000/landing 即可调样式，适合开发阶段。