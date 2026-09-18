// Package marketplace 七牛模型库（openai.qiniu.com）客户端与模型库同步辅助。
// Task4-1：管控面使用，禁止在 relay/ 数据面链路中调用。
package marketplace

import (
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"
)

const (
	// QiniuMarketModelsURL 七牛模型广场列表接口
	QiniuMarketModelsURL = "https://openai.qiniu.com/v1/market/models"
)

// QiniuModel 单个模型：强类型解析结构 + 原始 JSON（落 detail_json，详情页原样透传）
type QiniuModel struct {
	Raw   json.RawMessage
	Model QiniuModelRaw
}

// QiniuModelRaw 只强类型化同步所需字段，其余字段随 Raw 留存
type QiniuModelRaw struct {
	Id                  string            `json:"id"`
	Name                string            `json:"name"`
	Description         string            `json:"description"`
	Avatar              string            `json:"avatar"`
	Issuer              QiniuIssuer       `json:"issuer"`
	HotTags             []string          `json:"hot_tags"`
	Features            []string          `json:"features"`
	Architecture        QiniuArchitecture `json:"architecture"`
	ModelConstraints    QiniuConstraints  `json:"model_constraints"`
	PricingRulesV2      []QiniuPriceTier  `json:"pricing_rules_v2"`
	RateLimit           QiniuRateLimit    `json:"rate_limit"`
	SupportApiProtocols []string          `json:"support_api_protocols"`
	ModelFiling         QiniuFiling       `json:"model_filing"`
	Rank                int               `json:"rank"`
	ReleaseAt           string            `json:"release_at"`
	RetirementAt        string            `json:"retirement_at"`
	SuggestedModel      string            `json:"suggested_model"`
	ModelAlias          FlexibleStringList `json:"model_alias"`
	PricingPageUrl      string            `json:"pricing_page_url"`
	Private             bool              `json:"private"`
	CreatedTime         string            `json:"created_time"`
}

// QiniuIssuer 厂商
type QiniuIssuer struct {
	Name      string `json:"name"`
	Avatar    string `json:"avatar"`
	ModelPage string `json:"model_page"`
}

// QiniuArchitecture 架构能力（实测各能力项为 {supported:bool} 对象）
type QiniuArchitecture struct {
	InputModalities  []string             `json:"input_modalities"`
	OutputModalities []string             `json:"output_modalities"`
	FunctionCalling  QiniuCapabilityFlag  `json:"function_calling"`
	Reasoning        QiniuCapabilityFlag  `json:"reasoning"`
	SchemaOutput     QiniuCapabilityFlag  `json:"schema_output"`
	ContentCache     QiniuCapabilityFlag  `json:"content_cache"`
}

// QiniuCapabilityFlag 兼容 {supported:true} 对象与裸 bool 两种形态
type QiniuCapabilityFlag struct {
	Supported bool
}

func (f *QiniuCapabilityFlag) UnmarshalJSON(data []byte) error {
	trimmed := strings.TrimSpace(string(data))
	if trimmed == "" || trimmed == "null" {
		return nil
	}
	if trimmed == "true" {
		f.Supported = true
		return nil
	}
	if trimmed == "false" {
		f.Supported = false
		return nil
	}
	var wrapper struct {
		Supported bool `json:"supported"`
	}
	if err := json.Unmarshal(data, &wrapper); err != nil {
		return err
	}
	f.Supported = wrapper.Supported
	return nil
}

// QiniuConstraints 模型约束
type QiniuConstraints struct {
	ContextLength         int64 `json:"context_length"`
	MaxCompletionTokens   int64 `json:"max_completion_tokens"`
	MaxTokens             int64 `json:"max_tokens"`
}

// QiniuPriceItem pricing_rules_v2 单个计价项
type QiniuPriceItem struct {
	Name         string  `json:"name"`
	UnitName     string  `json:"unit_name"`
	UnitSize     float64 `json:"unit_size"`
	UnitPrice    float64 `json:"unit_price"`     // 人民币
	UnitPriceUsd float64 `json:"unit_price_usd"` // 美元
}

// QiniuPriceTier 分档定价一档；details_v2 为可变键 map
// （文本 input/output、缓存 cache/ncache、思考 th/nth、生图 ti_quantity、视频 v_duration 等）
type QiniuPriceTier struct {
	InputRange  []int64                    `json:"input_range"`
	OutputRange []int64                    `json:"output_range"`
	DetailsV2   map[string]*QiniuPriceItem `json:"details_v2"`
}

// QiniuRateLimitItem 限流单项
type QiniuRateLimitItem struct {
	Name     string `json:"name"`
	Quantity int64  `json:"quantity"`
	UnitName string `json:"unit_name"`
	UnitTime int64  `json:"unit_time"`
}

// QiniuRateLimit 限流（ipm/qpm/rpm/tpm，键可能缺失）
type QiniuRateLimit map[string]QiniuRateLimitItem

// QiniuFiling 备案信息（实测为对象）
type QiniuFiling struct {
	FilingNo string `json:"filing_no"`
}

// 兼容 model_alias 为数组或字符串两种形态
type FlexibleStringList []string

func (l *FlexibleStringList) UnmarshalJSON(data []byte) error {
	trimmed := strings.TrimSpace(string(data))
	if trimmed == "" || trimmed == "null" || trimmed == `[]` {
		return nil
	}
	if trimmed[0] == '[' {
		var arr []string
		if err := json.Unmarshal(data, &arr); err != nil {
			return err
		}
		*l = arr
		return nil
	}
	var s string
	if err := json.Unmarshal(data, &s); err != nil {
		return err
	}
	if s != "" {
		*l = []string{s}
	}
	return nil
}

type qiniuListResponse struct {
	Status bool                `json:"status"`
	Data   []json.RawMessage `json:"data"`
}

// FetchQiniuModels 拉取一页模型（overseas=false 国内集合；overseas=true 全量集合）。
// 返回顺序与接口一致，Raw 为每个模型的原始 JSON 字节。
func FetchQiniuModels(secret string, overseas bool) ([]*QiniuModel, error) {
	if secret == "" {
		return nil, fmt.Errorf("七牛 API Key 未配置")
	}
	reqUrl := QiniuMarketModelsURL + "?overseas=" + url.QueryEscape(fmt.Sprintf("%v", overseas))
	req, err := http.NewRequest(http.MethodGet, reqUrl, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+secret)

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("请求七牛模型库失败: %w", err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("七牛模型库返回非 2xx 状态: %d", resp.StatusCode)
	}
	var envelope qiniuListResponse
	if err := json.Unmarshal(body, &envelope); err != nil {
		return nil, fmt.Errorf("解析七牛模型库响应失败: %w", err)
	}
	result := make([]*QiniuModel, 0, len(envelope.Data))
	for _, raw := range envelope.Data {
		var m QiniuModelRaw
		if err := json.Unmarshal(raw, &m); err != nil {
			return nil, fmt.Errorf("解析模型对象失败: %w", err)
		}
		result = append(result, &QiniuModel{Raw: raw, Model: m})
	}
	return result, nil
}

// 中文枚举 → code 映射（未知值保留原文，前端无法识别时按原文兜底展示）
var HotTagCodeMap = map[string]string{
	"限时免费": "free_timed",
	"免费":     "free",
	"热门":     "hot",
	"上新":     "new",
}

var FeatureCodeMap = map[string]string{
	"工具调用":  "tool_call",
	"图像理解":  "image_understanding",
	"视频理解":  "video_understanding",
	"深度思考":  "reasoning",
	"AI 编程":  "ai_coding",
	"视频生成":  "video_generation",
	"结构化输出": "schema_output",
	"联网搜索":  "web_search",
	"长上下文":  "long_context",
	"生图":    "image_generation",
	"高 TPS":  "high_tps",
	"视觉定位":  "visual_grounding",
}

// MapHotTags 中文营销标签 → code 列表
func MapHotTags(tags []string) []string {
	return mapCodes(tags, HotTagCodeMap)
}

// MapFeatures 中文能力标签 → code 列表
func MapFeatures(features []string) []string {
	return mapCodes(features, FeatureCodeMap)
}

func mapCodes(values []string, m map[string]string) []string {
	if len(values) == 0 {
		return []string{}
	}
	codes := make([]string, 0, len(values))
	for _, v := range values {
		if code, ok := m[v]; ok {
			codes = append(codes, code)
		} else if v != "" {
			codes = append(codes, v) // 未知枚举保留原文，避免信息丢失
		}
	}
	return codes
}

// 摘要价提取：details_v2 键的优先级（实测存在大量非标准键）
var (
	inputPriceKeys = []string{
		"input", "ncache", "th_input", "nth_input", "bi_input",
		"t_input", "i_input", "a_input", "cache", "c_cache", "ex_cache",
	}
	outputPriceKeys = []string{
		"output", "th_output", "nth_output", "bi_output", "t_output", "i_output",
	}
	// 生图按张计价的键（文生图/图生图/多图生图等）
	quantityPriceKeys = []string{
		"ti_quantity", "ii_quantity", "mi2i_quantity", "omi_quantity", "i_input_quantity",
	}
	// 视频按秒计价的键
	durationPriceKeys = []string{"v_duration", "av_duration"}
)

// SummaryPrice 摘要价（卡片用）
//   - unit: token / image / second / unknown
//   - in/out: token 为 ¥/百万 token；image 为 ¥/张（in）；second 为 ¥/秒（in）；-1=无价
//   - isFree: 主计价项单价为 0
func ExtractSummaryPrice(tiers []QiniuPriceTier) (in float64, out float64, unit string, isFree bool) {
	in, out = -1, -1
	unit = "unknown"
	if len(tiers) == 0 || len(tiers[0].DetailsV2) == 0 {
		return
	}
	dv2 := tiers[0].DetailsV2

	// 1) 标准文本/token 计价（含缓存输入、思考分价、图文混合 token 计价）
	inItem := pickPriceItem(dv2, inputPriceKeys)
	outItem := pickPriceItem(dv2, outputPriceKeys)
	if inItem != nil || outItem != nil {
		unit = "token"
		if inItem != nil {
			in = perMillionToken(inItem)
			isFree = inItem.UnitPrice == 0
		}
		if outItem != nil {
			out = perMillionToken(outItem)
		}
		return
	}

	// 2) 生图按张
	if q := pickPriceItem(dv2, quantityPriceKeys); q != nil {
		unit = "image"
		in = perUnit(q)
		isFree = q.UnitPrice == 0
		return
	}
	// 兜底：任意 *_quantity 键
	if q := pickBySuffix(dv2, "_quantity"); q != nil {
		unit = normalizeUnit(q.UnitName)
		in = perUnit(q)
		isFree = q.UnitPrice == 0
		return
	}

	// 3) 视频按秒
	if s := pickPriceItem(dv2, durationPriceKeys); s != nil {
		unit = "second"
		in = perUnit(s)
		isFree = s.UnitPrice == 0
		return
	}
	if s := pickBySuffix(dv2, "_duration"); s != nil {
		unit = normalizeUnit(s.UnitName)
		in = perUnit(s)
		isFree = s.UnitPrice == 0
		return
	}

	// 4) 其它未知形态：取排序后第一个计价项，按其单位推断，不丢弃价格
	if q := firstItemSorted(dv2); q != nil {
		unit = normalizeUnit(q.UnitName)
		in = perUnit(q)
		isFree = q.UnitPrice == 0
	}
	return
}

func pickPriceItem(dv2 map[string]*QiniuPriceItem, keys []string) *QiniuPriceItem {
	for _, k := range keys {
		if item, ok := dv2[k]; ok && item != nil {
			return item
		}
	}
	return nil
}

func pickBySuffix(dv2 map[string]*QiniuPriceItem, suffix string) *QiniuPriceItem {
	keys := make([]string, 0, len(dv2))
	for k, v := range dv2 {
		if v != nil && strings.HasSuffix(k, suffix) {
			keys = append(keys, k)
		}
	}
	if len(keys) == 0 {
		return nil
	}
	sort.Strings(keys)
	return dv2[keys[0]]
}

func firstItemSorted(dv2 map[string]*QiniuPriceItem) *QiniuPriceItem {
	keys := make([]string, 0, len(dv2))
	for k, v := range dv2 {
		if v != nil {
			keys = append(keys, k)
		}
	}
	if len(keys) == 0 {
		return nil
	}
	sort.Strings(keys)
	return dv2[keys[0]]
}

// perMillionToken 折算 ¥/百万 token
func perMillionToken(item *QiniuPriceItem) float64 {
	if item.UnitSize <= 0 {
		return round6(item.UnitPrice)
	}
	return round6(item.UnitPrice / item.UnitSize * 1_000_000)
}

// perUnit 非 token 计价（张/秒等），按 unit_size 归一
func perUnit(item *QiniuPriceItem) float64 {
	if item.UnitSize <= 0 {
		return round6(item.UnitPrice)
	}
	return round6(item.UnitPrice / item.UnitSize)
}

func normalizeUnit(unitName string) string {
	switch strings.ToLower(strings.TrimSpace(unitName)) {
	case "token":
		return "token"
	case "pic", "image", "images":
		return "image"
	case "second", "time":
		return "second"
	default:
		return "unknown"
	}
}

func round6(v float64) float64 {
	return math.Round(v*1e6) / 1e6
}
