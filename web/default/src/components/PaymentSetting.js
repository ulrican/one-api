import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Form, Grid, Header, Message } from 'semantic-ui-react';
import { API, showError, verifyJSON } from '../helpers';

// Task4-10：从 OperationSetting 拆出的「支付设置」独立组件
// 后端接口不变：GET/PUT /api/option/，仅前端页面归属迁移
const PaymentSetting = () => {
  const { t } = useTranslation();
  let [inputs, setInputs] = useState({
    PayEnabled: '',
    PaymentMode: 'epay',
    PayAddress: '',
    EpayId: '',
    EpaySecret: '',
    // Task4-10b：微信/支付宝商户凭证已代码内置，页面仅保留支付宝启用开关
    AlipayEnabled: 'false',
    PayPrice: 0,
    MinTopUp: 0,
    MaxTopUp: 0,
    TopupAmountOptions: '',
  });
  const [originInputs, setOriginInputs] = useState({});
  let [loading, setLoading] = useState(false);

  const getOptions = async () => {
    const res = await API.get('/api/option/');
    const { success, message, data } = res.data;
    if (success) {
      let newInputs = {};
      data.forEach((item) => {
        newInputs[item.key] = item.value;
      });
      setInputs(newInputs);
      setOriginInputs(newInputs);
    } else {
      showError(message);
    }
  };

  useEffect(() => {
    getOptions().then();
  }, []);

  const updateOption = async (key, value) => {
    setLoading(true);
    if (key.endsWith('Enabled')) {
      value = inputs[key] === 'true' ? 'false' : 'true';
    }
    const res = await API.put('/api/option/', {
      key,
      value,
    });
    const { success, message } = res.data;
    if (success) {
      setInputs((inputs) => ({ ...inputs, [key]: value }));
    } else {
      showError(message);
    }
    setLoading(false);
  };

  const handleInputChange = async (e, { name, value }) => {
    if (name.endsWith('Enabled')) {
      await updateOption(name, value);
    } else {
      setInputs((inputs) => ({ ...inputs, [name]: value }));
    }
  };

  const submitConfig = async (group) => {
    switch (group) {
      case 'pay':
        if (originInputs['PaymentMode'] !== inputs.PaymentMode) {
          await updateOption('PaymentMode', inputs.PaymentMode);
        }
        // 易支付配置（仅 epay 模式）
        if (inputs.PaymentMode !== 'direct') {
          if (originInputs['PayAddress'] !== inputs.PayAddress) {
            await updateOption('PayAddress', inputs.PayAddress);
          }
          if (originInputs['EpayId'] !== inputs.EpayId) {
            await updateOption('EpayId', inputs.EpayId);
          }
          if (inputs.EpaySecret) {
            await updateOption('EpaySecret', inputs.EpaySecret);
          }
        }
        // Task4-10b：微信/支付宝凭证代码内置，无任何凭证字段提交；
        // AlipayEnabled 为 Checkbox 即时保存，不经过 submitConfig
        if (originInputs['PayPrice'] !== inputs.PayPrice) {
          await updateOption('PayPrice', inputs.PayPrice);
        }
        if (originInputs['MinTopUp'] !== inputs.MinTopUp) {
          await updateOption('MinTopUp', inputs.MinTopUp);
        }
        if (originInputs['MaxTopUp'] !== inputs.MaxTopUp) {
          await updateOption('MaxTopUp', inputs.MaxTopUp);
        }
        if (originInputs['TopupAmountOptions'] !== inputs.TopupAmountOptions) {
          if (!verifyJSON(inputs.TopupAmountOptions)) {
            showError('充值金额预设不是合法的 JSON 字符串');
            return;
          }
          await updateOption('TopupAmountOptions', inputs.TopupAmountOptions);
        }
        break;
    }
    // 保存成功后同步已保存基线，否则同一字段二次修改（如 epay→direct 来回切换）
    // 会因与首次加载基线相同被误判为"无变化"而漏发更新
    setOriginInputs({ ...inputs });
  };

  return (
    <Grid columns={1}>
      <Grid.Column>
        <Form loading={loading}>
          <Header as='h3'>{t('setting.operation.pay.title')}</Header>
          <Form.Group inline>
            <Form.Checkbox
              checked={inputs.PayEnabled === 'true'}
              label={t('setting.operation.pay.enable')}
              name='PayEnabled'
              onChange={handleInputChange}
            />
          </Form.Group>
          {/* Task4-8 支付模式选择：易支付 / 直接到账（互斥） */}
          <Form.Group inline>
            <label style={{ marginRight: '16px', fontWeight: 600 }}>
              {t('setting.operation.pay.mode_label')}
            </label>
            <Form.Radio
              label={t('setting.operation.pay.mode_epay')}
              name='PaymentMode'
              value='epay'
              checked={inputs.PaymentMode === 'epay'}
              onChange={handleInputChange}
            />
            <Form.Radio
              label={t('setting.operation.pay.mode_direct')}
              name='PaymentMode'
              value='direct'
              checked={inputs.PaymentMode === 'direct'}
              onChange={handleInputChange}
            />
          </Form.Group>

          {/* 易支付配置（PaymentMode=epay 时显示） */}
          {inputs.PaymentMode !== 'direct' && (
            <>
              <Form.Group widths={3}>
                <Form.Input
                  label={t('setting.operation.pay.address')}
                  name='PayAddress'
                  onChange={handleInputChange}
                  autoComplete='new-password'
                  value={inputs.PayAddress}
                  type='link'
                  placeholder={t('setting.operation.pay.address_placeholder')}
                />
                <Form.Input
                  label={t('setting.operation.pay.pid')}
                  name='EpayId'
                  onChange={handleInputChange}
                  autoComplete='new-password'
                  value={inputs.EpayId}
                  placeholder={t('setting.operation.pay.pid_placeholder')}
                />
                <Form.Input
                  label={t('setting.operation.pay.secret')}
                  name='EpaySecret'
                  onChange={handleInputChange}
                  autoComplete='new-password'
                  value={inputs.EpaySecret || ''}
                  type='password'
                  placeholder={t('setting.operation.pay.secret_placeholder')}
                />
              </Form.Group>
            </>
          )}

          {/* 直接到账配置（PaymentMode=direct 时显示）：
              Task4-10b 微信/支付宝商户凭证全部代码内置，页面仅保留支付宝启用开关 */}
          {inputs.PaymentMode === 'direct' && (
            <>
              <Message info className='pay-direct-notice'>
                <Message.Header>{t('setting.operation.pay.direct_notice_title')}</Message.Header>
                <p>{t('setting.operation.pay.direct_notice_body')}</p>
              </Message>
              <Form.Group inline>
                <Form.Checkbox
                  checked={inputs.AlipayEnabled === 'true'}
                  label={t('setting.operation.pay.alipay_enable')}
                  name='AlipayEnabled'
                  onChange={handleInputChange}
                />
                <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                  {t('setting.operation.pay.alipay_enable_hint')}
                </span>
              </Form.Group>
            </>
          )}
          <Form.Group widths={4}>
            <Form.Input
              label={t('setting.operation.pay.price')}
              name='PayPrice'
              onChange={handleInputChange}
              autoComplete='new-password'
              value={inputs.PayPrice}
              type='number'
              step='0.01'
              min='0'
              placeholder={t('setting.operation.pay.price_placeholder')}
            />
            <Form.Input
              label={t('setting.operation.pay.min_topup')}
              name='MinTopUp'
              onChange={handleInputChange}
              autoComplete='new-password'
              value={inputs.MinTopUp}
              type='number'
              step='0.01'
              min='0'
            />
            <Form.Input
              label={t('setting.operation.pay.max_topup')}
              name='MaxTopUp'
              onChange={handleInputChange}
              autoComplete='new-password'
              value={inputs.MaxTopUp}
              type='number'
              step='0.01'
              min='0'
            />
            <Form.Input
              label={t('setting.operation.pay.amount_options')}
              name='TopupAmountOptions'
              onChange={handleInputChange}
              autoComplete='new-password'
              value={inputs.TopupAmountOptions}
              placeholder={t('setting.operation.pay.amount_options_placeholder')}
            />
          </Form.Group>
          <Form.Button
            onClick={() => {
              submitConfig('pay').then();
            }}
          >
            {t('setting.operation.pay.buttons.save')}
          </Form.Button>
        </Form>
      </Grid.Column>
    </Grid>
  );
};

export default PaymentSetting;
