import React, { useContext, useEffect, useState } from 'react';
import {
  Button,
  Divider,
  Form,
  Image,
  Modal,
} from 'semantic-ui-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { UserContext } from '../context/User';
import { API, showError, showInfo, showSuccess, showWarning } from '../helpers';
import { onGitHubOAuthClicked, onLarkOAuthClicked } from './utils';
import AuthLayout from './AuthLayout';
import larkIcon from '../images/lark.svg';

const LoginForm = () => {
  const { t } = useTranslation();
  const [inputs, setInputs] = useState({
    username: '',
    password: '',
    wechat_verification_code: '',
  });
  const [searchParams, setSearchParams] = useSearchParams();
  const [submitted, setSubmitted] = useState(false);
  const { username, password } = inputs;
  const [userState, userDispatch] = useContext(UserContext);
  let navigate = useNavigate();
  const [status, setStatus] = useState({});

  useEffect(() => {
    if (searchParams.get('expired')) {
      showError(t('messages.error.login_expired'));
    }
    let status = localStorage.getItem('status');
    if (status) {
      status = JSON.parse(status);
      setStatus(status);
    }
  }, []);

  const [showWeChatLoginModal, setShowWeChatLoginModal] = useState(false);

  // F12 两步验证：密码校验通过后进入验证码步骤
  const [twofa, setTwofa] = useState(null); // { token }
  const [twofaCode, setTwofaCode] = useState('');

  const onWeChatLoginClicked = () => {
    setShowWeChatLoginModal(true);
  };

  const onSubmitWeChatVerificationCode = async () => {
    const res = await API.get(
      `/api/oauth/wechat?code=${inputs.wechat_verification_code}`
    );
    const { success, message, data } = res.data;
    if (success) {
      userDispatch({ type: 'login', payload: data });
      localStorage.setItem('user', JSON.stringify(data));
      navigate('/dashboard');
      showSuccess(t('messages.success.login'));
      setShowWeChatLoginModal(false);
    } else {
      showError(message);
    }
  };

  function handleChange(e) {
    const { name, value } = e.target;
    setInputs((inputs) => ({ ...inputs, [name]: value }));
  }

  const completeLogin = (data) => {
    userDispatch({ type: 'login', payload: data });
    localStorage.setItem('user', JSON.stringify(data));
    if (data.username === 'root' && inputs.password === '123456') {
      navigate('/user/edit');
      showSuccess(t('messages.success.login'));
      showWarning(t('messages.error.root_password'));
    } else {
      navigate('/dashboard');
      showSuccess(t('messages.success.login'));
    }
  };

  async function handleSubmit(e) {
    setSubmitted(true);
    if (username && password) {
      const res = await API.post(`/api/user/login`, {
        username,
        password,
      });
      const { success, message, data } = res.data;
      if (success) {
        if (data && data.need_2fa) {
          // F12：需要两步验证，切换到验证码输入视图
          setTwofa({ token: data.twofa_token });
          setTwofaCode('');
          showInfo(t('login.twofa.required'));
          return;
        }
        completeLogin(data);
      } else {
        showError(message);
      }
    }
  }

  async function handleSubmit2FA() {
    if (!twofaCode || twofaCode.length !== 6) {
      showError(t('login.twofa.code_hint'));
      return;
    }
    const res = await API.post(`/api/user/login/2fa`, {
      twofa_token: twofa.token,
      code: twofaCode,
    });
    const { success, message, data } = res.data;
    if (success) {
      setTwofa(null);
      completeLogin(data);
    } else {
      showError(message);
    }
  }

  return (
    <AuthLayout title={t('auth.login.title')}>
      <Form size='large'>
        {twofa ? (
          <>
            <Form.Input
              fluid
              icon='shield'
              iconPosition='left'
              placeholder={t('login.twofa.code_placeholder')}
              name='twofa_code'
              value={twofaCode}
              maxLength='6'
              inputMode='numeric'
              onChange={(e) =>
                setTwofaCode(e.target.value.replace(/\D/g, '').slice(0, 6))
              }
              style={{ marginBottom: '1em' }}
            />
            <Button
              fluid
              primary
              size='large'
              className='auth-submit'
              onClick={handleSubmit2FA}
            >
              {t('login.twofa.verify')}
            </Button>
            <Button
              fluid
              basic
              size='large'
              style={{ marginTop: '0.8em' }}
              onClick={() => {
                setTwofa(null);
                setTwofaCode('');
              }}
            >
              {t('login.twofa.back')}
            </Button>
          </>
        ) : (
          <>
            <Form.Input
              fluid
              icon='user'
              iconPosition='left'
              placeholder={t('auth.login.username')}
              name='username'
              value={username}
              onChange={handleChange}
              style={{ marginBottom: '1em' }}
            />
            <Form.Input
              fluid
              icon='lock'
              iconPosition='left'
              placeholder={t('auth.login.password')}
              name='password'
              type='password'
              value={password}
              onChange={handleChange}
              style={{ marginBottom: '1.5em' }}
            />
            <Button
              fluid
              primary
              size='large'
              className='auth-submit'
              onClick={handleSubmit}
            >
              {t('auth.login.button')}
            </Button>
          </>
        )}
      </Form>

      <div className='auth-links' style={{ marginBottom: '0.5em' }}>
        <span>
          {t('auth.login.forgot_password')}
          <Link to='/reset' style={{ marginLeft: '2px' }}>
            {t('auth.login.reset_password')}
          </Link>
        </span>
        <span>
          {t('auth.login.no_account')}
          <Link to='/register' style={{ marginLeft: '2px' }}>
            {t('auth.login.register')}
          </Link>
        </span>
      </div>

      {(status.github_oauth ||
        status.wechat_login ||
        status.lark_client_id) && (
        <>
          <Divider
            horizontal
            style={{ color: 'var(--text-tertiary)', fontSize: '0.9em' }}
          >
            {t('auth.login.other_methods')}
          </Divider>
          <div className='auth-oauth'>
            {status.github_oauth && (
              <Button
                circular
                icon='github'
                className='auth-oauth-btn'
                onClick={() => onGitHubOAuthClicked(status.github_client_id)}
              />
            )}
            {status.wechat_login && (
              <Button
                circular
                icon='wechat'
                className='auth-oauth-btn'
                onClick={onWeChatLoginClicked}
              />
            )}
            {status.lark_client_id && (
              <div
                className='auth-oauth-btn'
                onClick={() => onLarkOAuthClicked(status.lark_client_id)}
              >
                <Image src={larkIcon} avatar style={{ cursor: 'pointer' }} />
              </div>
            )}
          </div>
        </>
      )}

      <Modal
        onClose={() => setShowWeChatLoginModal(false)}
        onOpen={() => setShowWeChatLoginModal(true)}
        open={showWeChatLoginModal}
        size={'mini'}
      >
        <Modal.Content>
          <Modal.Description>
            <Image src={status.wechat_qrcode} fluid />
            <div style={{ textAlign: 'center' }}>
              <p>{t('auth.login.wechat.scan_tip')}</p>
            </div>
            <Form size='large'>
              <Form.Input
                fluid
                placeholder={t('auth.login.wechat.code_placeholder')}
                name='wechat_verification_code'
                value={inputs.wechat_verification_code}
                onChange={handleChange}
              />
              <Button
                fluid
                primary
                size='large'
                className='auth-submit'
                onClick={onSubmitWeChatVerificationCode}
              >
                {t('auth.login.button')}
              </Button>
            </Form>
          </Modal.Description>
        </Modal.Content>
      </Modal>
    </AuthLayout>
  );
};

export default LoginForm;
