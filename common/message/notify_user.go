package message

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/songquanpeng/one-api/common/logger"
)

// F10 用户级通知渠道：email 复用 SendEmail（receiver=用户绑定邮箱），
// bark/gotify/webhook 为 HTTP 直投；参数来自 user_settings.notify_payload
// 注意：model 包已依赖本包，常量定义在此，model/controller 引用 message.NotifyTypeXxx

const (
	NotifyTypeEmail   = "email"
	NotifyTypeBark    = "bark"
	NotifyTypeGotify  = "gotify"
	NotifyTypeWebhook = "webhook"
)

const notifyHTTPTimeout = 10 * time.Second

type BarkPayload struct {
	ServerUrl string `json:"server_url"`
	DeviceKey string `json:"device_key"`
}

type GotifyPayload struct {
	ServerUrl string `json:"server_url"`
	AppToken  string `json:"app_token"`
}

type WebhookPayload struct {
	Url    string `json:"url"`
	Secret string `json:"secret"`
}

func postJSON(url string, headers map[string]string, body any) error {
	data, err := json.Marshal(body)
	if err != nil {
		return err
	}
	client := &http.Client{Timeout: notifyHTTPTimeout}
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(data))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return fmt.Errorf("notify target returned status %d", resp.StatusCode)
	}
	return nil
}

// SendUserNotify 按用户配置的通道投递通知；setting.NotifyType 为空时直接报错。
func SendUserNotify(notifyType string, payloadJson string, userEmail string, title string, content string) error {
	switch notifyType {
	case NotifyTypeEmail:
		if userEmail == "" {
			return fmt.Errorf("未绑定邮箱，无法使用邮件通知")
		}
		return SendEmail(title, userEmail, content)
	case NotifyTypeBark:
		var p BarkPayload
		if err := json.Unmarshal([]byte(payloadJson), &p); err != nil {
			return fmt.Errorf("Bark 参数解析失败：%s", err.Error())
		}
		if p.DeviceKey == "" {
			return fmt.Errorf("Bark DeviceKey 不能为空")
		}
		server := p.ServerUrl
		if server == "" {
			server = "https://api.day.app"
		}
		return postJSON(server+"/push", nil, map[string]string{
			"device_key": p.DeviceKey,
			"title":      title,
			"body":       content,
			"group":      "one-api",
		})
	case NotifyTypeGotify:
		var p GotifyPayload
		if err := json.Unmarshal([]byte(payloadJson), &p); err != nil {
			return fmt.Errorf("Gotify 参数解析失败：%s", err.Error())
		}
		if p.ServerUrl == "" || p.AppToken == "" {
			return fmt.Errorf("Gotify server_url / app_token 不能为空")
		}
		return postJSON(fmt.Sprintf("%s/message?token=%s", p.ServerUrl, p.AppToken), nil, map[string]any{
			"title":    title,
			"message":  content,
			"priority": 5,
		})
	case NotifyTypeWebhook:
		var p WebhookPayload
		if err := json.Unmarshal([]byte(payloadJson), &p); err != nil {
			return fmt.Errorf("Webhook 参数解析失败：%s", err.Error())
		}
		if p.Url == "" {
			return fmt.Errorf("Webhook URL 不能为空")
		}
		headers := map[string]string{}
		if p.Secret != "" {
			headers["X-OneApi-Secret"] = p.Secret
		}
		return postJSON(p.Url, headers, map[string]any{
			"title":     title,
			"content":   content,
			"timestamp": time.Now().Unix(),
		})
	default:
		return fmt.Errorf("未知通知方式：%s", notifyType)
	}
}

// SendUserNotifyQuiet：忽略错误仅记日志（供后台协程使用）
func SendUserNotifyQuiet(notifyType string, payloadJson string, userEmail string, title string, content string) error {
	err := SendUserNotify(notifyType, payloadJson, userEmail, title, content)
	if err != nil {
		logger.SysErrorf("user notify failed (type=%s): %s", notifyType, err.Error())
	}
	return err
}
