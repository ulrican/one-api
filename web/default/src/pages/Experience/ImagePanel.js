import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Icon } from 'semantic-ui-react';
import { showError } from '../../helpers';
import Markdown from './Markdown';

// Task4-9 图片模型体验窗口：上传图片 → /v1/chat/completions 多模态（image_url base64），
// 返回图片理解/分类文本。≤10MB 前端校验。
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const ImagePanel = ({ appKey, model }) => {
  const { t } = useTranslation();
  const [dataUrl, setDataUrl] = useState('');
  const [fileName, setFileName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const fileRef = useRef(null);

  const handleFile = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showError(t('experience.error.not_image'));
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      showError(t('experience.error.image_too_large'));
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setDataUrl(reader.result);
    reader.readAsDataURL(file);
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
    if (!dataUrl) {
      showError(t('experience.error.no_image'));
      return;
    }
    const text = prompt.trim() || t('experience.image.default_prompt');
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
                { type: 'text', text: text },
                { type: 'image_url', image_url: { url: dataUrl } },
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
      const content = json?.choices?.[0]?.message?.content || '';
      if (!content) {
        showError(t('experience.error.empty_response'));
        return;
      }
      setResult(content);
      setHistory((prev) =>
        [
          {
            thumb: dataUrl,
            fileName: fileName,
            prompt: text,
            result: content,
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
        <Icon name='image' />
        {dataUrl ? (
          <>
            <img className='exp-preview' src={dataUrl} alt='preview' />
            <span className='exp-upload-file'>{fileName}</span>
          </>
        ) : (
          <>
            <span>{t('experience.image.upload_title')}</span>
            <span className='exp-upload-file'>
              {t('experience.image.upload_desc')}
            </span>
          </>
        )}
      </div>
      <input
        ref={fileRef}
        type='file'
        accept='image/*'
        style={{ display: 'none' }}
        onChange={handleFile}
      />
      <input
        className='exp-prompt-input'
        placeholder={t('experience.image.default_prompt')}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        autoComplete='off'
      />
      <div className='exp-actions'>
        <Button
          positive
          onClick={submit}
          loading={loading}
          disabled={!dataUrl || loading}
        >
          <Icon name='search' />
          {t('experience.image.submit')}
        </Button>
      </div>
      {loading && (
        <div className='exp-loading'>
          <Icon name='spinner' loading />
          {t('experience.image.analyzing')}
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
              <img className='exp-history-thumb' src={item.thumb} alt='' />
              <div className='exp-history-body'>
                <span className='exp-history-meta'>{item.time}</span>
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

export default ImagePanel;
