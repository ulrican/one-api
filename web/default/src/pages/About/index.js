import React, { useEffect, useState, useRef } from 'react';
import { Card } from 'semantic-ui-react';
import { API, showError } from '../../helpers';
import { marked } from 'marked';
import { API_SECTIONS } from './apiData';
import { genJava, genPython, genNodejs, genCurl } from './codeExamples';
import './about.css';

const About = () => {
  const [about, setAbout] = useState('');
  const [aboutLoaded, setAboutLoaded] = useState(false);
  const [activeId, setActiveId] = useState('section-intro');
  const [codeLang, setCodeLang] = useState('python');
  const sectionRefs = useRef({});

  const displayAbout = async () => {
    setAbout(localStorage.getItem('about') || '');
    const res = await API.get('/api/about');
    const { success, message, data } = res.data;
    if (success) {
      let aboutContent = data;
      if (!data.startsWith('https://')) {
        aboutContent = marked.parse(data);
      }
      setAbout(aboutContent);
      localStorage.setItem('about', aboutContent);
    } else {
      showError(message);
      setAbout('');
    }
    setAboutLoaded(true);
  };

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveId(entry.target.id);
        });
      },
      { rootMargin: '-20% 0px -70% 0px', threshold: 0 }
    );
    Object.values(sectionRefs.current).forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [aboutLoaded]);

  useEffect(() => { displayAbout().then(); }, []);

  // 支持通过 URL hash 直接定位章节（如 /about#section-apis）
  useEffect(() => {
    if (!aboutLoaded) return;
    const hash = window.location.hash.replace('#', '');
    if (hash) {
      const el = document.getElementById(hash);
      if (el) {
        setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
      }
    }
  }, [aboutLoaded]);

  const scrollTo = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const getCode = (api) => {
    if (codeLang === 'java') return genJava(api);
    if (codeLang === 'nodejs') return genNodejs(api);
    if (codeLang === 'curl') return genCurl(api);
    return genPython(api);
  };

  const aboutCard =
    aboutLoaded && about !== '' && !about.startsWith('https://') ? (
      <Card fluid className='chart-card' style={{ marginTop: '24px' }}>
        <Card.Content>
          <div style={{ fontSize: 'larger' }} dangerouslySetInnerHTML={{ __html: about }}></div>
        </Card.Content>
      </Card>
    ) : null;

  const LangTabs = () => (
    <div className='api-code-tabs'>
      <button className={`api-code-tab ${codeLang === 'curl' ? 'active' : ''}`} onClick={() => setCodeLang('curl')}>cURL</button>
      <button className={`api-code-tab ${codeLang === 'python' ? 'active' : ''}`} onClick={() => setCodeLang('python')}>Python</button>
      <button className={`api-code-tab ${codeLang === 'nodejs' ? 'active' : ''}`} onClick={() => setCodeLang('nodejs')}>Node.js</button>
      <button className={`api-code-tab ${codeLang === 'java' ? 'active' : ''}`} onClick={() => setCodeLang('java')}>Java</button>
    </div>
  );

  return (
    <div className='dashboard-container'>
      <div className='about-layout'>
        {/* 主内容 */}
        <div className='about-content'>

          {/* 1. 产品简介 */}
          <section id='section-intro' className='api-section' ref={(el) => (sectionRefs.current['section-intro'] = el)}>
            <h2 className='api-section-title'>产品简介</h2>
            <div className='api-card'>
              <div className='api-card-body'>
                <p className='api-desc'>
                  FluxAPI 是 FluxAI 平台对外的统一大模型调用接口，完全兼容 OpenAI API 协议——改两行代码（Base URL + API Key）即可无缝接入。
                </p>
                <ul style={{ color: 'var(--text-secondary)', lineHeight: 2, paddingLeft: '20px' }}>
                  <li><strong>OpenAI 兼容</strong>：任何支持 OpenAI SDK / API 规范的客户端、框架、应用都能直接使用</li>
                  <li><strong>多模型聚合</strong>：一个 Key 调用平台上线的全部模型（对话、图像、语音、向量等）</li>
                  <li><strong>透明计费</strong>：按 token 用量计费，价格页明码标价，日志页逐笔可查</li>
                </ul>
              </div>
            </div>
          </section>

          {/* 2. 快速开始 */}
          <section id='section-quickstart' className='api-section' ref={(el) => (sectionRefs.current['section-quickstart'] = el)}>
            <h2 className='api-section-title'>快速开始</h2>
            <div className='api-card'>
              <div className='api-card-body'>
                <table className='api-params-table'>
                  <thead>
                    <tr><th>步骤</th><th>操作</th><th>位置</th></tr>
                  </thead>
                  <tbody>
                    <tr><td>①</td><td>注册账号并完成登录</td><td>右上角 → 注册</td></tr>
                    <tr><td>②</td><td>创建应用，获取 API Key（sk- 开头）</td><td>控制台 → 应用管理</td></tr>
                    <tr><td>③</td><td>确认可用模型与价格</td><td>控制台 → 模型广场</td></tr>
                    <tr><td>④</td><td>用 Base URL + API Key 发起调用</td><td>任意 OpenAI 兼容环境</td></tr>
                  </tbody>
                </table>
                <p className='api-desc' style={{ marginTop: '16px' }}>第一次请求示例：</p>
                <div className='api-code-section'>
                  <LangTabs />
                  <div className='api-code-block'>
                    <pre>{getCode({ method: 'POST', path: '/v1/chat/completions', params: [
                      { name: 'model', type: 'string', required: true },
                      { name: 'messages', type: 'array', required: true },
                    ]})}</pre>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* 3. 鉴权 */}
          <section id='section-auth' className='api-section' ref={(el) => (sectionRefs.current['section-auth'] = el)}>
            <h2 className='api-section-title'>鉴权</h2>
            <div className='api-card'>
              <div className='api-card-body'>
                <p className='api-desc'>所有网关接口通过 HTTP Header 携带 API Key 鉴权。请在「应用管理」中创建应用后获取 Key。</p>
                <div className='api-code-section'>
                  <div className='api-code-block'><pre>{`Authorization: Bearer sk-xxxxxxxxxxxxxxxxxx`}</pre></div>
                </div>
                <p className='api-desc' style={{ marginTop: '12px' }}>
                  <strong>注意：</strong>请勿将 API Key 提交到公开代码仓库或分享给他人。如 Key 泄露，请立即在应用管理中禁用或重新生成。
                </p>
              </div>
            </div>
          </section>

          {/* 4. 接口文档 */}
          <section id='section-apis' className='api-section' ref={(el) => (sectionRefs.current['section-apis'] = el)}>
            <h2 className='api-section-title'>接口文档</h2>
            <p className='api-desc' style={{ marginBottom: '16px' }}>
              Base URL 为 <code style={{ color: 'var(--brand-blue)' }}>{`{站点地址}/v1`}</code>，协议为 OpenAI API 兼容，JSON 请求/响应，流式为 SSE。
            </p>
            {API_SECTIONS.map((section) => (
              <div key={section.id} id={section.id}>
                <h3 style={{ fontSize: '18px', fontWeight: 700, margin: '24px 0 16px', color: 'var(--text-primary)' }}>{section.title}</h3>
                {section.apis.map((api) => (
                  <div key={api.id} id={api.id} className='api-card'>
                    <div className='api-card-header'>
                      <span className={`api-method-badge api-method-${api.method}`}>{api.method}</span>
                      <code className='api-path'>{api.path}</code>
                    </div>
                    <div className='api-card-body'>
                      <p className='api-desc'>{api.desc}</p>
                      {api.params.length > 0 && (
                        <>
                          <div className='api-params-title'>请求参数</div>
                          <table className='api-params-table'>
                            <thead><tr><th>参数名</th><th>类型</th><th>必填</th><th>说明</th></tr></thead>
                            <tbody>
                              {api.params.map((p) => (
                                <tr key={p.name}>
                                  <td><span className='api-param-name'>{p.name}</span></td>
                                  <td><span className='api-param-type'>{p.type}</span></td>
                                  <td>{p.required ? <span className='api-param-required'>是</span> : <span className='api-param-optional'>否</span>}</td>
                                  <td style={{ color: 'var(--text-secondary)' }}>{p.desc}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </>
                      )}
                      <div className='api-code-section'>
                        <LangTabs />
                        <div className='api-code-block'><pre>{getCode(api)}</pre></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
            {/* 响应结构 */}
            <div id='section-response' className='api-card' style={{ marginTop: '24px' }} ref={(el) => (sectionRefs.current['section-response'] = el)}>
              <div className='api-card-body'>
                <div className='api-params-title'>响应结构</div>
                <p className='api-desc'>返回 OpenAI 标准格式，用量在 usage 字段：</p>
                <div className='api-code-block'><pre>{`{
  "id": "chatcmpl-xxx",
  "model": "deepseek-chat",
  "choices": [{ "message": { "role": "assistant", "content": "..." } }],
  "usage": {
    "prompt_tokens": 15,
    "completion_tokens": 42,
    "total_tokens": 57
  }
}`}</pre></div>
              </div>
            </div>
          </section>

          {/* 5. 第三方客户端接入 */}
          <section id='section-clients' className='api-section' ref={(el) => (sectionRefs.current['section-clients'] = el)}>
            <h2 className='api-section-title'>第三方客户端接入</h2>
            <div className='api-card'>
              <div className='api-card-body'>
                <p className='api-desc'>也可在任何客户端中手动填写：<strong>Base URL = <code>{`{站点地址}/v1`}</code>，API Key = 你的应用 Key</strong>。</p>
                <p className='api-desc'>不想写代码？控制台内置 <strong>模型体验页</strong>可直接测试。</p>
              </div>
            </div>
          </section>

          {/* 6. 模型与价格 */}
          <section id='section-models-list' className='api-section' ref={(el) => (sectionRefs.current['section-models-list'] = el)}>
            <h2 className='api-section-title'>模型与价格</h2>
            <div className='api-card'>
              <div className='api-card-body'>
                <div className='api-params-title'>价格查询</div>
                <ul style={{ color: 'var(--text-secondary)', lineHeight: 2, paddingLeft: '20px' }}>
                  <li><strong>模型广场</strong>：所有可用模型的输入/输出单价，单位 元 / 1K tokens，实时来自系统倍率配置</li>
                  <li><strong>公开接口</strong>：<code style={{ color: 'var(--brand-blue)' }}>GET /api/pricing</code> 返回模型清单与倍率（无需鉴权）</li>
                  <li><strong>模型可用性</strong>：<code style={{ color: 'var(--brand-blue)' }}>GET /v1/models</code>（按你的应用与分组过滤）</li>
                </ul>
                <div className='api-params-title' style={{ marginTop: '16px' }}>计费规则</div>
                <div className='api-code-block'><pre>{`本次扣费 = ( 输入tokens × 模型倍率 + 输出tokens × 模型倍率 × 补全倍率 ) × 分组倍率`}</pre></div>
                <ul style={{ color: 'var(--text-secondary)', lineHeight: 2, paddingLeft: '20px', marginTop: '12px' }}>
                  <li>换算基准：1 模型倍率 = $0.002/1K tokens ≈ ¥0.014/1K（即 ¥14/百万 tokens）</li>
                  <li>输出单价 = 输入单价 × 补全倍率（生成比理解更贵）</li>
                  <li>分组倍率按账户所在分组生效（default 分组 = 1.0）</li>
                </ul>
              </div>
            </div>
          </section>

          {/* 7. 充值与对账 */}
          <section id='section-topup' className='api-section' ref={(el) => (sectionRefs.current['section-topup'] = el)}>
            <h2 className='api-section-title'>充值与对账</h2>
            <div className='api-card'>
              <div className='api-card-body'>
                <div className='api-params-title'>充值</div>
                <ul style={{ color: 'var(--text-secondary)', lineHeight: 2, paddingLeft: '20px' }}>
                  <li>入口：控制台 → 充值中心（在线支付：支付宝 / 微信 / 易支付，支付成功实时到账）</li>
                  <li>额度换算：<strong>到账 quota = 充值金额 ÷ 充值价格 × 500,000</strong></li>
                  <li>也可使用兑换码充值</li>
                </ul>
                <div className='api-params-title' style={{ marginTop: '16px' }}>对账</div>
                <p className='api-desc'>控制台 → 日志：每笔调用记录时间、模型、输入/输出 tokens、扣除 quota，可与账单核对。</p>
              </div>
            </div>
          </section>

          {/* 8. 应用管理 */}
          <section id='section-app' className='api-section' ref={(el) => (sectionRefs.current['section-app'] = el)}>
            <h2 className='api-section-title'>应用管理</h2>
            <div className='api-card'>
              <div className='api-card-body'>
                <p className='api-desc'>应用管理页支持对每个应用 Key 独立设置：</p>
                <table className='api-params-table'>
                  <thead><tr><th>设置</th><th>说明</th></tr></thead>
                  <tbody>
                    <tr><td>额度上限</td><td>该应用累计最多消耗的 quota，防失控</td></tr>
                    <tr><td>有效期</td><td>过期自动失效</td></tr>
                    <tr><td>模型范围</td><td>限定该应用只能调用哪些模型</td></tr>
                    <tr><td>状态</td><td>启用 / 禁用，禁用后 Key 立即失效</td></tr>
                  </tbody>
                </table>
                <p className='api-desc' style={{ marginTop: '12px' }}>多项目/多人使用建议：<strong>一人一应用、一项目一应用</strong>，单独设额度上限，便于隔离与撤销。</p>
              </div>
            </div>
          </section>

          {/* 9. 错误码 */}
          <section id='section-errors' className='api-section' ref={(el) => (sectionRefs.current['section-errors'] = el)}>
            <h2 className='api-section-title'>错误码</h2>
            <div className='api-card'>
              <div className='api-card-body'>
                <table className='api-params-table'>
                  <thead><tr><th>HTTP 状态码</th><th>说明</th><th>处理</th></tr></thead>
                  <tbody>
                    <tr><td><span className='api-param-name'>200</span></td><td style={{ color: 'var(--text-secondary)' }}>请求成功</td><td style={{ color: 'var(--text-secondary)' }}>-</td></tr>
                    <tr><td><span className='api-param-name'>400</span></td><td style={{ color: 'var(--text-secondary)' }}>请求参数错误</td><td style={{ color: 'var(--text-secondary)' }}>检查请求参数</td></tr>
                    <tr><td><span className='api-param-name'>401</span></td><td style={{ color: 'var(--text-secondary)' }}>API Key 无效或已禁用</td><td style={{ color: 'var(--text-secondary)' }}>检查 Key 状态与有效期</td></tr>
                    <tr><td><span className='api-param-name'>403</span></td><td style={{ color: 'var(--text-secondary)' }}>无权使用模型</td><td style={{ color: 'var(--text-secondary)' }}>检查应用的模型范围</td></tr>
                    <tr><td><span className='api-param-name'>404</span></td><td style={{ color: 'var(--text-secondary)' }}>模型不存在或无可用渠道</td><td style={{ color: 'var(--text-secondary)' }}>确认模型名称正确</td></tr>
                    <tr><td><span className='api-param-name'>429</span></td><td style={{ color: 'var(--text-secondary)' }}>额度不足或触发限流</td><td style={{ color: 'var(--text-secondary)' }}>充值或降低并发稍后重试</td></tr>
                    <tr><td><span className='api-param-name'>500</span></td><td style={{ color: 'var(--text-secondary)' }}>上游渠道波动</td><td style={{ color: 'var(--text-secondary)' }}>稍后重试，持续失败联系管理员</td></tr>
                  </tbody>
                </table>
                <p className='api-desc' style={{ marginTop: '16px' }}>错误响应格式（OpenAI 兼容）：</p>
                <div className='api-code-block'><pre>{`{
  "error": {
    "message": "错误描述",
    "type": "invalid_request_error",
    "code": "401"
  }
}`}</pre></div>
              </div>
            </div>
          </section>

          {/* 10. 常见问题 */}
          <section id='section-faq' className='api-section' ref={(el) => (sectionRefs.current['section-faq'] = el)}>
            <h2 className='api-section-title'>常见问题</h2>
            <div className='api-card'>
              <div className='api-card-body'>
                <details style={{ marginBottom: '12px' }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--text-primary)' }}>和直接调模型官方 API 有什么区别？</summary>
                  <p className='api-desc' style={{ marginTop: '8px' }}>协议完全一致（OpenAI 兼容），区别只在 Base URL 和 Key，以及本平台的统一计费与多模型聚合。价格由平台定价，见模型广场。</p>
                </details>
                <details style={{ marginBottom: '12px' }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--text-primary)' }}>一个 Key 可以多人/多项目共用吗？</summary>
                  <p className='api-desc' style={{ marginTop: '8px' }}>可以，但建议分应用管理：额度隔离、日志可区分、泄露时单独撤销。</p>
                </details>
                <details style={{ marginBottom: '12px' }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--text-primary)' }}>充值后额度没到账？</summary>
                  <p className='api-desc' style={{ marginTop: '8px' }}>在线支付到账依赖支付平台异步回调，需站点公网可达；等待 1~2 分钟仍未到账，在订单中核对支付状态，联系管理员处理。</p>
                </details>
                <details style={{ marginBottom: '12px' }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--text-primary)' }}>怎么知道某个模型划不划算？</summary>
                  <p className='api-desc' style={{ marginTop: '8px' }}>模型广场输出价 ≈ 输入价 × 补全倍率；长回复场景优先看输出价。</p>
                </details>
                <details>
                  <summary style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--text-primary)' }}>可以使用 OpenAI 官方 SDK 吗？</summary>
                  <p className='api-desc' style={{ marginTop: '8px' }}>可以。将 base_url 设为本站点地址，api_key 设为你的 FluxAI API Key 即可。</p>
                </details>
              </div>
            </div>
          </section>

          {aboutCard}
        </div>

        {/* 右侧目录栏 - 覆盖整个页面 */}
        <div className='about-toc'>
          <div className='about-toc-title'>目录</div>

          <div className={`about-toc-section ${activeId === 'section-intro' ? 'active' : ''}`} onClick={() => scrollTo('section-intro')}>产品简介</div>
          <div className={`about-toc-section ${activeId === 'section-quickstart' ? 'active' : ''}`} onClick={() => scrollTo('section-quickstart')}>快速开始</div>
          <div className={`about-toc-section ${activeId === 'section-auth' ? 'active' : ''}`} onClick={() => scrollTo('section-auth')}>鉴权</div>

          <div className={`about-toc-section ${activeId === 'section-apis' || (activeId.startsWith('section-') && API_SECTIONS.some(s => s.id === activeId)) ? 'active' : ''}`} onClick={() => scrollTo('section-apis')}>接口文档</div>
          {API_SECTIONS.map((section) => (
            <div key={section.id} className={`about-toc-api ${activeId === section.id ? 'active' : ''}`} onClick={() => scrollTo(section.id)}>{section.title}</div>
          ))}
          <div className={`about-toc-api ${activeId === 'section-response' ? 'active' : ''}`} onClick={() => scrollTo('section-response')}>响应结构</div>

          <div className={`about-toc-section ${activeId === 'section-clients' ? 'active' : ''}`} onClick={() => scrollTo('section-clients')}>第三方客户端接入</div>
          <div className={`about-toc-section ${activeId === 'section-models-list' ? 'active' : ''}`} onClick={() => scrollTo('section-models-list')}>模型与价格</div>
          <div className={`about-toc-section ${activeId === 'section-topup' ? 'active' : ''}`} onClick={() => scrollTo('section-topup')}>充值与对账</div>
          <div className={`about-toc-section ${activeId === 'section-app' ? 'active' : ''}`} onClick={() => scrollTo('section-app')}>应用管理</div>
          <div className={`about-toc-section ${activeId === 'section-errors' ? 'active' : ''}`} onClick={() => scrollTo('section-errors')}>错误码</div>
          <div className={`about-toc-section ${activeId === 'section-faq' ? 'active' : ''}`} onClick={() => scrollTo('section-faq')}>常见问题</div>
        </div>
      </div>
    </div>
  );
};

export default About;
