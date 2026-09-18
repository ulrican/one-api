import React, { useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Divider,
  Form,
  Header,
  Image,
  Label,
  Message,
  Modal,
  Table,
} from 'semantic-ui-react';
import { Link, useNavigate } from 'react-router-dom';
import {
  API,
  copy,
  showError,
  showInfo,
  showNotice,
  showSuccess,
  timestamp2string,
} from '../helpers';
import { renderQuota } from '../helpers/render';
import Turnstile from 'react-turnstile';
import QRCode from 'qrcode';
import { UserContext } from '../context/User';
import { onGitHubOAuthClicked, onLarkOAuthClicked } from './utils';

const PersonalSetting = () => {
  const { t } = useTranslation();
  const [userState, userDispatch] = useContext(UserContext);
  let navigate = useNavigate();

  const [inputs, setInputs] = useState({
    wechat_verification_code: '',
    email_verification_code: '',
    email: '',
    self_account_deletion_confirmation: '',
  });
  const [status, setStatus] = useState({});
  const [showWeChatBindModal, setShowWeChatBindModal] = useState(false);
  const [showEmailBindModal, setShowEmailBindModal] = useState(false);
  const [showAccountDeleteModal, setShowAccountDeleteModal] = useState(false);
  const [turnstileEnabled, setTurnstileEnabled] = useState(false);
  const [turnstileSiteKey, setTurnstileSiteKey] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [disableButton, setDisableButton] = useState(false);
  const [countdown, setCountdown] = useState(30);
  const [affLink, setAffLink] = useState('');
  const [systemToken, setSystemToken] = useState('');
  // F10 通知设置 + 登录会话
  const [notifyType, setNotifyType] = useState('');
  const [notifyInputs, setNotifyInputs] = useState({
    bark_server: '',
    bark_device_key: '',
    gotify_server: '',
    gotify_app_token: '',
    webhook_url: '',
    webhook_secret: '',
  });
  const [quotaThreshold, setQuotaThreshold] = useState('');
  const [savingSetting, setSavingSetting] = useState(false);
  const [testingNotify, setTestingNotify] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [showLogoutOthersModal, setShowLogoutOthersModal] = useState(false);
  const [logoutOthersLoading, setLogoutOthersLoading] = useState(false);
  const [quotaPerUnit, setQuotaPerUnit] = useState(500000);
  // F12 两步验证（TOTP）
  const [twofaEnabled, setTwofaEnabled] = useState(false);
  const [twofaSecret, setTwofaSecret] = useState('');
  const [twofaOtpauthUrl, setTwofaOtpauthUrl] = useState('');
  const [twofaQrUrl, setTwofaQrUrl] = useState('');
  const [twofaCode, setTwofaCode] = useState('');
  const [showTwoFASetupModal, setShowTwoFASetupModal] = useState(false);
  const [showTwoFADisableModal, setShowTwoFADisableModal] = useState(false);
  const [twofaLoading, setTwofaLoading] = useState(false);

  useEffect(() => {
    let status = localStorage.getItem('status');
    if (status) {
      status = JSON.parse(status);
      setStatus(status);
      if (status.turnstile_check) {
        setTurnstileEnabled(true);
        setTurnstileSiteKey(status.turnstile_site_key);
      }
      if (status.quota_per_unit) {
        setQuotaPerUnit(status.quota_per_unit);
      }
    }
    loadUserSetting();
    loadSessions();
    loadTwoFAStatus();
  }, []);

  useEffect(() => {
    let countdownInterval = null;
    if (disableButton && countdown > 0) {
      countdownInterval = setInterval(() => {
        setCountdown(countdown - 1);
      }, 1000);
    } else if (countdown === 0) {
      setDisableButton(false);
      setCountdown(30);
    }
    return () => clearInterval(countdownInterval); // Clean up on unmount
  }, [disableButton, countdown]);

  const handleInputChange = (e, { name, value }) => {
    setInputs((inputs) => ({ ...inputs, [name]: value }));
  };

  const generateAccessToken = async () => {
    const res = await API.get('/api/user/token');
    const { success, message, data } = res.data;
    if (success) {
      setSystemToken(data);
      setAffLink('');
      await copy(data);
      showSuccess(`令牌已重置并已复制到剪贴板`);
    } else {
      showError(message);
    }
  };

  const getAffLink = async () => {
    const res = await API.get('/api/user/aff');
    const { success, message, data } = res.data;
    if (success) {
      const code = typeof data === 'string' ? data : (data?.aff_code || '');
      let link = `${window.location.origin}/register?aff=${code}`;
      setAffLink(link);
      setSystemToken('');
      await copy(link);
      showSuccess(`邀请链接已复制到剪切板`);
    } else {
      showError(message);
    }
  };

  const handleAffLinkClick = async (e) => {
    e.target.select();
    await copy(e.target.value);
    showSuccess(`邀请链接已复制到剪切板`);
  };

  const handleSystemTokenClick = async (e) => {
    e.target.select();
    await copy(e.target.value);
    showSuccess(`系统令牌已复制到剪切板`);
  };

  const deleteAccount = async () => {
    if (inputs.self_account_deletion_confirmation !== userState.user.username) {
      showError('请输入你的账户名以确认删除！');
      return;
    }

    const res = await API.delete('/api/user/self');
    const { success, message } = res.data;

    if (success) {
      showSuccess('账户已删除！');
      await API.get('/api/user/logout');
      userDispatch({ type: 'logout' });
      localStorage.removeItem('user');
      navigate('/login');
    } else {
      showError(message);
    }
  };

  const bindWeChat = async () => {
    if (inputs.wechat_verification_code === '') return;
    const res = await API.get(
      `/api/oauth/wechat/bind?code=${inputs.wechat_verification_code}`
    );
    const { success, message } = res.data;
    if (success) {
      showSuccess('微信账户绑定成功！');
      setShowWeChatBindModal(false);
    } else {
      showError(message);
    }
  };

  const sendVerificationCode = async () => {
    setDisableButton(true);
    if (inputs.email === '') return;
    if (turnstileEnabled && turnstileToken === '') {
      showInfo('请稍后几秒重试，Turnstile 正在检查用户环境！');
      return;
    }
    setLoading(true);
    const res = await API.get(
      `/api/verification?email=${inputs.email}&turnstile=${turnstileToken}`
    );
    const { success, message } = res.data;
    if (success) {
      showSuccess('验证码发送成功，请检查邮箱！');
    } else {
      showError(message);
    }
    setLoading(false);
  };

  const bindEmail = async () => {
    if (inputs.email_verification_code === '') return;
    setLoading(true);
    const res = await API.get(
      `/api/oauth/email/bind?email=${inputs.email}&code=${inputs.email_verification_code}`
    );
    const { success, message } = res.data;
    if (success) {
      showSuccess('邮箱账户绑定成功！');
      setShowEmailBindModal(false);
    } else {
      showError(message);
    }
    setLoading(false);
  };

  // ---------- F10 通知设置 / 登录会话 ----------

  const parseNotifyPayload = (payloadJson) => {
    try {
      return JSON.parse(payloadJson || '{}') || {};
    } catch (e) {
      return {};
    }
  };

  const loadUserSetting = async () => {
    const res = await API.get('/api/user/setting');
    const { success, message, data } = res.data;
    if (success) {
      setNotifyType(data.notify_type || '');
      const p = parseNotifyPayload(data.notify_payload);
      setNotifyInputs({
        bark_server: p.server_url || '',
        bark_device_key: p.device_key || '',
        gotify_server: p.server_url || '',
        gotify_app_token: p.app_token || '',
        webhook_url: p.url || '',
        webhook_secret: p.secret || '',
      });
      setQuotaThreshold(
        data.quota_warning_threshold > 0
          ? (data.quota_warning_threshold / quotaPerUnit).toString()
          : ''
      );
    } else {
      showError(message);
    }
  };

  const buildNotifyPayload = () => {
    if (notifyType === 'bark') {
      const p = { device_key: notifyInputs.bark_device_key };
      if (notifyInputs.bark_server) p.server_url = notifyInputs.bark_server;
      return JSON.stringify(p);
    }
    if (notifyType === 'gotify') {
      return JSON.stringify({
        server_url: notifyInputs.gotify_server,
        app_token: notifyInputs.gotify_app_token,
      });
    }
    if (notifyType === 'webhook') {
      const p = { url: notifyInputs.webhook_url };
      if (notifyInputs.webhook_secret) p.secret = notifyInputs.webhook_secret;
      return JSON.stringify(p);
    }
    return '';
  };

  const saveUserSetting = async () => {
    let threshold = 0;
    if (quotaThreshold !== '' && quotaThreshold !== null) {
      threshold = Number(quotaThreshold);
      if (Number.isNaN(threshold) || threshold < 0) {
        showError(t('setting.personal.notify.invalid_threshold'));
        return;
      }
    }
    if (notifyType === 'bark' && !notifyInputs.bark_device_key) {
      showError(t('setting.personal.notify.missing_params'));
      return;
    }
    if (
      notifyType === 'gotify' &&
      (!notifyInputs.gotify_server || !notifyInputs.gotify_app_token)
    ) {
      showError(t('setting.personal.notify.missing_params'));
      return;
    }
    if (notifyType === 'webhook' && !notifyInputs.webhook_url) {
      showError(t('setting.personal.notify.missing_params'));
      return;
    }
    setSavingSetting(true);
    const res = await API.put('/api/user/setting', {
      notify_type: notifyType,
      notify_payload: buildNotifyPayload(),
      quota_warning_threshold: Math.round(threshold * quotaPerUnit),
    });
    const { success, message } = res.data;
    if (success) {
      showSuccess(t('setting.personal.notify.saved'));
    } else {
      showError(message);
    }
    setSavingSetting(false);
  };

  const testUserNotify = async () => {
    setTestingNotify(true);
    const res = await API.post('/api/user/setting/notify_test');
    const { success, message } = res.data;
    if (success) {
      showSuccess(message || t('setting.personal.notify.test_ok'));
    } else {
      showError(message);
    }
    setTestingNotify(false);
  };

  const loadSessions = async () => {
    const res = await API.get('/api/user/sessions');
    const { success, data } = res.data;
    if (success) {
      setSessions(data || []);
    }
  };

  const logoutOtherSessions = async () => {
    setLogoutOthersLoading(true);
    const res = await API.delete('/api/user/sessions/others');
    const { success, message } = res.data;
    if (success) {
      showSuccess(message || t('setting.personal.sessions.logout_done'));
      setShowLogoutOthersModal(false);
      await loadSessions();
    } else {
      showError(message);
    }
    setLogoutOthersLoading(false);
  };

  const handleNotifyInputChange = (e, { name, value }) => {
    setNotifyInputs((inputs) => ({ ...inputs, [name]: value }));
  };

  // ---------- F12 两步验证 ----------

  const loadTwoFAStatus = async () => {
    const res = await API.get('/api/user/2fa/status');
    const { success, data } = res.data;
    if (success) {
      setTwofaEnabled(!!data.enabled);
    }
  };

  const startTwoFASetup = async () => {
    setTwofaLoading(true);
    const res = await API.post('/api/user/2fa/setup');
    const { success, message, data } = res.data;
    if (success) {
      setTwofaSecret(data.secret);
      setTwofaOtpauthUrl(data.otpauth_url);
      setTwofaCode('');
      try {
        const qr = await QRCode.toDataURL(data.otpauth_url, { width: 200 });
        setTwofaQrUrl(qr);
      } catch (e) {
        setTwofaQrUrl('');
      }
      setShowTwoFASetupModal(true);
    } else {
      showError(message);
    }
    setTwofaLoading(false);
  };

  const confirmEnableTwoFA = async () => {
    if (!twofaCode || twofaCode.length !== 6) {
      showError(t('setting.personal.twofa.code_hint'));
      return;
    }
    setTwofaLoading(true);
    const res = await API.post('/api/user/2fa/enable', { code: twofaCode });
    const { success, message } = res.data;
    if (success) {
      showSuccess(message || t('setting.personal.twofa.enable_done'));
      setShowTwoFASetupModal(false);
      setTwofaEnabled(true);
    } else {
      showError(message);
    }
    setTwofaLoading(false);
  };

  const confirmDisableTwoFA = async () => {
    if (!twofaCode || twofaCode.length !== 6) {
      showError(t('setting.personal.twofa.code_hint'));
      return;
    }
    setTwofaLoading(true);
    const res = await API.post('/api/user/2fa/disable', { code: twofaCode });
    const { success, message } = res.data;
    if (success) {
      showSuccess(message || t('setting.personal.twofa.disable_done'));
      setShowTwoFADisableModal(false);
      setTwofaEnabled(false);
      setTwofaCode('');
    } else {
      showError(message);
    }
    setTwofaLoading(false);
  };

  return (
    <div style={{ lineHeight: '40px' }}>
      <Header as='h3'>{t('setting.personal.general.title')}</Header>
      <Message>{t('setting.personal.general.system_token_notice')}</Message>
      <Button as={Link} to={`/user/edit/`}>
        {t('setting.personal.general.buttons.update_profile')}
      </Button>
      <Button onClick={generateAccessToken}>
        {t('setting.personal.general.buttons.generate_token')}
      </Button>
      <Button onClick={getAffLink}>
        {t('setting.personal.general.buttons.copy_invite')}
      </Button>
      <Button
        onClick={() => {
          setShowAccountDeleteModal(true);
        }}
      >
        {t('setting.personal.general.buttons.delete_account')}
      </Button>

      {systemToken && (
        <Form.Input
          fluid
          readOnly
          value={systemToken}
          onClick={handleSystemTokenClick}
          style={{ marginTop: '10px' }}
        />
      )}
      {affLink && (
        <Form.Input
          fluid
          readOnly
          value={affLink}
          onClick={handleAffLinkClick}
          style={{ marginTop: '10px' }}
        />
      )}
      <Divider />
      <Header as='h3'>{t('setting.personal.binding.title')}</Header>
      {status.wechat_login && (
        <Button onClick={() => setShowWeChatBindModal(true)}>
          {t('setting.personal.binding.buttons.bind_wechat')}
        </Button>
      )}
      <Modal
        onClose={() => setShowWeChatBindModal(false)}
        onOpen={() => setShowWeChatBindModal(true)}
        open={showWeChatBindModal}
        size={'mini'}
      >
        <Modal.Content>
          <Modal.Description>
            <Image src={status.wechat_qrcode} fluid />
            <div style={{ textAlign: 'center' }}>
              <p>{t('setting.personal.binding.wechat.description')}</p>
            </div>
            <Form size='large'>
              <Form.Input
                fluid
                placeholder={t(
                  'setting.personal.binding.wechat.verification_code'
                )}
                name='wechat_verification_code'
                value={inputs.wechat_verification_code}
                onChange={handleInputChange}
              />
              <Button color='' fluid size='large' onClick={bindWeChat}>
                {t('setting.personal.binding.wechat.bind')}
              </Button>
            </Form>
          </Modal.Description>
        </Modal.Content>
      </Modal>
      {status.github_oauth && (
        <Button onClick={() => onGitHubOAuthClicked(status.github_client_id)}>
          {t('setting.personal.binding.buttons.bind_github')}
        </Button>
      )}
      {status.lark_client_id && (
        <Button onClick={() => onLarkOAuthClicked(status.lark_client_id)}>
          {t('setting.personal.binding.buttons.bind_lark')}
        </Button>
      )}
      <Button onClick={() => setShowEmailBindModal(true)}>
        {t('setting.personal.binding.buttons.bind_email')}
      </Button>
      <Modal
        onClose={() => setShowEmailBindModal(false)}
        onOpen={() => setShowEmailBindModal(true)}
        open={showEmailBindModal}
        size={'tiny'}
        style={{ maxWidth: '450px' }}
      >
        <Modal.Header>{t('setting.personal.binding.email.title')}</Modal.Header>
        <Modal.Content>
          <Modal.Description>
            <Form size='large'>
              <Form.Input
                fluid
                placeholder={t(
                  'setting.personal.binding.email.email_placeholder'
                )}
                onChange={handleInputChange}
                name='email'
                type='email'
                action={
                  <Button
                    onClick={sendVerificationCode}
                    disabled={disableButton || loading}
                  >
                    {disableButton
                      ? t('setting.personal.binding.email.get_code_retry', {
                          countdown,
                        })
                      : t('setting.personal.binding.email.get_code')}
                  </Button>
                }
              />
              <Form.Input
                fluid
                placeholder={t(
                  'setting.personal.binding.email.code_placeholder'
                )}
                name='email_verification_code'
                value={inputs.email_verification_code}
                onChange={handleInputChange}
              />
              {turnstileEnabled && (
                <Turnstile
                  sitekey={turnstileSiteKey}
                  onVerify={(token) => {
                    setTurnstileToken(token);
                  }}
                />
              )}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginTop: '1rem',
                }}
              >
                <Button
                  color=''
                  fluid
                  size='large'
                  onClick={bindEmail}
                  loading={loading}
                >
                  {t('setting.personal.binding.email.bind')}
                </Button>
                <div style={{ width: '1rem' }}></div>
                <Button
                  fluid
                  size='large'
                  onClick={() => setShowEmailBindModal(false)}
                >
                  {t('setting.personal.binding.email.cancel')}
                </Button>
              </div>
            </Form>
          </Modal.Description>
        </Modal.Content>
      </Modal>
      <Divider />
      <Header as='h3'>{t('setting.personal.notify.title')}</Header>
      <Form>
        <Form.Group widths='equal'>
          <Form.Select
            fluid
            label={t('setting.personal.notify.type')}
            name='notify_type'
            options={[
              { key: 'close', text: t('setting.personal.notify.type_close'), value: '' },
              { key: 'email', text: t('setting.personal.notify.type_email'), value: 'email' },
              { key: 'bark', text: 'Bark', value: 'bark' },
              { key: 'gotify', text: 'Gotify', value: 'gotify' },
              { key: 'webhook', text: 'Webhook', value: 'webhook' },
            ]}
            value={notifyType}
            onChange={(e, { value }) => setNotifyType(value)}
          />
          <Form.Input
            fluid
            label={t('setting.personal.notify.threshold')}
            name='quota_threshold'
            type='number'
            step='0.01'
            min='0'
            placeholder='0'
            value={quotaThreshold}
            onChange={(e, { value }) => setQuotaThreshold(value)}
          />
        </Form.Group>
        {notifyType === '' && (
          <Message info size='small'>
            {t('setting.personal.notify.threshold_tip')}
          </Message>
        )}
        {notifyType === 'email' && (
          <Message info size='small'>
            {t('setting.personal.notify.email_tip')}
          </Message>
        )}
        {notifyType === 'bark' && (
          <Form.Group widths='equal'>
            <Form.Input
              fluid
              label={t('setting.personal.notify.bark_server')}
              name='bark_server'
              placeholder='https://api.day.app'
              value={notifyInputs.bark_server}
              onChange={handleNotifyInputChange}
            />
            <Form.Input
              fluid
              label={t('setting.personal.notify.bark_device_key')}
              name='bark_device_key'
              value={notifyInputs.bark_device_key}
              onChange={handleNotifyInputChange}
            />
          </Form.Group>
        )}
        {notifyType === 'gotify' && (
          <Form.Group widths='equal'>
            <Form.Input
              fluid
              label={t('setting.personal.notify.gotify_server')}
              name='gotify_server'
              placeholder='https://gotify.example.com'
              value={notifyInputs.gotify_server}
              onChange={handleNotifyInputChange}
            />
            <Form.Input
              fluid
              label={t('setting.personal.notify.gotify_app_token')}
              name='gotify_app_token'
              value={notifyInputs.gotify_app_token}
              onChange={handleNotifyInputChange}
            />
          </Form.Group>
        )}
        {notifyType === 'webhook' && (
          <Form.Group widths='equal'>
            <Form.Input
              fluid
              label={t('setting.personal.notify.webhook_url')}
              name='webhook_url'
              placeholder='https://example.com/hook'
              value={notifyInputs.webhook_url}
              onChange={handleNotifyInputChange}
            />
            <Form.Input
              fluid
              label={t('setting.personal.notify.webhook_secret')}
              name='webhook_secret'
              value={notifyInputs.webhook_secret}
              onChange={handleNotifyInputChange}
            />
          </Form.Group>
        )}
        <Button primary onClick={saveUserSetting} loading={savingSetting}>
          {t('setting.personal.notify.save')}
        </Button>
        <Button
          onClick={testUserNotify}
          loading={testingNotify}
          disabled={notifyType === ''}
        >
          {t('setting.personal.notify.test')}
        </Button>
      </Form>
      <Divider />
      <Header as='h3'>{t('setting.personal.sessions.title')}</Header>
      {sessions.length === 0 ? (
        <Message size='small'>{t('setting.personal.sessions.empty')}</Message>
      ) : (
        <Table celled size='small'>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>{t('setting.personal.sessions.ip')}</Table.HeaderCell>
              <Table.HeaderCell>{t('setting.personal.sessions.device')}</Table.HeaderCell>
              <Table.HeaderCell>{t('setting.personal.sessions.created_at')}</Table.HeaderCell>
              <Table.HeaderCell>{t('setting.personal.sessions.last_active')}</Table.HeaderCell>
              <Table.HeaderCell></Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {sessions.map((s) => (
              <Table.Row key={s.id}>
                <Table.Cell>{s.ip}</Table.Cell>
                <Table.Cell style={{ maxWidth: '320px', overflowWrap: 'anywhere' }}>
                  {s.user_agent}
                </Table.Cell>
                <Table.Cell>{timestamp2string(s.created_at)}</Table.Cell>
                <Table.Cell>{timestamp2string(s.last_active_at)}</Table.Cell>
                <Table.Cell>
                  {s.current && (
                    <Label color='green' size='small'>
                      {t('setting.personal.sessions.current')}
                    </Label>
                  )}
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}
      <Button
        color='red'
        onClick={() => setShowLogoutOthersModal(true)}
        disabled={sessions.length <= 1}
      >
        {t('setting.personal.sessions.logout_others')}
      </Button>
      <Modal
        onClose={() => setShowLogoutOthersModal(false)}
        onOpen={() => setShowLogoutOthersModal(true)}
        open={showLogoutOthersModal}
        size={'tiny'}
        style={{ maxWidth: '450px' }}
      >
        <Modal.Header>
          {t('setting.personal.sessions.logout_confirm_title')}
        </Modal.Header>
        <Modal.Content>
          <Modal.Description>
            <p>{t('setting.personal.sessions.logout_confirm_content')}</p>
          </Modal.Description>
        </Modal.Content>
        <Modal.Actions>
          <Button onClick={() => setShowLogoutOthersModal(false)}>
            {t('setting.personal.sessions.cancel')}
          </Button>
          <Button
            color='red'
            loading={logoutOthersLoading}
            onClick={logoutOtherSessions}
          >
            {t('setting.personal.sessions.confirm')}
          </Button>
        </Modal.Actions>
      </Modal>
      <Divider />
      <Header as='h3'>{t('setting.personal.twofa.title')}</Header>
      {twofaEnabled ? (
        <>
          <Label color='green' size='small'>
            {t('setting.personal.twofa.enabled')}
          </Label>
          <Button color='red' onClick={() => { setTwofaCode(''); setShowTwoFADisableModal(true); }}>
            {t('setting.personal.twofa.disable')}
          </Button>
        </>
      ) : (
        <Button primary loading={twofaLoading} onClick={startTwoFASetup}>
          {t('setting.personal.twofa.enable')}
        </Button>
      )}
      <Modal
        onClose={() => setShowTwoFASetupModal(false)}
        open={showTwoFASetupModal}
        size={'tiny'}
        style={{ maxWidth: '450px' }}
      >
        <Modal.Header>{t('setting.personal.twofa.setup_title')}</Modal.Header>
        <Modal.Content>
          <Modal.Description>
            <p>{t('setting.personal.twofa.setup_tip')}</p>
            {twofaQrUrl && (
              <div style={{ textAlign: 'center', margin: '10px 0' }}>
                <Image src={twofaQrUrl} size='small' inline />
              </div>
            )}
            <Form.Input
              fluid
              readOnly
              value={twofaSecret}
              onClick={(e) => e.target.select()}
              label={t('setting.personal.twofa.secret')}
            />
            <Form.Input
              fluid
              label={t('setting.personal.twofa.code_label')}
              placeholder={t('setting.personal.twofa.code_placeholder')}
              value={twofaCode}
              maxLength='6'
              inputMode='numeric'
              onChange={(e, { value }) =>
                setTwofaCode(value.replace(/\D/g, '').slice(0, 6))
              }
            />
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginTop: '1rem',
              }}
            >
              <Button color='green' fluid size='large' loading={twofaLoading} onClick={confirmEnableTwoFA}>
                {t('setting.personal.twofa.confirm_enable')}
              </Button>
              <div style={{ width: '1rem' }}></div>
              <Button fluid size='large' onClick={() => setShowTwoFASetupModal(false)}>
                {t('setting.personal.twofa.cancel')}
              </Button>
            </div>
          </Modal.Description>
        </Modal.Content>
      </Modal>
      <Modal
        onClose={() => setShowTwoFADisableModal(false)}
        open={showTwoFADisableModal}
        size={'tiny'}
        style={{ maxWidth: '450px' }}
      >
        <Modal.Header>{t('setting.personal.twofa.disable_title')}</Modal.Header>
        <Modal.Content>
          <Modal.Description>
            <p>{t('setting.personal.twofa.disable_tip')}</p>
            <Form.Input
              fluid
              label={t('setting.personal.twofa.code_label')}
              placeholder={t('setting.personal.twofa.code_placeholder')}
              value={twofaCode}
              maxLength='6'
              inputMode='numeric'
              onChange={(e, { value }) =>
                setTwofaCode(value.replace(/\D/g, '').slice(0, 6))
              }
            />
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginTop: '1rem',
              }}
            >
              <Button color='red' fluid size='large' loading={twofaLoading} onClick={confirmDisableTwoFA}>
                {t('setting.personal.twofa.confirm_disable')}
              </Button>
              <div style={{ width: '1rem' }}></div>
              <Button fluid size='large' onClick={() => setShowTwoFADisableModal(false)}>
                {t('setting.personal.twofa.cancel')}
              </Button>
            </div>
          </Modal.Description>
        </Modal.Content>
      </Modal>
      <Modal
        onClose={() => setShowAccountDeleteModal(false)}
        onOpen={() => setShowAccountDeleteModal(true)}
        open={showAccountDeleteModal}
        size={'tiny'}
        style={{ maxWidth: '450px' }}
      >
        <Modal.Header>
          {t('setting.personal.delete_account.title')}
        </Modal.Header>
        <Modal.Content>
          <Message>{t('setting.personal.delete_account.warning')}</Message>
          <Modal.Description>
            <Form size='large'>
              <Form.Input
                fluid
                placeholder={t(
                  'setting.personal.delete_account.confirm_placeholder',
                  {
                    username: userState?.user?.username,
                  }
                )}
                name='self_account_deletion_confirmation'
                value={inputs.self_account_deletion_confirmation}
                onChange={handleInputChange}
              />
              {turnstileEnabled && (
                <Turnstile
                  sitekey={turnstileSiteKey}
                  onVerify={(token) => {
                    setTurnstileToken(token);
                  }}
                />
              )}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginTop: '1rem',
                }}
              >
                <Button
                  color='red'
                  fluid
                  size='large'
                  onClick={deleteAccount}
                  loading={loading}
                >
                  {t('setting.personal.delete_account.buttons.confirm')}
                </Button>
                <div style={{ width: '1rem' }}></div>
                <Button
                  fluid
                  size='large'
                  onClick={() => setShowAccountDeleteModal(false)}
                >
                  {t('setting.personal.delete_account.buttons.cancel')}
                </Button>
              </div>
            </Form>
          </Modal.Description>
        </Modal.Content>
      </Modal>
    </div>
  );
};

export default PersonalSetting;
