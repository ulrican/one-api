package router

import (
	"github.com/songquanpeng/one-api/controller"
	"github.com/songquanpeng/one-api/controller/auth"
	"github.com/songquanpeng/one-api/middleware"

	"github.com/gin-contrib/gzip"
	"github.com/gin-gonic/gin"
)

func SetApiRouter(router *gin.Engine) {
	apiRouter := router.Group("/api")
	apiRouter.Use(gzip.Gzip(gzip.DefaultCompression))
	apiRouter.Use(middleware.GlobalAPIRateLimit())
	{
		apiRouter.GET("/status", controller.GetStatus)
		apiRouter.GET("/models", middleware.UserAuth(), controller.DashboardListModels)
		apiRouter.GET("/notice", controller.GetNotice)
		apiRouter.GET("/about", controller.GetAbout)
		apiRouter.GET("/home_page_content", controller.GetHomePageContent)
		apiRouter.GET("/verification", middleware.CriticalRateLimit(), middleware.TurnstileCheck(), controller.SendEmailVerification)
		apiRouter.GET("/reset_password", middleware.CriticalRateLimit(), middleware.TurnstileCheck(), controller.SendPasswordResetEmail)
		apiRouter.POST("/user/reset", middleware.CriticalRateLimit(), controller.ResetPassword)
		apiRouter.GET("/oauth/github", middleware.CriticalRateLimit(), auth.GitHubOAuth)
		apiRouter.GET("/oauth/oidc", middleware.CriticalRateLimit(), auth.OidcAuth)
		apiRouter.GET("/oauth/lark", middleware.CriticalRateLimit(), auth.LarkOAuth)
		apiRouter.GET("/oauth/state", middleware.CriticalRateLimit(), auth.GenerateOAuthCode)
		apiRouter.GET("/oauth/wechat", middleware.CriticalRateLimit(), auth.WeChatAuth)
		apiRouter.GET("/oauth/wechat/bind", middleware.CriticalRateLimit(), middleware.UserAuth(), auth.WeChatBind)
		apiRouter.GET("/oauth/email/bind", middleware.CriticalRateLimit(), middleware.UserAuth(), controller.EmailBind)
		apiRouter.POST("/topup", middleware.AdminAuth(), controller.AdminTopUp)
		// 在线支付异步回调（公开接口，签名校验在 controller 内完成）
		apiRouter.GET("/user/pay/notify", controller.PayNotify)
		apiRouter.POST("/user/pay/notify", controller.PayNotify)
		apiRouter.GET("/pricing", controller.GetPricing) // 公开模型价格页
		apiRouter.GET("/rankings", controller.GetRankings) // F15 公开排行榜
		// Task4-1 模型广场（公开查询 + 管理员手动同步）
		apiRouter.GET("/marketplace/models", controller.GetMarketModels)
		apiRouter.GET("/marketplace/detail", controller.GetMarketModelDetail)
		apiRouter.POST("/marketplace/sync", middleware.AdminAuth(), controller.SyncMarketplace)

		userRoute := apiRouter.Group("/user")
		{
			userRoute.POST("/register", middleware.CriticalRateLimit(), middleware.TurnstileCheck(), controller.Register)
			userRoute.POST("/login", middleware.CriticalRateLimit(), controller.Login)
			userRoute.POST("/login/2fa", middleware.CriticalRateLimit(), controller.LoginTwoFA) // F12 两步验证登录
			userRoute.GET("/logout", controller.Logout)

			selfRoute := userRoute.Group("/")
			selfRoute.Use(middleware.UserAuth())
			{
				selfRoute.GET("/dashboard", controller.GetUserDashboard)
				selfRoute.GET("/dashboard/metrics", controller.GetUserDashboardMetrics)
				selfRoute.GET("/self", controller.GetSelf)
				selfRoute.PUT("/self", controller.UpdateSelf)
				selfRoute.DELETE("/self", controller.DeleteSelf)
				selfRoute.GET("/token", controller.GenerateAccessToken)
				selfRoute.GET("/aff", controller.GetAffCode)
				selfRoute.POST("/topup", controller.TopUp)
				selfRoute.GET("/pay/config", controller.GetPayConfig)
				selfRoute.POST("/pay/create", controller.CreatePayOrder)
				selfRoute.GET("/pay/status", controller.GetPayOrderStatus)
				selfRoute.GET("/orders", controller.GetUserOrders)
				selfRoute.GET("/available_models", controller.GetUserAvailableModels)
				selfRoute.POST("/check_in", controller.CheckIn)
				selfRoute.GET("/check_in/status", controller.GetCheckInStatus)
				selfRoute.GET("/setting", controller.GetSelfSetting)
				selfRoute.PUT("/setting", controller.UpdateSelfSetting)
				selfRoute.POST("/setting/notify_test", controller.TestSelfNotify)
				selfRoute.GET("/sessions", controller.GetSelfSessions)
				selfRoute.DELETE("/sessions/others", controller.DeleteOtherSessions)
				// F12 两步验证（TOTP）
				selfRoute.GET("/2fa/status", controller.GetTwoFAStatus)
				selfRoute.POST("/2fa/setup", controller.SetupTwoFA)
				selfRoute.POST("/2fa/enable", controller.EnableTwoFA)
				selfRoute.POST("/2fa/disable", controller.DisableTwoFA)
			}

			adminRoute := userRoute.Group("/")
			adminRoute.Use(middleware.AdminAuth())
			{
				adminRoute.GET("/", controller.GetAllUsers)
				adminRoute.GET("/search", controller.SearchUsers)
				adminRoute.GET("/:id", controller.GetUser)
				adminRoute.POST("/", controller.CreateUser)
				adminRoute.POST("/manage", controller.ManageUser)
				adminRoute.PUT("/", controller.UpdateUser)
				adminRoute.DELETE("/:id", controller.DeleteUser)
			}
		}
		optionRoute := apiRouter.Group("/option")
		optionRoute.Use(middleware.RootAuth())
		{
			optionRoute.GET("/", controller.GetOptions)
			optionRoute.PUT("/", controller.UpdateOption)
		}
		channelRoute := apiRouter.Group("/channel")
		channelRoute.Use(middleware.AdminAuth())
		{
			channelRoute.GET("/", controller.GetAllChannels)
			channelRoute.GET("/search", controller.SearchChannels)
			channelRoute.GET("/models", controller.ListAllModels)
			channelRoute.GET("/:id", controller.GetChannel)
			channelRoute.GET("/test", controller.TestChannels)
			channelRoute.GET("/test/:id", controller.TestChannel)
			channelRoute.GET("/update_balance", controller.UpdateAllChannelsBalance)
			channelRoute.GET("/update_balance/:id", controller.UpdateChannelBalance)
			channelRoute.POST("/", controller.AddChannel)
			channelRoute.POST("/batch", controller.BatchManageChannels)
			channelRoute.GET("/metrics", controller.GetChannelMetrics) // F11 渠道可用率
			channelRoute.PUT("/", controller.UpdateChannel)
			channelRoute.DELETE("/disabled", controller.DeleteDisabledChannel)
			channelRoute.DELETE("/:id", controller.DeleteChannel)
			// Task4-2 渠道模型库（七牛/其他）：模型列表查询 + 凭证同步
			channelRoute.GET("/library/models", controller.GetLibraryModels)
			channelRoute.GET("/library/source", controller.GetChannelSource)
			channelRoute.POST("/library/sync", controller.SyncLibraryModels)
		}
		// Task4-3 模型倍率自动计算（自动重算 + 手动锁定 + 分组倍率维护，全部管理员）
		ratioRoute := apiRouter.Group("/ratio")
		ratioRoute.Use(middleware.AdminAuth())
		{
			ratioRoute.POST("/auto-recompute", controller.AutoRecomputeRatios)
			ratioRoute.GET("/locks", controller.GetRatioLocks)
			ratioRoute.POST("/lock", controller.LockModelRatio)
			ratioRoute.DELETE("/lock", controller.UnlockModelRatio) // model_id 走 query（七牛 id 含 "/"）
			ratioRoute.GET("/groups", controller.GetGroupRatios)
			ratioRoute.POST("/groups", controller.UpdateGroupRatios)
		}
		tokenRoute := apiRouter.Group("/token")
		tokenRoute.Use(middleware.UserAuth())
		{
			tokenRoute.GET("/", controller.GetAllTokens)
			tokenRoute.GET("/search", controller.SearchTokens)
			tokenRoute.GET("/:id", controller.GetToken)
			tokenRoute.POST("/", controller.AddToken)
			tokenRoute.PUT("/", controller.UpdateToken)
			tokenRoute.DELETE("/:id", controller.DeleteToken)
		}
		redemptionRoute := apiRouter.Group("/redemption")
		redemptionRoute.Use(middleware.AdminAuth())
		{
			redemptionRoute.GET("/", controller.GetAllRedemptions)
			redemptionRoute.GET("/search", controller.SearchRedemptions)
			redemptionRoute.GET("/:id", controller.GetRedemption)
			redemptionRoute.POST("/", controller.AddRedemption)
			redemptionRoute.PUT("/", controller.UpdateRedemption)
			redemptionRoute.DELETE("/:id", controller.DeleteRedemption)
		}
		logRoute := apiRouter.Group("/log")
		logRoute.GET("/", middleware.AdminAuth(), controller.GetAllLogs)
		logRoute.DELETE("/", middleware.AdminAuth(), controller.DeleteHistoryLogs)
		logRoute.GET("/stat", middleware.AdminAuth(), controller.GetLogsStat)
		logRoute.GET("/self/stat", middleware.UserAuth(), controller.GetLogsSelfStat)
		logRoute.GET("/search", middleware.AdminAuth(), controller.SearchAllLogs)
		logRoute.GET("/self", middleware.UserAuth(), controller.GetUserLogs)
		logRoute.GET("/self/search", middleware.UserAuth(), controller.SearchUserLogs)
		groupRoute := apiRouter.Group("/group")
		groupRoute.Use(middleware.AdminAuth())
		{
			groupRoute.GET("/", controller.GetGroups)
		}
	}
}
