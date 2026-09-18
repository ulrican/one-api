package ratio

import (
	"encoding/json"
	"github.com/songquanpeng/one-api/common/logger"
	"sync"
)

var groupRatioLock sync.RWMutex
var GroupRatio = map[string]float64{
	"default": 1,
	"vip":     1,
	"svip":    1,
}

func GroupRatio2JSONString() string {
	jsonBytes, err := json.Marshal(GroupRatio)
	if err != nil {
		logger.SysError("error marshalling model ratio: " + err.Error())
	}
	return string(jsonBytes)
}

func UpdateGroupRatioByJSONString(jsonStr string) error {
	groupRatioLock.Lock()
	defer groupRatioLock.Unlock()
	GroupRatio = make(map[string]float64)
	return json.Unmarshal([]byte(jsonStr), &GroupRatio)
}

func GetGroupRatio(name string) float64 {
	groupRatioLock.RLock()
	defer groupRatioLock.RUnlock()
	ratio, ok := GroupRatio[name]
	if !ok {
		logger.SysError("group ratio not found: " + name)
		return 1
	}
	return ratio
}

// SnapshotGroupRatio 返回分组倍率 map 的副本（Task4-3 管理端分组倍率维护接口用）
func SnapshotGroupRatio() map[string]float64 {
	groupRatioLock.RLock()
	defer groupRatioLock.RUnlock()
	result := make(map[string]float64, len(GroupRatio))
	for k, v := range GroupRatio {
		result[k] = v
	}
	return result
}
