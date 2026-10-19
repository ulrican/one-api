import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Icon } from 'semantic-ui-react';
import { showError } from '../../helpers';
import Markdown from './Markdown';

// Task4-9 语音模型体验窗口：上传音频 → /v1/chat/completions 多模态（input_audio base64），
// 返回语音转写文本。
// 说明：七牛模型库的 audio 类模型均为多模态 LLM（gemini/qwen-vl/grok 等），
// 通过 chat/completions 的 input_audio 接收音频，无 whisper 兼容的
// /v1/audio/transcriptions 模型，故语音体验与图片体验同构。
// ≤25MB 前端校验。
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

const AudioPanel = ({ appKey, model }) => {
  const { t } = useTranslation();
  const [file, setFile] = useState(null);
  const [audioData, setAudioData] = useState('');
  const [audioFormat, setAudioFormat] = useState('wav');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const fileRef = useRef(null);

  const handleFile = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    if (!f.type.startsWith('audio/')) {
      showError(t('experience.error.not_audio'));
      return;
    }
    if (f.size > MAX_AUDIO_BYTES) {
      showError(t('experience.error.audio_too_large'));
      return;
    }
    // 从扩展名推断格式（wav/mp3/webm/flac 等，默认 wav）
    const ext = (f.name.split('.').pop() || 'wav').toLowerCase();
    setAudioFormat(['wav', 'mp3', 'webm', 'flac', 'ogg', 'm4a'].includes(ext) ? ext : 'wav');
    setFile(f);
    setResult('');
    const reader = new FileReader();
    reader.onload = () => {
      // data:audio/wav;base64,xxxx → 取纯 base64
      const result = String(reader.result || '');
      setAudioData(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.readAsDataURL(f);
  };

  const submit = async () => {
    if (loading) return;
    if (!appKey) {
      showError(t('experience.error.no_app'));
      return;
    }
    if (!model) {
      showError(t('experience.error.no_model'));
      return;
    }
    if (!file || !audioData) {
      showError(t('experience.error.no_audio'));
      return;
    }
    setLoading(true);
    setResult('');
    try {
      const res = await fetch('/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer sk-${appKey}`,
        },
        body: JSON.stringify({
          model: model,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: t('experience.audio.default_prompt'),
                },
                {
                  type: 'input_audio',
                  input_audio: { data: audioData, format: audioFormat },
                },
              ],
            },
          ],
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const message =
          json?.error?.message || json?.message || `HTTP ${res.status}`;
        showError(message);
        return;
      }
      const text = json?.choices?.[0]?.message?.content || '';
      if (!text) {
        showError(t('experience.error.empty_response'));
        return;
      }
      setResult(text);
      setHistory((prev) =>
        [
          {
            fileName: file.name,
            result: text,
            time: new Date().toLocaleString(),
          },
          ...prev,
        ].slice(0, 10)
      );
    } catch (error) {
      showError(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div
        className='exp-upload'
        onClick={() => fileRef.current && fileRef.current.click()}
      >
        <Icon name='music' />
        {file ? (
          <span className='exp-upload-file'>{file.name}</span>
        ) : (
          <>
            <span>{t('experience.audio.upload_title')}</span>
            <span className='exp-upload-file'>
              {t('experience.audio.upload_desc')}
            </span>
          </>
        )}
      </div>
      <input
        ref={fileRef}
        type='file'
        accept='audio/*'
        style={{ display: 'none' }}
        onChange={handleFile}
      />
      <div className='exp-actions'>
        <Button
          positive
          onClick={submit}
          loading={loading}
          disabled={!file || loading}
        >
          <Icon name='microphone' />
          {t('experience.audio.submit')}
        </Button>
      </div>
      {loading && (
        <div className='exp-loading'>
          <Icon name='spinner' loading />
          {t('experience.audio.transcribing')}
        </div>
      )}
      {result && (
        <div>
          <div className='exp-result-label'>{t('experience.result_label')}</div>
          <div className='exp-result'>
            <Markdown content={result} />
          </div>
        </div>
      )}
      {history.length > 0 && (
        <div className='exp-history'>
          <div className='exp-result-label'>{t('experience.history_label')}</div>
          {history.map((item, idx) => (
            <div className='exp-history-item' key={idx}>
              <div className='exp-history-audio-icon'>
                <Icon name='file audio outline' />
              </div>
              <div className='exp-history-body'>
                <span className='exp-history-meta'>
                  {item.fileName} · {item.time}
                </span>
                <div className='exp-history-text'>
                  <Markdown content={item.result} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
};

export default AudioPanel;
