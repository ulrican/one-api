import React, { useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Grid, Header } from 'semantic-ui-react';
import { API, showError, showNotice, timestamp2string } from '../../helpers';
import { StatusContext } from '../../context/Status';
import { marked } from 'marked';
import { UserContext } from '../../context/User';
import { Link } from 'react-router-dom';

const Home = () => {
  const { t } = useTranslation();
  const [statusState, statusDispatch] = useContext(StatusContext);
  const [homePageContentLoaded, setHomePageContentLoaded] = useState(false);
  const [homePageContent, setHomePageContent] = useState('');
  const [userState] = useContext(UserContext);

  const displayNotice = async () => {
    try {
      const res = await API.get('/api/notice');
      // 后端不可达时 axios 拦截器会返回 undefined，这里做防御避免页面崩溃
      const { success, message, data } = res?.data ?? {};
      if (success) {
        let oldNotice = localStorage.getItem('notice');
        if (data !== oldNotice && data !== '') {
          const htmlNotice = marked(data);
          showNotice(htmlNotice, true);
          localStorage.setItem('notice', data);
        }
      } else if (message) {
        showError(message);
      }
    } catch (e) {
      // 网络错误已由 axios 拦截器统一提示，忽略以避免未捕获异常
    }
  };

  const displayHomePageContent = async () => {
    setHomePageContent(localStorage.getItem('home_page_content') || '');
    try {
      const res = await API.get('/api/home_page_content');
      // 后端不可达时 axios 拦截器会返回 undefined，这里做防御避免页面崩溃
      const { success, message, data } = res?.data ?? {};
      if (success) {
        let content = data;
        if (data && !data.startsWith('https://')) {
          content = marked.parse(data);
        }
        setHomePageContent(content);
        localStorage.setItem('home_page_content', content);
      } else {
        if (message) showError(message);
        setHomePageContent(t('home.loading_failed'));
      }
    } catch (e) {
      // 网络错误已由 axios 拦截器统一提示，显示兜底内容
      setHomePageContent(t('home.loading_failed'));
    }
    setHomePageContentLoaded(true);
  };

  const getStartTimeString = () => {
    const timestamp = statusState?.status?.start_time;
    return timestamp2string(timestamp);
  };

  useEffect(() => {
    displayNotice().then();
    displayHomePageContent().then();
  }, []);

  return (
    <>
      {homePageContentLoaded && homePageContent === '' ? (
        <div className='dashboard-container'>
          <Card fluid className='chart-card'>
            <Card.Content>
              <Card.Header className='header'>
                {t('home.welcome.title')}
              </Card.Header>
              <Card.Description style={{ lineHeight: '1.6' }}>
                <p>{t('home.welcome.description')}</p>
                {!userState.user && <p>{t('home.welcome.login_notice')}</p>}
              </Card.Description>
            </Card.Content>
          </Card>
          <Card fluid className='chart-card'>
            <Card.Content>
              <Card.Header>
                <Header as='h3'>{t('home.system_status.title')}</Header>
              </Card.Header>
              <Grid columns={2} stackable>
                <Grid.Column>
                  <Card
                    fluid
                    className='chart-card'
                    style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.12)' }}
                  >
                    <Card.Content>
                      <Card.Header>
                        <Header as='h3'>
                          {t('home.system_status.info.title')}
                        </Header>
                      </Card.Header>
                      <Card.Description
                        style={{ lineHeight: '2', marginTop: '1em' }}
                      >
                        <p
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5em',
                          }}
                        >
                          <i className='info circle icon'></i>
                          <span style={{ fontWeight: 'bold' }}>
                            {t('home.system_status.info.name')}
                          </span>
                          <span>{statusState?.status?.system_name}</span>
                        </p>
                        <p
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5em',
                          }}
                        >
                          <i className='code branch icon'></i>
                          <span style={{ fontWeight: 'bold' }}>
                            {t('home.system_status.info.version')}
                          </span>
                          <span>
                            {statusState?.status?.version || 'unknown'}
                          </span>
                        </p>
                        <p
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5em',
                          }}
                        >
                          <i className='github icon'></i>
                          <span style={{ fontWeight: 'bold' }}>
                            {t('home.system_status.info.source')}
                          </span>
                          <a
                            href='https://github.com/songquanpeng/one-api'
                            target='_blank'
                            style={{ color: 'var(--brand-blue)' }}
                          >
                            {t('home.system_status.info.source_link')}
                          </a>
                        </p>
                        <p
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5em',
                          }}
                        >
                          <i className='clock outline icon'></i>
                          <span style={{ fontWeight: 'bold' }}>
                            {t('home.system_status.info.start_time')}
                          </span>
                          <span>{getStartTimeString()}</span>
                        </p>
                      </Card.Description>
                    </Card.Content>
                  </Card>
                </Grid.Column>

                <Grid.Column>
                  <Card
                    fluid
                    className='chart-card'
                    style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.12)' }}
                  >
                    <Card.Content>
                      <Card.Header>
                        <Header as='h3'>
                          {t('home.system_status.config.title')}
                        </Header>
                      </Card.Header>
                      <Card.Description
                        style={{ lineHeight: '2', marginTop: '1em' }}
                      >
                        <p
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5em',
                          }}
                        >
                          <i className='envelope icon'></i>
                          <span style={{ fontWeight: 'bold' }}>
                            {t('home.system_status.config.email_verify')}
                          </span>
                          <span
                            style={{
                              color: statusState?.status?.email_verification
                                ? 'var(--brand-green)'
                                : 'var(--brand-danger)',
                              fontWeight: '500',
                            }}
                          >
                            {statusState?.status?.email_verification
                              ? t('home.system_status.config.enabled')
                              : t('home.system_status.config.disabled')}
                          </span>
                        </p>
                        <p
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5em',
                          }}
                        >
                          <i className='github icon'></i>
                          <span style={{ fontWeight: 'bold' }}>
                            {t('home.system_status.config.github_oauth')}
                          </span>
                          <span
                            style={{
                              color: statusState?.status?.github_oauth
                                ? 'var(--brand-green)'
                                : 'var(--brand-danger)',
                              fontWeight: '500',
                            }}
                          >
                            {statusState?.status?.github_oauth
                              ? t('home.system_status.config.enabled')
                              : t('home.system_status.config.disabled')}
                          </span>
                        </p>
                        <p
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5em',
                          }}
                        >
                          <i className='wechat icon'></i>
                          <span style={{ fontWeight: 'bold' }}>
                            {t('home.system_status.config.wechat_login')}
                          </span>
                          <span
                            style={{
                              color: statusState?.status?.wechat_login
                                ? 'var(--brand-green)'
                                : 'var(--brand-danger)',
                              fontWeight: '500',
                            }}
                          >
                            {statusState?.status?.wechat_login
                              ? t('home.system_status.config.enabled')
                              : t('home.system_status.config.disabled')}
                          </span>
                        </p>
                        <p
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5em',
                          }}
                        >
                          <i className='shield alternate icon'></i>
                          <span style={{ fontWeight: 'bold' }}>
                            {t('home.system_status.config.turnstile')}
                          </span>
                          <span
                            style={{
                              color: statusState?.status?.turnstile_check
                                ? 'var(--brand-green)'
                                : 'var(--brand-danger)',
                              fontWeight: '500',
                            }}
                          >
                            {statusState?.status?.turnstile_check
                              ? t('home.system_status.config.enabled')
                              : t('home.system_status.config.disabled')}
                          </span>
                        </p>
                      </Card.Description>
                    </Card.Content>
                  </Card>
                </Grid.Column>
              </Grid>
            </Card.Content>
          </Card>
        </div>
      ) : (
        <>
          {homePageContent.startsWith('https://') ? (
            <iframe
              src={homePageContent}
              style={{ width: '100%', height: '100vh', border: 'none' }}
            />
          ) : (
            <div
              style={{ fontSize: 'larger' }}
              dangerouslySetInnerHTML={{ __html: homePageContent }}
            ></div>
          )}
        </>
      )}
    </>
  );
};

export default Home;
