package config

import (
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/songquanpeng/one-api/common/env"

	"github.com/google/uuid"
)

var SystemName = "FluxAI"
var ServerAddress = "http://localhost:3000"
var Footer = ""
var Logo = ""
var TopUpLink = ""
var ChatLink = ""
var QuotaPerUnit = 500 * 1000.0 // $0.002 / 1K tokens
var DisplayInCurrencyEnabled = true
var DisplayTokenStatEnabled = true

// Any options with "Secret", "Token" in its key won't be return by GetOptions

var SessionSecret = uuid.New().String()

var OptionMap map[string]string
var OptionMapRWMutex sync.RWMutex

var ItemsPerPage = 10
var MaxRecentItems = 100

var PasswordLoginEnabled = true
var PasswordRegisterEnabled = true
var EmailVerificationEnabled = false
var GitHubOAuthEnabled = false
var OidcEnabled = false
var WeChatAuthEnabled = false
var TurnstileCheckEnabled = false
var RegisterEnabled = true

var EmailDomainRestrictionEnabled = false
var EmailDomainWhitelist = []string{
	"gmail.com",
	"163.com",
	"126.com",
	"qq.com",
	"outlook.com",
	"hotmail.com",
	"icloud.com",
	"yahoo.com",
	"foxmail.com",
}

var DebugEnabled = strings.ToLower(os.Getenv("DEBUG")) == "true"
var DebugSQLEnabled = strings.ToLower(os.Getenv("DEBUG_SQL")) == "true"
var MemoryCacheEnabled = strings.ToLower(os.Getenv("MEMORY_CACHE_ENABLED")) == "true"

var LogConsumeEnabled = true

var SMTPServer = ""
var SMTPPort = 587
var SMTPAccount = ""
var SMTPFrom = ""
var SMTPToken = ""

var GitHubClientId = ""
var GitHubClientSecret = ""

var LarkClientId = ""
var LarkClientSecret = ""

var OidcClientId = ""
var OidcClientSecret = ""
var OidcWellKnown = ""
var OidcAuthorizationEndpoint = ""
var OidcTokenEndpoint = ""
var OidcUserinfoEndpoint = ""

var WeChatServerAddress = ""
var WeChatServerToken = ""
var WeChatAccountQRCodeImageURL = ""

var MessagePusherAddress = ""
var MessagePusherToken = ""

var TurnstileSiteKey = ""
var TurnstileSecretKey = ""

var QuotaForNewUser int64 = 0
var QuotaForInviter int64 = 0
var QuotaForInvitee int64 = 0

// 在线充值（易支付 Epay）
var PayEnabled = false
var PaymentMode = "epay"                          // 支付模式：epay=易支付, direct=直接到账（微信/支付宝原生）
var PayAddress = ""                               // 易支付网关地址
var EpayId = ""                                   // 商户 PID
var EpaySecret = ""                               // 商户密钥（key 含 Secret，GetOptions 自动脱敏）
var PayPrice = 7.3                                // 每 1 美元额度的人民币售价
var MinTopUp = 1.0                                // 最低充值金额（元）
var MaxTopUp = 5000.0                             // 最高充值金额（元）
var TopupAmountOptions = "[10,30,50,100,200,500]" // 充值金额预设（JSON 数组）

// 直接到账-微信支付配置（PaymentMode=direct 时使用）
// Task4-10b：凭证代码内置（paycredentials.go + paycerts/ embed），不再接受 DB/页面配置覆盖
var WeChatPayAppId = WeChatPayAppIDConst           // 微信支付 APPID（公众号/小程序/移动应用）
var WeChatPayMchId = WeChatPayMchIDConst           // 微信支付商户号
var WeChatPayApiV3Key = WeChatPayApiV3KeyConst     // 微信支付 API v3 密钥
var WeChatPaySerialNo = WeChatPaySerialConst       // 微信支付商户证书序列号
var WeChatPayPrivateKey = WeChatPayPrivateKeyConst // 微信支付商户私钥（PKCS#8 PEM，go:embed 内置）

// 直接到账-支付宝配置（PaymentMode=direct 时使用）
// 凭证代码内置；AlipayEnabled 是唯一保留在设置页的子开关（支付宝订单码扫码）
var AlipayAppId = AlipayAppIDConst           // 支付宝应用 APPID
var AlipayPrivateKey = AlipayPrivateKeyConst // 支付宝应用私钥（PKCS#8 base64）
var AlipayPublicKey = AlipayPublicKeyConst   // 支付宝公钥（SPKI base64，验签）
var AlipayEnabled = false                    // 支付宝（订单码）启用开关；微信 Native 凭证内置即恒可用
// 每日签到
var CheckInEnabled = false
var CheckInMinReward int64 = 100
var CheckInMaxReward int64 = 10000

// CheckInTier 签到阶梯奖励：当月累计签到达到 Days 天时，额外赠送 Quota 额度
type CheckInTier struct {
	Days  int   `json:"days"`
	Quota int64 `json:"quota"`
}

// CheckInTiers 签到阶梯配置（按 Days 升序），默认 3/7/14/21/30 天五档
var CheckInTiers = []CheckInTier{
	{Days: 3, Quota: 1000},
	{Days: 7, Quota: 3000},
	{Days: 14, Quota: 5000},
	{Days: 21, Quota: 10000},
	{Days: 30, Quota: 20000},
}

// Playground 内嵌对话（F7）
var PlaygroundEnabled = false

// F15 公开排行榜
var RankingEnabled = false

// Task4-1 模型广场（七牛模型库每日同步，公开营销页，默认开启）
var MarketplaceEnabled = true
var QiniuApiSecret = "sk-e758eb517d7a76372d911ca3fe2c40e46c0a78eb844ed29e09a8358e5875e6e3"
var ChannelDisableThreshold = 5.0
var AutomaticDisableChannelEnabled = false
var AutomaticEnableChannelEnabled = false
var QuotaRemindThreshold int64 = 1000
var PreConsumedQuota int64 = 500
var ApproximateTokenEnabled = false
var RetryTimes = 0

var RootUserEmail = ""

var IsMasterNode = os.Getenv("NODE_TYPE") != "slave"

var requestInterval, _ = strconv.Atoi(os.Getenv("POLLING_INTERVAL"))
var RequestInterval = time.Duration(requestInterval) * time.Second

var SyncFrequency = env.Int("SYNC_FREQUENCY", 10*60) // unit is second
var BatchUpdateEnabled = false
var BatchUpdateInterval = env.Int("BATCH_UPDATE_INTERVAL", 5)

// F10 配额警告扫描间隔（秒）；用户侧开关为 per-user 配置（user_settings），不配置即不告警
var QuotaWarningInterval = env.Int("QUOTA_WARNING_INTERVAL", 600)

// F11 渠道监控告警（管理端 options 可配）
var ChannelAlertEnabled = false      // 渠道故障 webhook 告警总开关（邮件通知为原有行为，不受此开关影响）
var ChannelAlertWebhookUrl = ""      // 告警 webhook 地址
var ChannelAlertCooldownMinutes = 30 // 同一渠道告警冷却（分钟），恢复事件不受冷却限制
var ChannelMetricEnabled = true      // 渠道可用率统计（内存滑动窗口；与 env ENABLE_METRIC 为或关系）

var RelayTimeout = env.Int("RELAY_TIMEOUT", 0) // unit is second

var GeminiSafetySetting = env.String("GEMINI_SAFETY_SETTING", "BLOCK_NONE")

var Theme = env.String("THEME", "default")
var ValidThemes = map[string]bool{
	"default": true,
	"berry":   true,
	"air":     true,
}

// All duration's unit is seconds
// Shouldn't larger then RateLimitKeyExpirationDuration
var (
	GlobalApiRateLimitNum            = env.Int("GLOBAL_API_RATE_LIMIT", 480)
	GlobalApiRateLimitDuration int64 = 3 * 60

	GlobalWebRateLimitNum            = env.Int("GLOBAL_WEB_RATE_LIMIT", 240)
	GlobalWebRateLimitDuration int64 = 3 * 60

	UploadRateLimitNum            = 10
	UploadRateLimitDuration int64 = 60

	DownloadRateLimitNum            = 10
	DownloadRateLimitDuration int64 = 60

	CriticalRateLimitNum            = 20
	CriticalRateLimitDuration int64 = 20 * 60
)

var RateLimitKeyExpirationDuration = 20 * time.Minute

var EnableMetric = env.Bool("ENABLE_METRIC", false)
var MetricQueueSize = env.Int("METRIC_QUEUE_SIZE", 10)
var MetricSuccessRateThreshold = env.Float64("METRIC_SUCCESS_RATE_THRESHOLD", 0.8)
var MetricSuccessChanSize = env.Int("METRIC_SUCCESS_CHAN_SIZE", 1024)
var MetricFailChanSize = env.Int("METRIC_FAIL_CHAN_SIZE", 128)

// F9b 数据面路由增强：动态剔除参数（连续失败阈值 / 失败窗口；窗口过期自动恢复参与选路）
var RoutingExcludeThreshold = env.Int("ROUTING_EXCLUDE_THRESHOLD", 3)
var RoutingExcludeWindowSeconds = env.Int("ROUTING_EXCLUDE_WINDOW_SECONDS", 600)

var InitialRootToken = os.Getenv("INITIAL_ROOT_TOKEN")

var InitialRootAccessToken = os.Getenv("INITIAL_ROOT_ACCESS_TOKEN")

var GeminiVersion = env.String("GEMINI_VERSION", "v1")

var OnlyOneLogFile = env.Bool("ONLY_ONE_LOG_FILE", false)

var RelayProxy = env.String("RELAY_PROXY", "")
var UserContentRequestProxy = env.String("USER_CONTENT_REQUEST_PROXY", "")
var UserContentRequestTimeout = env.Int("USER_CONTENT_REQUEST_TIMEOUT", 30)

var EnforceIncludeUsage = env.Bool("ENFORCE_INCLUDE_USAGE", false)
var TestPrompt = env.String("TEST_PROMPT", "Output only your specific model name with no additional text.")
