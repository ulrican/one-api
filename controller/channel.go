package controller

import (
	"github.com/gin-gonic/gin"
	"github.com/gin-gonic/gin/binding"
	"github.com/songquanpeng/one-api/common/config"
	"github.com/songquanpeng/one-api/common/helper"
	"github.com/songquanpeng/one-api/model"
	"github.com/songquanpeng/one-api/relay/channeltype"
	"net/http"
	"strconv"
	"strings"
)

func GetAllChannels(c *gin.Context) {
	p, _ := strconv.Atoi(c.Query("p"))
	if p < 0 {
		p = 0
	}
	channels, err := model.GetAllChannels(p*config.ItemsPerPage, config.ItemsPerPage, "limited")
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    channels,
	})
	return
}

func SearchChannels(c *gin.Context) {
	keyword := c.Query("keyword")
	channels, err := model.SearchChannels(keyword)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    channels,
	})
	return
}

func GetChannel(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	channel, err := model.GetChannelById(id, false)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    channel,
	})
	return
}

func AddChannel(c *gin.Context) {
	channel := model.Channel{}
	err := c.ShouldBindBodyWith(&channel, binding.JSON)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	// Task4-2 模型库渠道（type=52/53）：探测前端携带的独立凭证字段
	libReq := libraryCredentialProbe{}
	_ = c.ShouldBindBodyWith(&libReq, binding.JSON)
	channel.CreatedTime = helper.GetTimestamp()
	keys := strings.Split(channel.Key, "\n")
	channels := make([]model.Channel, 0, len(keys))
	for _, key := range keys {
		if key == "" {
			continue
		}
		localChannel := channel
		localChannel.Key = key
		channels = append(channels, localChannel)
	}
	err = model.BatchInsertChannels(channels)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	// Task4-2 渠道创建成功后落库模型库凭证（密钥以密文存扩展表，不影响 channels.key）
	for _, ch := range channels {
		apiKey, apiSecret, apiBase, hasAny := libReq.deref()
		if !hasAny {
			continue
		}
		saveLibraryCredentialForChannel(ch.Id, ch.Type, apiKey, apiSecret, apiBase)
	}
	// Task4-3 渠道保存后异步按七牛价格重算倍率（异步低频，失败不影响渠道创建，锁定模型自动跳过）
	model.AsyncAutoRecomputeRatios()
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
	return
}

func DeleteChannel(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	channel := model.Channel{Id: id}
	err := channel.Delete()
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
	return
}

func DeleteDisabledChannel(c *gin.Context) {
	rows, err := model.DeleteDisabledChannel()
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    rows,
	})
	return
}

func UpdateChannel(c *gin.Context) {
	// F9: tag 更新需区分"未携带"(保持原值) 与 "空串"(清空)。
	// 主模型绑定与 tag 探测分别 ShouldBindBodyWith（gin 缓存 body 可多次绑定），
	// 不依赖内嵌字段遮蔽（实测内层 string 字段会遮蔽外层，遮蔽写法无效）
	channel := model.Channel{}
	err := c.ShouldBindBodyWith(&channel, binding.JSON)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	tagReq := struct {
		Tag *string `json:"tag"`
	}{}
	_ = c.ShouldBindBodyWith(&tagReq, binding.JSON)

	// Task4-2 模型库渠道（type=52/53）：探测独立凭证字段（library_api_*）
	libReq := libraryCredentialProbe{}
	_ = c.ShouldBindBodyWith(&libReq, binding.JSON)

	err = channel.Update()
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	// 仅当请求显式携带 tag 时更新（空串=清空标签；启停/权重等最小化 PUT 不携带则保持原值）
	if tagReq.Tag != nil {
		if err = model.UpdateChannelTag(channel.Id, *tagReq.Tag); err != nil {
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": err.Error(),
			})
			return
		}
	}
	// Task4-2 模型库渠道：同步更新扩展表凭证（仅当请求显式携带 library_* 字段，避免启停 PUT 误覆盖）
	if channel.Type == channeltype.QiniuLibrary || channel.Type == channeltype.OtherLibrary {
		apiKey, apiSecret, apiBase, hasAny := libReq.deref()
		if hasAny {
			saveLibraryCredentialForChannel(channel.Id, channel.Type, apiKey, apiSecret, apiBase)
		}
	}
	// Task4-3 渠道保存后异步重算倍率（异步低频，无变更不写库，锁定模型自动跳过）
	model.AsyncAutoRecomputeRatios()
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    channel,
	})
	return
}

// F9 渠道管理增强：批量启用/禁用/删除/测试选中渠道（仅管理员，路由组已挂 AdminAuth）
type batchChannelRequest struct {
	IDs    []int  `json:"ids"`
	Action string `json:"action"`
}

func BatchManageChannels(c *gin.Context) {
	req := batchChannelRequest{}
	err := c.ShouldBindJSON(&req)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	if len(req.IDs) == 0 {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "未选择任何渠道",
		})
		return
	}
	switch req.Action {
	case "enable":
		err = model.BatchUpdateChannelStatus(req.IDs, model.ChannelStatusEnabled)
	case "disable":
		err = model.BatchUpdateChannelStatus(req.IDs, model.ChannelStatusManuallyDisabled)
	case "delete":
		var count int64
		count, err = model.BatchDeleteChannels(req.IDs)
		if err == nil {
			c.JSON(http.StatusOK, gin.H{
				"success": true,
				"message": "",
				"data":    count,
			})
			return
		}
	case "test":
		err = testChannelsByIds(c.Request.Context(), true, req.IDs)
	default:
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "不支持的批量操作：" + req.Action,
		})
		return
	}
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
	return
}
