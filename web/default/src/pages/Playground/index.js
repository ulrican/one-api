import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Dropdown, Icon } from 'semantic-ui-react';
import { API, copy, showError, showSuccess } from '../../helpers';
import EmptyState from '../../components/EmptyState';
import './Playground.css';

const ITEMS_PER_PAGE = 10;

const Playground = () => {
  const { t } = useTranslation();
  const [tokens, setTokens] = useState([]);
  const [tokenKey, setTokenKey] = useState('');
  const [models, setModels] = useState([]);
  const [model, setModel] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    loadTokens();
    loadModels();
    // 卸载时中断未完成的 SSE 连接，防止连接泄漏
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const loadTokens = async () => {
    try {
      let all = [];
      for (let p = 0; p < 100; p++) {
        const res = await API.get(`/api/token/?p=${p}`);
        const { success, message, data } = res.data;
        if (!success) {
          showError(message);
          return;
        }
        all = all.concat(data);
        if (data.length < ITEMS_PER_PAGE) break;
      }
      const enabled = all.filter((tk) => tk.status === 1);
      setTokens(enabled);
      if (enabled.length > 0) {
        setTokenKey(enabled[0].key);
      }
    } catch (error) {
      showError(error.message);
    }
  };

  const loadModels = async () => {
    try {
      const res = await API.get('/api/user/available_models');
      const { success, message, data } = res.data;
      if (success && Array.isArray(data)) {
        setModels(data);
        if (data.length > 0) {
          setModel(data[0]);
        }
      } else if (!success) {
        showError(message);
      }
    } catch (error) {
      showError(error.message);
    }
  };

  const trimEmptyAssistant = () => {
    setMessages((prev) => {
      const next = [...prev];
      if (
        next.length > 0 &&
        next[next.length - 1].role === 'assistant' &&
        !next[next.length - 1].content
      ) {
        next.pop();
      }
      return next;
    });
  };

  const sendMessage = async () => {
    if (streaming) return;
    const text = input.trim();
    if (!text) return;
    if (!tokenKey) {
      showError(t('playground.error.no_token'));
      return;
    }
    if (!model) {
      showError(t('playground.error.no_model'));
      return;
    }

    const history = [];
    if (systemPrompt.trim()) {
      history.push({ role: 'system', content: systemPrompt.trim() });
    }
    messages.forEach((m) => history.push({ role: m.role, content: m.content }));
    history.push({ role: 'user', content: text });

    setMessages([
      ...messages,
      { role: 'user', content: text },
      { role: 'assistant', content: '' },
    ]);
    setInput('');
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;
    let assistantContent = '';

    try {
      const res = await fetch('/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer sk-${tokenKey}`,
        },
        body: JSON.stringify({
          model: model,
          messages: history,
          stream: true,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        let message = `HTTP ${res.status}`;
        try {
          const errJson = await res.json();
          message = errJson.error?.message || errJson.message || message;
        } catch (e) {
          // ignore json parse error
        }
        showError(message);
        trimEmptyAssistant();
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let done = false;
      while (!done) {
        const result = await reader.read();
        done = result.done;
        if (result.value) {
          buffer += decoder.decode(result.value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop();
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const payload = trimmed.slice(5).trim();
            if (payload === '[DONE]') continue;
            try {
              const json = JSON.parse(payload);
              const delta = json.choices?.[0]?.delta?.content || '';
              if (delta) {
                assistantContent += delta;
                setMessages((prev) => {
                  const next = [...prev];
                  next[next.length - 1] = {
                    role: 'assistant',
                    content: assistantContent,
                  };
                  return next;
                });
              }
            } catch (e) {
              // 忽略不完整的分片
            }
          }
        }
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        showSuccess(t('playground.info.stopped'));
        trimEmptyAssistant();
      } else {
        showError(error.message);
        trimEmptyAssistant();
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const stopStreaming = () => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
  };

  const clearConversation = () => {
    if (streaming) {
      stopStreaming();
    }
    setMessages([]);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      sendMessage();
    }
  };

  // F18 第三方客户端集成：从 Playground 直接跳转或复制接入链接
  const onConnectClient = async (type) => {
    if (!tokenKey) {
      showError(t('clients.empty'));
      return;
    }
    let status = localStorage.getItem('status');
    let serverAddress = '';
    if (status) {
      status = JSON.parse(status);
      serverAddress = status.server_address || '';
    }
    if (!serverAddress) {
      serverAddress = window.location.origin;
    }
    const encodedAddr = encodeURIComponent(serverAddress);
    let url;
    switch (type) {
      case 'ama':
        url = `ama://set-api-key?server=${encodedAddr}&key=sk-${tokenKey}`;
        break;
      case 'opencat':
        url = `opencat://team/join?domain=${encodedAddr}&token=sk-${tokenKey}`;
        break;
      case 'next':
        url = `https://app.nextchat.dev/#/?settings={"key":"sk-${tokenKey}","url":"${serverAddress}"}`;
        break;
      case 'lobechat':
        url = `https://lobechat.com/?settings={"keyVaults":{"openai":{"apiKey":"sk-${tokenKey}","baseURL":"${serverAddress}/v1"}}}`;
        break;
      case 'copy_key':
        url = `sk-${tokenKey}`;
        break;
      default:
        return;
    }
    // deeplink 类型直接跳转，其他复制到剪贴板
    if (type === 'ama' || type === 'opencat') {
      window.location.href = url;
    } else if (await copy(url)) {
      showSuccess(t('clients.copied'));
    }
  };

  // 令牌→模型级联：令牌配置了允许模型（models 非空）时，下拉仅显示两者交集
  const getTokenAllowedModels = (tk) => {
    if (!tk || !tk.models) return null;
    const list = String(tk.models)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return list.length > 0 ? list : null;
  };

  const currentToken = tokens.find((tk) => tk.key === tokenKey);
  const tokenAllowed = getTokenAllowedModels(currentToken);
  const effectiveModels =
    tokenAllowed && tokenAllowed.length > 0
      ? models.filter((m) => tokenAllowed.includes(m))
      : models;

  // 切换令牌/模型列表刷新后，若当前选中模型不在交集内则自动重置
  useEffect(() => {
    if (models.length === 0) return;
    if (tokenAllowed && !tokenAllowed.includes(model)) {
      setModel(effectiveModels.length > 0 ? effectiveModels[0] : '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenKey, models, tokens]);

  const tokenOptions = tokens.map((tk) => ({
    key: tk.id,
    text: tk.name,
    value: tk.key,
  }));

  const modelOptions = effectiveModels.map((m) => ({
    key: m,
    text: m,
    value: m,
  }));

  return (
    <div className='dashboard-container playground-page'>
      <div className='playground-card'>
        <div className='playground-header'>
          <div className='playground-title'>
            <Icon name='comments' />
            {t('playground.title')}
          </div>
          <div className='playground-toolbar'>
            <Dropdown
              selection
              className='playground-select'
              placeholder={t('playground.token_placeholder')}
              options={tokenOptions}
              value={tokenKey}
              onChange={(e, { value }) => setTokenKey(value)}
              disabled={streaming}
            />
            <Dropdown
              selection
              search
              className='playground-select playground-select-model'
              placeholder={t('playground.model_placeholder')}
              options={modelOptions}
              value={model}
              onChange={(e, { value }) => setModel(value)}
              disabled={streaming}
            />
            <Button
              icon
              basic
              className='playground-clear-btn'
              title={t('playground.clear')}
              onClick={clearConversation}
            >
              <Icon name='eraser' />
            </Button>
            <Dropdown
              icon='plug'
              className='playground-clear-btn'
              button
              basic
              floating
              disabled={!tokenKey || streaming}
              title={t('clients.action')}
              options={[
                { key: 'next', text: t('clients.list.nextchat'), value: 'next' },
                { key: 'opencat', text: t('clients.list.opencat'), value: 'opencat' },
                { key: 'lobechat', text: t('clients.list.lobechat'), value: 'lobechat' },
                { key: 'ama', text: t('clients.list.cherry_studio'), value: 'ama' },
                { key: 'copy_key', text: t('clients.copy_key'), value: 'copy_key' },
              ]}
              onChange={(e, { value }) => onConnectClient(value)}
            />
          </div>
        </div>

        <div className='playground-system'>
          <input
            className='playground-system-input'
            placeholder={t('playground.system_placeholder')}
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            autoComplete='off'
          />
        </div>

        <div className='playground-messages'>
          {messages.length === 0 ? (
            <div className='playground-empty'>
              <EmptyState
                icon='comments'
                title={t('playground.empty.title')}
                description={t('playground.empty.desc')}
              />
            </div>
          ) : (
            messages.map((msg, idx) => (
              <div
                key={idx}
                className={`playground-msg playground-msg-${msg.role}`}
              >
                <div className='playground-bubble'>
                  {msg.content ||
                    (streaming && idx === messages.length - 1 ? (
                      <span className='playground-typing'>…</span>
                    ) : (
                      ''
                    ))}
                </div>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        <div className='playground-input'>
          <textarea
            className='playground-textarea'
            placeholder={t('playground.input_placeholder')}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={3}
            disabled={streaming}
          />
          <div className='playground-input-actions'>
            <span className='playground-hint'>
              {t('playground.hint.enter')}
            </span>
            {streaming ? (
              <Button negative onClick={stopStreaming}>
                <Icon name='stop' />
                {t('playground.stop')}
              </Button>
            ) : (
              <Button positive onClick={sendMessage}>
                <Icon name='send' />
                {t('playground.send')}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Playground;
