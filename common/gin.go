package common

import (
	"bytes"
	"encoding/json"
	"io"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/songquanpeng/one-api/common/ctxkey"
)

func GetRequestBody(c *gin.Context) ([]byte, error) {
	requestBody, _ := c.Get(ctxkey.KeyRequestBody)
	if requestBody != nil {
		return requestBody.([]byte), nil
	}
	requestBody, err := io.ReadAll(c.Request.Body)
	if err != nil {
		return nil, err
	}
	_ = c.Request.Body.Close()
	c.Set(ctxkey.KeyRequestBody, requestBody)
	return requestBody.([]byte), nil
}

func UnmarshalBodyReusable(c *gin.Context, v any) error {
	requestBody, err := GetRequestBody(c)
	if err != nil {
		return err
	}
	contentType := c.Request.Header.Get("Content-Type")
	if strings.HasPrefix(contentType, "application/json") {
		err = json.Unmarshal(requestBody, &v)
	} else {
		c.Request.Body = io.NopCloser(bytes.NewBuffer(requestBody))
		// Task4-9：v(any) 内部已持有调用方传入的结构体指针（如 *ModelRequest）。
		// gin form 绑定（multipart/form-data）无法穿透 *interface{} 间接层，
		// 必须传 v 本身；JSON 分支依赖 encoding/json 对 interface 的特殊解包，仍用 &v。
		// 修复前 multipart 请求的 model 字段绑定为空，audio 转写回退为 whisper-1，
		// 导致令牌模型白名单校验 403、渠道选路错误（上游既有缺陷）。
		err = c.ShouldBind(v)
	}
	if err != nil {
		return err
	}
	// Reset request body
	c.Request.Body = io.NopCloser(bytes.NewBuffer(requestBody))
	return nil
}

func SetEventStreamHeaders(c *gin.Context) {
	c.Writer.Header().Set("Content-Type", "text/event-stream")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("Connection", "keep-alive")
	c.Writer.Header().Set("Transfer-Encoding", "chunked")
	c.Writer.Header().Set("X-Accel-Buffering", "no")
}
