import React, { useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserContext } from '../../context/User';
import ThemeToggle from '../../components/ThemeToggle';
import { getLogo, getSystemName } from '../../helpers';
import './landing.css';

// 指标看板数据
const STATS = [
  { value: '150ms', label: '平均转发延时', tone: 'tl-blue' },
  { value: '99.99%', label: '系统高可用 SLA', tone: 'tl-green' },
  { value: '10,000+', label: '峰值并发处理 (QPS)', tone: 'tl-purple' },
  { value: '0 秒', label: '故障无感切线', tone: 'tl-amber' },
];

// 模型矩阵数据
const MODELS = [
  {
    badge: '深度推理',
    badgeTone: 'tl-badge-purple',
    latency: '120ms',
    name: 'DeepSeek-R1 / V3',
    desc: '提供最强理科逻辑推理与数学解题能力，超高性价比的首选模型。',
    rate: '倍率：1.0x (基准)',
  },
  {
    badge: '全能代码',
    badgeTone: 'tl-badge-blue',
    latency: '180ms',
    name: 'Claude 3.5 Sonnet',
    desc: 'AI 编程辅助与长文本分析领域的行业标杆，前端与架构代码生成极优。',
    rate: '倍率：1.5x',
  },
  {
    badge: '多模态旗舰',
    badgeTone: 'tl-badge-green',
    latency: '160ms',
    name: 'OpenAI GPT-4o / o3-mini',
    desc: 'OpenAI 旗舰通用多模态模型，兼顾语音、视觉与快速响应。',
    rate: '倍率：1.2x',
  },
];

// 卡片倍率取真实数据：/api/pricing（公开接口）里按候选模型名（精确优先，前缀兜底）匹配，
// 倍数 = 模型倍率 ÷ 全站最低倍率（基准），与控制台价格页同源
const CARD_RATE_KEYS = [
  ['deepseek-reasoner', 'deepseek-chat'], // DeepSeek-R1 / V3
  ['claude-3-5-sonnet'], // Claude 3.5 Sonnet
  ['gpt-4o', 'o3-mini'], // OpenAI GPT-4o / o3-mini
];

const buildSnippets = (apiBase) => ({
  curl: `curl ${apiBase}/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer sk-xxxx" \\
  -d '{
    "model": "deepseek-r1",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": true
  }'`,
  python: `from openai import OpenAI

client = OpenAI(
    api_key="sk-xxxx",
    base_url="${apiBase}"
)

response = client.chat.completions.create(
    model="deepseek-r1",
    messages=[{"role": "user", "content": "Hello!"}],
    stream=True
)`,
});

const Landing = () => {
  const [userState] = useContext(UserContext);
  const navigate = useNavigate();
  const [codeTab, setCodeTab] = useState('curl');
  const [logoError, setLogoError] = useState(false);
  const [pricing, setPricing] = useState(null);

  const systemName = getSystemName();
  const logo = getLogo();
  const loggedIn = !!userState?.user;
  const apiBase = `${window.location.origin}/v1`;
  const snippets = buildSnippets(apiBase);

  // 落地页为全屏页：挂载时取消 body 顶距（全局 Header 已在路由层隐藏），卸载时还原。
  // body 底色由全站 tokens.css 按主题统一控制，无需在此处理。
  useEffect(() => {
    const prevPaddingTop = document.body.style.paddingTop;
    document.body.style.paddingTop = '0';
    return () => {
      document.body.style.paddingTop = prevPaddingTop;
    };
  }, []);

  // 拉取真实模型倍率（公开接口，失败/为空时卡片回退到静态文案）
  useEffect(() => {
    fetch('/api/pricing')
      .then((res) => res.json())
      .then((res) => {
        if (res.success && Array.isArray(res.data) && res.data.length) {
          setPricing(res.data);
        }
      })
      .catch(() => {});
  }, []);

  // 倍数 = 卡片候选模型中最低倍率 ÷ 全站最低倍率；候选均未开放时显示 —
  const getCardRate = (idx) => {
    const fallback = MODELS[idx].rate;
    if (!pricing || !pricing.length) return fallback;
    const positive = (v) => typeof v === 'number' && v > 0;
    const ratios = pricing.map((p) => p.model_ratio).filter(positive);
    const base = Math.min(...ratios);
    if (!base) return fallback;
    const keys = CARD_RATE_KEYS[idx] || [];
    const matched = pricing.filter((p) =>
      keys.some((k) => p.model === k || p.model.startsWith(k))
    );
    const matchedRatios = matched.map((m) => m.model_ratio).filter(positive);
    if (!matchedRatios.length) return '倍率：—';
    const modelRatio = Math.min(...matchedRatios);
    if (!modelRatio) return '倍率：—';
    const mult = modelRatio / base;
    return mult <= 1.05 ? '倍率：1.0x (基准)' : `倍率：${mult.toFixed(1)}x`;
  };

  const goConsole = () => {
    navigate(loggedIn ? '/dashboard' : '/login');
  };

  const goGetKey = () => {
    navigate(loggedIn ? '/token' : '/register');
  };

  return (
    <div className='tech-landing'>
      {/* 点阵网格背景（径向渐隐，不拦截事件） */}
      <div className='tl-grid-bg' aria-hidden='true'></div>

      {/* 1. 顶部玻璃导航栏 */}
      <nav className='tl-nav'>
        <div className='tl-container tl-nav-inner'>
          <div className='tl-logo' onClick={() => navigate('/')} title={systemName}>
            {logoError ? (
              <div className='tl-logo-mark'>
                <div className='tl-logo-mark-inner'>
                  <span role='img' aria-label='logo'>⚡</span>
                </div>
              </div>
            ) : (
              <img
                src={logo}
                alt='logo'
                className='tl-logo-img'
                onError={() => setLogoError(true)}
              />
            )}
            <span className='tl-brand'>{systemName}</span>
          </div>

          <div className='tl-nav-links'>
            {/* Task3-4：点击「首页」回到页面最顶部（window 滚动归零），不依赖锚点定位 */}
            <a
              href='#top'
              onClick={(e) => {
                e.preventDefault();
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            >
              首页
            </a>
            <a href='#models'>模型矩阵</a>
            <a href='#developer'>开发者接入</a>
          </div>

          <div className='tl-nav-actions'>
            {/* 主题风格切换：科技暗色 ⇄ 亮色简约（全站 ThemeContext 统一驱动） */}
            <ThemeToggle className='tl-theme-toggle' />
            <span className='tl-status-pill'>
              <span className='tl-status-dot' aria-hidden='true'></span>
              网关 99.99% 运行中
            </span>
            <button className='tl-btn tl-btn-primary' onClick={goConsole}>
              {loggedIn ? '进入控制台' : '控制台 / 登录'}
            </button>
          </div>
        </div>
      </nav>

      {/* 2. Hero 主视觉区 */}
      <section id='hero' className='tl-hero'>
        <div className='tl-hero-badge'>
          <span>✨ 现已全面接入 DeepSeek-R1 &amp; Claude 3.5 Sonnet</span>
        </div>
        <h1 className='tl-hero-title'>
          一键连接全球顶尖大模型
          <br />
          <span className='tl-gradient-text'>重塑 AI 算力与接入边界</span>
        </h1>
        <p className='tl-hero-subtitle'>
          统一 OpenAI 标准协议网关。高并发、毫秒级延时、智能多路线自动熔断，为您的
          AI 应用提供坚如磐石的底层支撑。
        </p>
        <div className='tl-hero-actions'>
          <button className='tl-btn tl-btn-primary tl-btn-lg' onClick={goGetKey}>
            🚀 免费获取 API Key
          </button>
          <button
            className='tl-btn tl-btn-ghost tl-btn-lg'
            onClick={() =>
              // 未配置 ChatLink 时回退到内置 Playground，避免 /chat 空态
              navigate(
                localStorage.getItem('chat_link') ? '/chat' : '/playground'
              )
            }
          >
            💬 体验在线 WebChat
          </button>
        </div>

        {/* 实时数据看板 */}
        <div className='tl-stats'>
          {STATS.map((stat) => (
            <div key={stat.label} className='tl-stat-card'>
              <div className={`tl-stat-value ${stat.tone}`}>{stat.value}</div>
              <div className='tl-stat-label'>{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 3. 全球模型能力矩阵 */}
      <section id='models' className='tl-section'>
        <div className='tl-container'>
          <div className='tl-section-head'>
            <h2 className='tl-section-title'>聚合矩阵 · 按需路由</h2>
            <p className='tl-section-desc'>支持上百种主流大模型，透明汇率按量扣费</p>
          </div>
          <div className='tl-models-grid'>
            {MODELS.map((model, idx) => (
              <div key={model.name} className='tl-card'>
                <div className='tl-card-top'>
                  <span className={`tl-badge ${model.badgeTone}`}>{model.badge}</span>
                  <span className='tl-latency'>● 延迟 {model.latency}</span>
                </div>
                <h3 className='tl-card-title'>{model.name}</h3>
                <p className='tl-card-desc'>{model.desc}</p>
                <div className='tl-card-footer'>
                  <span>{getCardRate(idx)}</span>
                  <button className='tl-card-link' onClick={goGetKey}>
                    调用文档 →
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 4. 开发者极速接入终端 */}
      <section id='developer' className='tl-section'>
        <div className='tl-container'>
          <div className='tl-dev-panel'>
            <div className='tl-dev-intro'>
              <h2 className='tl-dev-title'>极简接入，30 秒上线</h2>
              <p className='tl-dev-desc'>
                完全兼容 OpenAI SDK 与 API 规范。只需修改两行代码（更改 Base URL 与
                API Key），即可在任意客户端或框架中无缝切换全球模型。
              </p>
              <div className='tl-steps'>
                <div className='tl-step'>
                  <div className='tl-step-num tl-num-blue'>1</div>
                  <div>
                    <h4 className='tl-step-title'>获取专属 API Key</h4>
                    <p className='tl-step-desc'>
                      注册即可在控制台生成 <code>sk-xxxx</code>
                    </p>
                  </div>
                </div>
                <div className='tl-step'>
                  <div className='tl-step-num tl-num-purple'>2</div>
                  <div>
                    <h4 className='tl-step-title'>替换 Endpoint 地址</h4>
                    <p className='tl-step-desc'>
                      统一指向{' '}
                      <code className='tl-code-purple'>{apiBase}</code>
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* 终端代码窗口 */}
            <div className='tl-terminal'>
              <div className='tl-terminal-bar'>
                <div className='tl-terminal-dots' aria-hidden='true'>
                  <span className='tl-dot-red'></span>
                  <span className='tl-dot-yellow'></span>
                  <span className='tl-dot-green'></span>
                </div>
                <div className='tl-terminal-tabs'>
                  <button
                    className={`tl-tab ${codeTab === 'curl' ? 'tl-tab-active' : ''}`}
                    onClick={() => setCodeTab('curl')}
                  >
                    cURL
                  </button>
                  <button
                    className={`tl-tab ${codeTab === 'python' ? 'tl-tab-active' : ''}`}
                    onClick={() => setCodeTab('python')}
                  >
                    Python
                  </button>
                </div>
              </div>
              <pre className='tl-code'>
                <code>{snippets[codeTab]}</code>
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* 5. 页脚 */}
      <footer className='tl-footer'>
        <p>© {new Date().getFullYear()} {systemName}. Powered by One-API Core.</p>
      </footer>
    </div>
  );
};

export default Landing;
