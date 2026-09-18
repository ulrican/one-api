import React, { useEffect, useState } from 'react';
import { Button, Form } from 'semantic-ui-react';
import { useTranslation } from 'react-i18next';
import { API, showError, showInfo, showSuccess } from '../helpers';
import Turnstile from 'react-turnstile';
import AuthLayout from './AuthLayout';

const PasswordResetForm = () => {
  const { t } = useTranslation();
  const [inputs, setInputs] = useState({
    email: '',
  });
  const { email } = inputs;
  const [loading, setLoading] = useState(false);
  const [turnstileEnabled, setTurnstileEnabled] = useState(false);
  const [turnstileSiteKey, setTurnstileSiteKey] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [disableButton, setDisableButton] = useState(false);
  const [countdown, setCountdown] = useState(30);

  useEffect(() => {
    let status = localStorage.getItem('status');
    if (status) {
      status = JSON.parse(status);
      if (status.turnstile_check) {
        setTurnstileEnabled(true);
        setTurnstileSiteKey(status.turnstile_site_key);
      }
    }
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
    return () => clearInterval(countdownInterval);
  }, [disableButton, countdown]);

  function handleChange(e) {
    const { name, value } = e.target;
    setInputs((inputs) => ({ ...inputs, [name]: value }));
  }

  async function handleSubmit(e) {
    setDisableButton(true);
    if (!email) return;
    if (turnstileEnabled && turnstileToken === '') {
      showInfo('请稍后几秒重试，Turnstile 正在检查用户环境！');
      return;
    }
    setLoading(true);
    const res = await API.get(
      `/api/reset_password?email=${email}&turnstile=${turnstileToken}`
    );
    const { success, message } = res.data;
    if (success) {
      showSuccess(t('auth.reset.notice'));
      setInputs({ ...inputs, email: '' });
    } else {
      showError(message);
      setDisableButton(false);
      setCountdown(30);
    }
    setLoading(false);
  }

  return (
    <AuthLayout title={t('auth.reset.title')}>
      <Form size='large'>
        <Form.Input
          fluid
          icon='mail'
          iconPosition='left'
          placeholder={t('auth.reset.email')}
          name='email'
          value={email}
          onChange={handleChange}
          style={{ marginBottom: '1em' }}
        />
        {turnstileEnabled && (
          <div
            style={{
              marginBottom: '1em',
              display: 'flex',
              justifyContent: 'center',
            }}
          >
            <Turnstile
              sitekey={turnstileSiteKey}
              onVerify={(token) => {
                setTurnstileToken(token);
              }}
            />
          </div>
        )}
        <Button
          fluid
          primary
          size='large'
          onClick={handleSubmit}
          loading={loading}
          disabled={disableButton}
          className='auth-submit'
        >
          {disableButton
            ? t('auth.register.get_code_retry', { countdown })
            : t('auth.reset.button')}
        </Button>
      </Form>
      <p className='auth-note'>{t('auth.reset.notice')}</p>
    </AuthLayout>
  );
};

export default PasswordResetForm;
