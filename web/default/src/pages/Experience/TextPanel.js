import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from 'semantic-ui-react';
import { showError, showSuccess } from '../../helpers';
import EmptyState from '../../components/EmptyState';
import Markdown from './Markdown';

// Task4-9 文本模型体验窗口：SSE 多轮对话（调用模式与 Playground 一致）
const TextPanel = ({ appKey, model }) => {
  const { t } = useTranslation();
  const [systemPrompt, setSystemPrompt] = useState('');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef(null);
  const bottomRef = useRef(null);

  useEffect(() => {
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
    if (!appKey) {
      showError(t('experience.error.no_app'));
      return;
    }
    if (!model) {
      showError(t('experience.error.no_model'));
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
          Authorization: `Bearer sk-${appKey}`,
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

  return (
    <>
      <input
        className='exp-system-input'
        placeholder={t('playground.system_placeholder')}
        value={systemPrompt}
        onChange={(e) => setSystemPrompt(e.target.value)}
        autoComplete='off'
      />
      <div
        className={`exp-messages${
          messages.length === 0 ? ' exp-messages-empty' : ''
        }`}
      >
        {messages.length === 0 ? (
          <EmptyState
            icon='comments'
            title={t('experience.text.empty.title')}
            description={t('experience.text.empty.desc')}
          />
        ) : (
          messages.map((msg, idx) => (
            <div key={idx} className={`exp-msg exp-msg-${msg.role}`}>
              <div className='exp-bubble'>
                {msg.role === 'assistant' ? (
                  msg.content ? (
                    <Markdown content={msg.content} />
                  ) : streaming && idx === messages.length - 1 ? (
                    <span className='exp-typing'>…</span>
                  ) : (
                    ''
                  )
                ) : (
                  msg.content
                )}
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
      <div className='exp-input-area'>
        <textarea
          className='exp-textarea'
          placeholder={t('playground.input_placeholder')}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={3}
          disabled={streaming}
        />
        <div className='exp-input-actions'>
          <span className='exp-hint-text'>
            {t('playground.hint.enter')}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button basic onClick={clearConversation}>
              {t('playground.clear')}
            </Button>
            {streaming ? (
              <Button negative onClick={stopStreaming}>
                {t('playground.stop')}
              </Button>
            ) : (
              <Button positive onClick={sendMessage}>
                {t('playground.send')}
              </Button>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default TextPanel;
