import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from 'semantic-ui-react';
import { API, showError } from '../../helpers';
import { marked } from 'marked';

const GUIDE_VERSION = '20260914'; // 更新 FluxAPI-guide.md 后需递增，绕过静态资源 7 天强缓存

const About = () => {
  const { t } = useTranslation();
  const [about, setAbout] = useState('');
  const [aboutLoaded, setAboutLoaded] = useState(false);
  const [guideHtml, setGuideHtml] = useState('');

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
      setAbout(t('about.loading_failed'));
    }
    setAboutLoaded(true);
  };

  // FluxAPI 使用说明：静态 markdown 单源（public/FluxAPI-guide.md），
  // {站点地址} 占位符渲染时替换为实际访问域名；加载失败时静默隐藏该区块
  const loadGuide = async () => {
    try {
      const res = await fetch(`/FluxAPI-guide.md?v=${GUIDE_VERSION}`);
      if (!res.ok) return;
      const md = await res.text();
      setGuideHtml(
        marked.parse(md.replace(/\{站点地址\}/g, window.location.origin))
      );
    } catch (e) {
      /* 忽略 */
    }
  };

  useEffect(() => {
    displayAbout().then();
    loadGuide();
  }, []);

  const guideCard =
    guideHtml === '' ? null : (
      <Card fluid className='chart-card'>
        <Card.Content>
          <Card.Header className='header'>FluxAPI 使用说明</Card.Header>
          <div
            className='flux-guide'
            style={{ fontSize: '15px', marginTop: '10px' }}
            dangerouslySetInnerHTML={{ __html: guideHtml }}
          ></div>
        </Card.Content>
      </Card>
    );

  return (
    <>
      {aboutLoaded && about === '' ? (
        <div className='dashboard-container'>
          <Card fluid className='chart-card'>
            <Card.Content>
              <Card.Header className='header'>{t('about.title')}</Card.Header>
              <p>{t('about.description')}</p>
              {t('about.repository')}
              <a href='https://github.com/songquanpeng/one-api'>
                https://github.com/songquanpeng/one-api
              </a>
            </Card.Content>
          </Card>
          {guideCard}
        </div>
      ) : (
        <>
          {about.startsWith('https://') ? (
            <iframe
              src={about}
              style={{ width: '100%', height: '100vh', border: 'none' }}
            />
          ) : (
            <div className='dashboard-container'>
              <Card fluid className='chart-card'>
                <Card.Content>
                  <div
                    style={{ fontSize: 'larger' }}
                    dangerouslySetInnerHTML={{ __html: about }}
                  ></div>
                </Card.Content>
              </Card>
              {guideCard}
            </div>
          )}
        </>
      )}
    </>
  );
};

export default About;
