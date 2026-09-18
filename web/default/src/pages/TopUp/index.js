import React, { useEffect, useRef, useState } from 'react';
import { Button, Form, Icon, Label, Message, Table } from 'semantic-ui-react';
import { API, showError, showInfo, showSuccess } from '../../helpers';
import { renderQuota } from '../../helpers/render';
import { useTranslation } from 'react-i18next';
import './topup.css';

const QuotaPerUnit = 500000; // 与后端 config.QuotaPerUnit 一致（1 美元额度）

const TopUp = () => {
  const { t } = useTranslation();
  const [redemptionCode, setRedemptionCode] = useState('');
  const [topUpLink, setTopUpLink] = useState('');
  const [userQuota, setUserQuota] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [user, setUser] = useState({});
  // 在线支付（F1）
  const [payConfig, setPayConfig] = useState(null); // {enabled, amount_options, min_top_up, max_top_up, price, methods}
  const [selectedAmount, setSelectedAmount] = useState(null);
  const [customAmount, setCustomAmount] = useState('');
  const [payMethod, setPayMethod] = useState('alipay');
  const [creating, setCreating] = useState(false);
  const [waitingPaid, setWaitingPaid] = useState(false); // 轮询等待支付结果
  const [orders, setOrders] = useState([]);
  const pollTimer = useRef(null);
  // 签到（F5）
  const [checkinStatus, setCheckinStatus] = useState(null); // {enabled, checked, min_reward, max_reward}
  const [checkingIn, setCheckingIn] = useState(false);
  // 推荐计划（F4）
  const [affData, setAffData] = useState(null); // {aff_code, invite_count, total_reward}

  const topUp = async () => {
    if (redemptionCode === '') {
      showInfo(t('topup.redeem_code.empty_code'));
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await API.post('/api/user/topup', {
        key: redemptionCode,
      });
      const { success, message, data } = res.data;
      if (success) {
        showSuccess(t('topup.redeem_code.success'));
        setUserQuota((quota) => {
          return quota + data;
        });
        setRedemptionCode('');
      } else {
        showError(message);
      }
    } catch (err) {
      showError(t('topup.redeem_code.request_failed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const openTopUpLink = () => {
    if (!topUpLink) {
      showError(t('topup.redeem_code.no_link'));
      return;
    }
    let url = new URL(topUpLink);
    let username = user.username;
    let user_id = user.id;
    url.searchParams.append('username', username);
    url.searchParams.append('user_id', user_id);
    url.searchParams.append('transaction_id', crypto.randomUUID());
    window.open(url.toString(), '_blank');
  };

  const getUserQuota = async () => {
    let res = await API.get(`/api/user/self`);
    const { success, message, data } = res.data;
    if (success) {
      setUserQuota(data.quota);
      setUser(data);
    } else {
      showError(message);
    }
  };

  const loadPayConfig = async () => {
    try {
      const res = await API.get('/api/user/pay/config');
      const { success, data } = res.data;
      if (success && data && data.enabled) {
        setPayConfig(data);
        if (Array.isArray(data.amount_options) && data.amount_options.length > 0) {
          setSelectedAmount(data.amount_options[0]);
        }
        loadOrders();
      }
    } catch (err) {
      // 支付接口不可用时静默降级为外跳/兑换码模式
    }
  };

  const loadOrders = async () => {
    try {
      const res = await API.get('/api/user/orders');
      const { success, data } = res.data;
      if (success && Array.isArray(data)) {
        setOrders(data);
      }
    } catch (err) {
      // 静默
    }
  };

  const loadCheckinStatus = async () => {
    try {
      const res = await API.get('/api/user/check_in/status');
      const { success, data } = res.data;
      if (success) {
        setCheckinStatus(data);
      }
    } catch (err) {
      // 签到接口不可用时隐藏卡片
    }
  };

  const doCheckIn = async () => {
    if (!checkinStatus || !checkinStatus.enabled || checkingIn) return;
    setCheckingIn(true);
    try {
      const res = await API.post('/api/user/check_in');
      const { success, message, data } = res.data;
      if (success) {
        showSuccess(t('topup.checkin.success', { quota: renderQuota(data.reward, t) }));
        setUserQuota((q) => q + data.reward);
        setCheckinStatus((s) => ({ ...s, checked: true }));
      } else {
        showInfo(message);
        if (message && message.includes('已签到')) {
          setCheckinStatus((s) => ({ ...s, checked: true }));
        }
      }
    } catch (err) {
      showError(t('topup.redeem_code.request_failed'));
    } finally {
      setCheckingIn(false);
    }
  };

  const loadAff = async () => {
    try {
      const res = await API.get('/api/user/aff');
      const { success, data } = res.data;
      if (success) {
        setAffData(data);
      }
    } catch (err) {
      // 静默
    }
  };

  const copyAffLink = async () => {
    if (!affData || !affData.aff_code) return;
    const link = `${window.location.origin}/register?aff=${affData.aff_code}`;
    try {
      await navigator.clipboard.writeText(link);
      showSuccess(t('topup.aff.copied'));
    } catch (err) {
      // 回退方案
      const ta = document.createElement('textarea');
      ta.value = link;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); showSuccess(t('topup.aff.copied')); } catch (e) { showError(t('topup.redeem_code.paste_error')); }
      document.body.removeChild(ta);
    }
  };

  const stopPolling = () => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
    setWaitingPaid(false);
  };

  const pollOrderStatus = (tradeNo) => {
    stopPolling();
    setWaitingPaid(true);
    let count = 0;
    pollTimer.current = setInterval(async () => {
      count += 1;
      if (count > 60) {
        // 轮询 3 分钟未支付，停止并提示
        stopPolling();
        showInfo(t('topup.pay.poll_timeout'));
        return;
      }
      try {
        const res = await API.get(`/api/user/pay/status?trade_no=${tradeNo}`);
        const { success, data } = res.data;
        if (success && data && data.status === 1) {
          stopPolling();
          showSuccess(t('topup.pay.success'));
          getUserQuota();
          loadOrders();
        }
      } catch (err) {
        // 单次轮询失败忽略，继续下一轮
      }
    }, 3000);
  };

  const startPay = async () => {
    const amount =
      selectedAmount !== null
        ? Number(selectedAmount)
        : Number(customAmount);
    if (!amount || Number.isNaN(amount) || amount <= 0) {
      showInfo(t('topup.pay.empty_amount'));
      return;
    }
    setCreating(true);
    try {
      const res = await API.post('/api/user/pay/create', {
        amount: amount,
        method: payMethod,
      });
      const { success, message, data } = res.data;
      if (success) {
        window.open(data.pay_url, '_blank');
        pollOrderStatus(data.trade_no);
      } else {
        showError(message);
      }
    } catch (err) {
      showError(t('topup.pay.create_failed'));
    } finally {
      setCreating(false);
    }
  };

  const renderOrderStatus = (status) => {
    if (status === 1) {
      return (
        <Label color='green' size='small'>
          {t('topup.orders.status_paid')}
        </Label>
      );
    }
    if (status === 2) {
      return (
        <Label basic size='small'>
          {t('topup.orders.status_expired')}
        </Label>
      );
    }
    return (
      <Label color='yellow' size='small'>
        {t('topup.orders.status_pending')}
      </Label>
    );
  };

  useEffect(() => {
    let status = localStorage.getItem('status');
    if (status) {
      status = JSON.parse(status);
      if (status.top_up_link) {
        setTopUpLink(status.top_up_link);
      }
    }
    getUserQuota().then();
    loadPayConfig().then();
    loadCheckinStatus().then();
    loadAff().then();
    return () => {
      // 组件卸载时停止轮询，避免资源泄漏
      if (pollTimer.current) {
        clearInterval(pollTimer.current);
        pollTimer.current = null;
      }
    };
  }, []);

  const payEnabled = payConfig && payConfig.enabled;
  const quotaPreview =
    payConfig && payConfig.price > 0
      ? Math.floor((getAmount() / payConfig.price) * QuotaPerUnit)
      : 0;

  function getAmount() {
    return selectedAmount !== null ? Number(selectedAmount) : Number(customAmount || 0);
  }

  return (
    <div className='topup-page'>
      {/* 余额卡 */}
      <div className='topup-hero'>
        <div className='topup-hero-info'>
          <div className='topup-hero-label'>
            <Icon name='wallet' />
            {t('topup.balance.label')}
          </div>
          <div className='topup-hero-number'>{renderQuota(userQuota, t)}</div>
          <div className='topup-hero-tip'>{t('topup.balance.tip')}</div>
        </div>
        {!payEnabled && (
          <Button
            primary
            size='large'
            className='topup-hero-btn'
            onClick={openTopUpLink}
            disabled={!topUpLink}
          >
            <Icon name='credit card' />
            {t('topup.balance.recharge')}
          </Button>
        )}
      </div>

      {/* 签到卡 + 推荐计划卡（F5 + F4） */}
      {(checkinStatus?.enabled || affData) && (
        <div className='topup-extra-row'>
          {checkinStatus && checkinStatus.enabled && (
            <div className='topup-extra-card topup-checkin-card'>
              <div className='topup-extra-title'>
                <Icon name='calendar check outline' />
                {t('topup.checkin.title')}
              </div>
              <div className='topup-extra-tip'>
                {t('topup.checkin.reward_range', {
                  min: renderQuota(checkinStatus.min_reward, t),
                  max: renderQuota(checkinStatus.max_reward, t),
                })}
              </div>
              <Button
                color='green'
                fluid
                disabled={checkinStatus.checked}
                loading={checkingIn}
                onClick={doCheckIn}
              >
                {checkinStatus.checked ? t('topup.checkin.checked') : t('topup.checkin.button')}
              </Button>
            </div>
          )}
          {affData && (
            <div className='topup-extra-card topup-aff-card'>
              <div className='topup-extra-title'>
                <Icon name='share alternate' />
                {t('topup.aff.title')}
              </div>
              <div className='topup-extra-tip'>{t('topup.aff.subtitle')}</div>
              <div className='topup-aff-stats'>
                <div className='topup-aff-stat'>
                  <div className='topup-aff-num'>{affData.invite_count || 0}</div>
                  <div className='topup-aff-label'>{t('topup.aff.invite_count')}</div>
                </div>
                <div className='topup-aff-stat'>
                  <div className='topup-aff-num'>{renderQuota(affData.total_reward || 0, t)}</div>
                  <div className='topup-aff-label'>{t('topup.aff.total_reward')}</div>
                </div>
              </div>
              <Button primary fluid onClick={copyAffLink}>
                <Icon name='copy outline' />
                {t('topup.aff.copy')}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* 在线支付区（PayEnabled 时替换套餐外跳槽位） */}
      {payEnabled ? (
        <div className='topup-pay'>
          <div className='topup-section-title'>{t('topup.pay.title')}</div>
          <div className='topup-section-sub'>{t('topup.pay.subtitle')}</div>
          <div className='pay-amount-chips'>
            {(payConfig.amount_options || []).map((opt) => (
              <div
                key={opt}
                className={'pay-chip' + (Number(selectedAmount) === Number(opt) ? ' active' : '')}
                onClick={() => setSelectedAmount(opt)}
              >
                <span className='pay-chip-currency'>¥</span>
                {opt}
              </div>
            ))}
            <div
              className={'pay-chip pay-chip-custom' + (selectedAmount === null ? ' active' : '')}
              onClick={() => setSelectedAmount(null)}
            >
              <span className='pay-chip-currency'>¥</span>
              <input
                className='pay-custom-input'
                type='number'
                min={payConfig.min_top_up}
                max={payConfig.max_top_up}
                step='0.01'
                placeholder={t('topup.pay.custom_placeholder')}
                value={customAmount}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedAmount(null);
                }}
                onChange={(e) => setCustomAmount(e.target.value)}
              />
            </div>
          </div>
          <div className='pay-method-row'>
            <Button.Group basic>
              <Button active={payMethod === 'alipay'} onClick={() => setPayMethod('alipay')}>
                {/* SUI 图标字体无 alipay 字形，使用 Simple Icons 官方单色路径，fill 跟随 currentColor */}
                <svg className='pay-brand-icon' viewBox='0 0 24 24' aria-hidden='true'>
                  <path d='M19.695 15.07c3.426 1.158 4.203 1.22 4.203 1.22V3.846c0-2.124-1.705-3.845-3.81-3.845H3.914C1.808.001.102 1.722.102 3.846v16.31c0 2.123 1.706 3.845 3.813 3.845h16.173c2.105 0 3.81-1.722 3.81-3.845v-.157s-6.19-2.602-9.315-4.119c-2.096 2.602-4.8 4.181-7.607 4.181-4.75 0-6.361-4.19-4.112-6.949.49-.602 1.324-1.175 2.617-1.497 2.025-.502 5.247.313 8.266 1.317a16.796 16.796 0 0 0 1.341-3.302H5.781v-.952h4.799V6.975H4.77v-.953h5.81V3.591s0-.409.411-.409h2.347v2.84h5.744v.951h-5.744v1.704h4.69a19.453 19.453 0 0 1-1.986 5.06c1.424.52 2.702 1.011 3.654 1.333m-13.81-2.032c-.596.06-1.71.325-2.321.869-1.83 1.608-.735 4.55 2.968 4.55 2.151 0 4.301-1.388 5.99-3.61-2.403-1.182-4.438-2.028-6.637-1.809' />
                </svg>
                {t('topup.pay.method_alipay')}
              </Button>
              <Button active={payMethod === 'wxpay'} onClick={() => setPayMethod('wxpay')}>
                <Icon name='wechat' />
                {t('topup.pay.method_wxpay')}
              </Button>
            </Button.Group>
            <span className='pay-quota-preview'>
              {quotaPreview > 0
                ? t('topup.pay.quota_preview', {
                    quota: renderQuota(quotaPreview, t),
                  })
                : ''}
            </span>
          </div>
          <Button
            primary
            size='large'
            className='pay-submit-btn'
            loading={creating}
            disabled={creating || waitingPaid}
            onClick={startPay}
          >
            <Icon name='credit card' />
            {t('topup.pay.submit')}
          </Button>
          {waitingPaid && (
            <Message icon info className='pay-waiting'>
              <Icon name='circle notched' loading />
              <Message.Content>{t('topup.pay.waiting')}</Message.Content>
            </Message>
          )}
        </div>
      ) : (
        <>
          {/* 套餐静态槽位（未启用在线支付时保留外跳模式） */}
          <div className='topup-section-title'>{t('topup.packages.title')}</div>
          <div className='topup-section-sub'>{t('topup.packages.subtitle')}</div>
          <div className='topup-packages'>
            {[10, 100, 500].map((amount, idx) => {
              const tier = 't' + (idx + 1);
              return (
                <div
                  key={amount}
                  className={'pkg-card' + (idx === 1 ? ' pkg-recommend' : '') + (topUpLink ? '' : ' pkg-disabled')}
                  onClick={() => {
                    if (topUpLink) openTopUpLink();
                  }}
                >
                  {idx === 1 && <span className='pkg-badge'>{t('topup.packages.recommend')}</span>}
                  <div className='pkg-amount'>
                    <span className='pkg-currency'>¥</span>
                    {amount}
                  </div>
                  <div className='pkg-name'>{t(`topup.packages.tiers.${tier}`)}</div>
                  <Button fluid className='pkg-btn' primary={idx === 1} basic={idx !== 1} disabled={!topUpLink}>
                    {topUpLink ? t('topup.packages.buy') : t('topup.packages.soon')}
                  </Button>
                </div>
              );
            })}
          </div>
          {!topUpLink && <div className='topup-soon'>{t('topup.packages.soon')}</div>}
        </>
      )}

      {/* 订单历史（启用在线支付时展示） */}
      {payEnabled && (
        <div className='topup-orders'>
          <div className='topup-redeem-title'>
            <Icon name='list ul' />
            {t('topup.orders.title')}
          </div>
          <Table basic='very' className='orders-table'>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>{t('topup.orders.time')}</Table.HeaderCell>
                <Table.HeaderCell>{t('topup.orders.amount')}</Table.HeaderCell>
                <Table.HeaderCell>{t('topup.orders.quota')}</Table.HeaderCell>
                <Table.HeaderCell>{t('topup.orders.method')}</Table.HeaderCell>
                <Table.HeaderCell>{t('topup.orders.status')}</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {orders.length === 0 ? (
                <Table.Row>
                  <Table.Cell colSpan={5} className='orders-empty'>
                    {t('topup.orders.empty')}
                  </Table.Cell>
                </Table.Row>
              ) : (
                orders.map((order) => (
                  <Table.Row key={order.id}>
                    <Table.Cell className='orders-time'>
                      {new Date(order.created_at * 1000).toLocaleString()}
                    </Table.Cell>
                    <Table.Cell>¥{Number(order.amount).toFixed(2)}</Table.Cell>
                    <Table.Cell>{renderQuota(order.quota, t)}</Table.Cell>
                    <Table.Cell>
                      {order.payment_method === 'alipay'
                        ? t('topup.pay.method_alipay')
                        : t('topup.pay.method_wxpay')}
                    </Table.Cell>
                    <Table.Cell>{renderOrderStatus(order.status)}</Table.Cell>
                  </Table.Row>
                ))
              )}
            </Table.Body>
          </Table>
        </div>
      )}

      {/* 兑换码核销（逻辑不变） */}
      <div className='topup-redeem'>
        <div className='topup-redeem-title'>
          <Icon name='ticket alternate' />
          {t('topup.redeem_code.title')}
        </div>
        <Form.Input
          fluid
          icon='key'
          iconPosition='left'
          placeholder={t('topup.redeem_code.placeholder')}
          value={redemptionCode}
          onChange={(e) => {
            setRedemptionCode(e.target.value);
          }}
          onPaste={(e) => {
            e.preventDefault();
            const pastedText = e.clipboardData.getData('text');
            setRedemptionCode(pastedText.trim());
          }}
          action={
            <Button
              icon='paste'
              content={t('topup.redeem_code.paste')}
              onClick={async () => {
                try {
                  const text = await navigator.clipboard.readText();
                  setRedemptionCode(text.trim());
                } catch (err) {
                  showError(t('topup.redeem_code.paste_error'));
                }
              }}
            />
          }
        />
        <Button
          color='green'
          fluid
          size='large'
          onClick={topUp}
          loading={isSubmitting}
          disabled={isSubmitting}
        >
          {isSubmitting
            ? t('topup.redeem_code.submitting')
            : t('topup.redeem_code.submit')}
        </Button>
      </div>
    </div>
  );
};

export default TopUp;
