import React, { useEffect, useRef, useState } from 'react';
import { Button, Form, Icon, Label, Message, Modal, Popup, Table } from 'semantic-ui-react';
import QRCode from 'qrcode';
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
  const [qrPay, setQrPay] = useState(null); // 直连模式微信扫码：{img, amount, trade_no}
  const [orders, setOrders] = useState([]);
  // 兑换码充值记录（Task4-4）
  const [redeemRecords, setRedeemRecords] = useState([]);
  const [redeemTotal, setRedeemTotal] = useState(0);
  const [redeemPage, setRedeemPage] = useState(0);
  const redeemPageSize = 10;
  const pollTimer = useRef(null);
  // 签到（F5）
  const [checkinStatus, setCheckinStatus] = useState(null); // {enabled, checked, min_reward, max_reward}
  const [checkingIn, setCheckingIn] = useState(false);
  // 推荐计划（F4）
  const [affData, setAffData] = useState(null); // {aff_code, invite_count, total_reward}
  // Task4-11 套餐自助升级
  const [vipPackages, setVipPackages] = useState([]);
  const [myPackages, setMyPackages] = useState([]);
  const [buyingId, setBuyingId] = useState(0);

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
      // 成功/失败均会产生记录，刷新列表并回到首页
      loadRedemptionRecords(0).then();
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
        // Task4-10b：支付方式由后端按模式/开关下发（直连默认仅微信，开启支付宝后含支付宝）
        if (Array.isArray(data.methods) && data.methods.length > 0) {
          setPayMethod((prev) =>
            data.methods.includes(prev) ? prev : data.methods[0],
          );
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

  // Task4-4：兑换码充值记录（成功/失败流水）
  const loadRedemptionRecords = async (page = redeemPage) => {
    try {
      const res = await API.get('/api/user/topup/records', {
        params: { p: page, page_size: redeemPageSize },
      });
      const { success, data, total } = res.data;
      if (success) {
        setRedeemRecords(Array.isArray(data) ? data : []);
        setRedeemTotal(total || 0);
        setRedeemPage(page);
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
        let msg = t('topup.checkin.success', { quota: renderQuota(data.total_reward, t) });
        if (data.tier_hit > 0) {
          msg += t('topup.checkin.tier_bonus', {
            days: data.tier_hit,
            quota: renderQuota(data.tier_reward, t),
          });
        }
        showSuccess(msg);
        setUserQuota((q) => q + data.total_reward);
        // 刷新签到日历
        loadCheckinStatus().then();
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

  // Task4-11 套餐自助升级：套餐列表 + 本人有效套餐
  const loadPackages = async () => {
    try {
      const res = await API.get('/api/package/available');
      const { success, data } = res.data;
      if (success && Array.isArray(data)) {
        setVipPackages(data);
      }
    } catch (err) {
      // 静默：无套餐时隐藏升级区
    }
  };

  const loadMyPackages = async () => {
    try {
      const res = await API.get('/api/package/my');
      const { success, data } = res.data;
      if (success && Array.isArray(data)) {
        setMyPackages(data);
      }
    } catch (err) {
      // 静默
    }
  };

  // 购买套餐：创建套餐订单后走与充值一致的支付交互（扫码/收银台）+ 轮询
  const startPackagePay = async (pkg) => {
    setBuyingId(pkg.id);
    try {
      const res = await API.post('/api/package/purchase', {
        package_id: pkg.id,
        method: payMethod,
      });
      const { success, message, data } = res.data;
      if (success) {
        if (data.pay_type === 'qrcode' && data.code_url) {
          try {
            const img = await QRCode.toDataURL(data.code_url, { width: 220, margin: 1 });
            setQrPay({ img, amount: data.amount, trade_no: data.trade_no, method: payMethod });
          } catch (e) {
            showError(t('topup.pay.qr_failed'));
          }
        } else if (data.pay_url) {
          window.open(data.pay_url, '_blank');
        }
        pollOrderStatus(data.trade_no);
      } else {
        showError(message);
      }
    } catch (err) {
      showError(t('topup.pay.create_failed'));
    } finally {
      setBuyingId(0);
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

  // 关闭微信扫码弹窗：停止轮询与弹窗状态
  const closeQrPay = () => {
    stopPolling();
    setQrPay(null);
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
          setQrPay(null); // 支付成功，关闭扫码弹窗
          showSuccess(t('topup.pay.success'));
          getUserQuota();
          loadOrders();
          loadMyPackages(); // Task4-11 套餐单支付成功后刷新身份
        } else if (success && data && data.status === 2) {
          // 订单已超时/支付平台已关闭（终态不可能再支付），停止轮询并提示重新下单
          stopPolling();
          setQrPay(null);
          showInfo(t('topup.pay.poll_timeout'));
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
        if (data.pay_type === 'qrcode' && data.code_url) {
          // 直连模式：微信 Native / 支付宝当面付订单码，统一渲染扫码二维码弹窗
          try {
            const img = await QRCode.toDataURL(data.code_url, { width: 220, margin: 1 });
            setQrPay({ img, amount: data.amount, trade_no: data.trade_no, method: payMethod });
          } catch (e) {
            showError(t('topup.pay.qr_failed'));
          }
        } else if (data.pay_url) {
          // 易支付：跳转支付网关
          window.open(data.pay_url, '_blank');
        }
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
    loadRedemptionRecords(0).then();
    loadPackages().then(); // Task4-11 套餐列表
    loadMyPackages().then();
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
      {/* 顶部两栏：左=余额+推荐计划，右=每日签到日历 */}
      <div className={checkinStatus?.enabled ? 'topup-top-grid' : 'topup-top-grid solo'}>
      <div className='topup-top-left'>
      {/* 余额卡 */}
      <div className='topup-hero'>
        <div className='topup-hero-info'>
          <div className='topup-hero-label'>
            <Icon name='money bill alternate' />
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
      {checkinStatus && checkinStatus.enabled && (
        <div className='topup-extra-card topup-checkin-card'>
              <div className='topup-checkin-header'>
                <div className='topup-extra-title'>
                  <Icon name='calendar check outline' />
                  {t('topup.checkin.title')}
                </div>
                <div className='topup-checkin-right'>
                <div className='topup-checkin-stats'>
                  <span className='topup-checkin-stat'>
                    {t('topup.checkin.continuous', { days: checkinStatus.continuous_days || 0 })}
                  </span>
                  <span className='topup-checkin-stat'>
                    {t('topup.checkin.month_total', { days: checkinStatus.month_total || 0 })}
                  </span>
                  <span className='topup-checkin-stat topup-checkin-stat-reward'>
                    {t('topup.checkin.month_reward', { quota: renderQuota(checkinStatus.month_reward || 0, t) })}
                  </span>
                  <Popup
                    trigger={
                      <span className='topup-tier-info'>
                        <Icon name='question circle outline' />
                      </span>
                    }
                    on='hover'
                    position='bottom right'
                  >
                  <div className='topup-tier-pop'>
                    <div className='topup-tier-pop-title'>
                      {t('topup.checkin.tiers_title')} · {checkinStatus.year_month}
                    </div>
                    {(checkinStatus.tiers || []).map((tier) => (
                      <div
                        key={tier.days}
                        className={'topup-tier-pop-row' + (tier.earned ? ' earned' : '')}
                      >
                        <span>
                          {t('topup.checkin.tier_tooltip', {
                            days: tier.days,
                            quota: renderQuota(tier.quota, t),
                          })}
                        </span>
                        {tier.earned && <Icon name='check circle' color='green' />}
                      </div>
                    ))}
                  </div>
                </Popup>
                </div>
                <Button
                  color='green'
                  className='topup-checkin-btn'
                  disabled={checkinStatus.checked}
                  loading={checkingIn}
                  onClick={doCheckIn}
                >
                  {checkinStatus.checked ? t('topup.checkin.checked') : t('topup.checkin.button')}
                </Button>
                </div>
              </div>

              {/* 日历网格 */}
              <div className='topup-calendar'>
                <div className='topup-calendar-weekdays'>
                  {['一', '二', '三', '四', '五', '六', '日'].map((w) => (
                    <div key={w} className='topup-calendar-wd'>{w}</div>
                  ))}
                </div>
                <div className='topup-calendar-grid'>
                  {(() => {
                    const ym = checkinStatus.year_month;
                    const firstDay = new Date(ym + '-01');
                    const offset = (firstDay.getDay() + 6) % 7; // 周一为 0
                    const blanks = [];
                    for (let i = 0; i < offset; i++) blanks.push(i);
                    return (
                      <>
                        {blanks.map((i) => (
                          <div key={'b' + i} className='topup-cal-cell blank' />
                        ))}
                        {(checkinStatus.calendar || []).map((d) => (
                          <div
                            key={d.date}
                            className={
                              'topup-cal-cell' +
                              (d.checked ? ' checked' : '') +
                              (d.is_today ? ' today' : '') +
                              (d.is_future ? ' future' : '') +
                              (d.tier_hit > 0 ? ' tier' : '')
                            }
                            title={
                              d.checked
                                ? t('topup.checkin.cell_checked', {
                                    date: d.date,
                                    quota: renderQuota(d.reward, t),
                                  })
                                : d.date
                            }
                          >
                            <span className='topup-cal-day'>{d.day}</span>
                            {d.checked && <Icon name='check' className='topup-cal-check' />}
                            {d.tier_hit > 0 && <span className='topup-cal-tier-badge'>{d.tier_hit}</span>}
                          </div>
                        ))}
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}
        </div>

      {/* Task4-11 套餐自助升级（payEnabled 且存在上架套餐时显示） */}
      {payEnabled && vipPackages.length > 0 && (
        <div className='topup-pay-card'>
          <div className='topup-section-title'>{t('topup.vip.title')}</div>
          <div className='topup-section-sub'>{t('topup.vip.subtitle')}</div>
          {myPackages.length > 0 && (
            <div
              style={{
                marginBottom: 12,
                display: 'flex',
                gap: 8,
                flexWrap: 'wrap',
              }}
            >
              {myPackages.map((p) => (
                <Label key={p.id} color='purple' size='small'>
                  {t('topup.vip.current_badge', {
                    group: p.group_name,
                    date:
                      p.expire_at > 0
                        ? new Date(p.expire_at * 1000).toLocaleDateString()
                        : t('topup.vip.permanent'),
                  })}
                </Label>
              ))}
            </div>
          )}
          <div className='topup-packages'>
            {vipPackages.map((pkg) => (
              <div key={pkg.id} className='pkg-card'>
                <div className='pkg-amount'>
                  <span className='pkg-currency'>¥</span>
                  {Number(pkg.price).toFixed(2)}
                </div>
                <div className='pkg-name'>{pkg.name}</div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    justifyContent: 'center',
                    margin: '6px 0',
                  }}
                >
                  <Label size='mini' color='blue'>
                    {pkg.group_name}
                  </Label>
                  <span
                    style={{
                      fontSize: 12,
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {pkg.duration_days === 0
                      ? t('topup.vip.permanent')
                      : t('topup.vip.duration', { days: pkg.duration_days })}
                  </span>
                </div>
                {pkg.description && (
                  <div
                    style={{
                      fontSize: 12,
                      color: 'var(--text-secondary)',
                      margin: '6px 0',
                    }}
                  >
                    {pkg.description}
                  </div>
                )}
                <Button
                  fluid
                  primary
                  loading={buyingId === pkg.id}
                  disabled={buyingId !== 0}
                  onClick={() => startPackagePay(pkg)}
                >
                  {t('topup.vip.buy')}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 在线充值 + 充值记录：同一卡片模块（PayEnabled 时替换套餐外跳槽位） */}
      {payEnabled ? (
        <div className='topup-pay-card'>
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
              {/* Task4-10b：支付方式按后端 methods 渲染（直连默认仅微信，开启支付宝后两项都显示） */}
              {(!payConfig.methods || payConfig.methods.includes('alipay')) && (
                <Button active={payMethod === 'alipay'} onClick={() => setPayMethod('alipay')}>
                  {/* SUI 图标字体无 alipay 字形，使用 Simple Icons 官方单色路径，fill 跟随 currentColor */}
                  <svg className='pay-brand-icon' viewBox='0 0 24 24' aria-hidden='true'>
                    <path d='M19.695 15.07c3.426 1.158 4.203 1.22 4.203 1.22V3.846c0-2.124-1.705-3.845-3.81-3.845H3.914C1.808.001.102 1.722.102 3.846v16.31c0 2.123 1.706 3.845 3.813 3.845h16.173c2.105 0 3.81-1.722 3.81-3.845v-.157s-6.19-2.602-9.315-4.119c-2.096 2.602-4.8 4.181-7.607 4.181-4.75 0-6.361-4.19-4.112-6.949.49-.602 1.324-1.175 2.617-1.497 2.025-.502 5.247.313 8.266 1.317a16.796 16.796 0 0 0 1.341-3.302H5.781v-.952h4.799V6.975H4.77v-.953h5.81V3.591s0-.409.411-.409h2.347v2.84h5.744v.951h-5.744v1.704h4.69a19.453 19.453 0 0 1-1.986 5.06c1.424.52 2.702 1.011 3.654 1.333m-13.81-2.032c-.596.06-1.71.325-2.321.869-1.83 1.608-.735 4.55 2.968 4.55 2.151 0 4.301-1.388 5.99-3.61-2.403-1.182-4.438-2.028-6.637-1.809' />
                  </svg>
                  {t('topup.pay.method_alipay')}
                </Button>
              )}
              {(!payConfig.methods || payConfig.methods.includes('wxpay')) && (
                <Button active={payMethod === 'wxpay'} onClick={() => setPayMethod('wxpay')}>
                  <Icon name='wechat' />
                  {t('topup.pay.method_wxpay')}
                </Button>
              )}
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

        {/* 充值记录：与在线充值同卡片，分隔线区分 */}
        <div className='topup-orders-section'>
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
                    <Table.Cell>
                      {order.package_id > 0 ? (
                        <Label size='small' color='purple'>
                          {t('topup.vip.order_label')}
                        </Label>
                      ) : (
                        renderQuota(order.quota, t)
                      )}
                    </Table.Cell>
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

        {/* Task4-4：兑换码充值记录（与核销同卡片，分隔线区分） */}
        <div className='topup-orders-section'>
          <div className='topup-redeem-title'>
            <Icon name='list ul' />
            {t('topup.redeem_records.title')}
          </div>
          <Table basic='very' className='orders-table'>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>{t('topup.redeem_records.time')}</Table.HeaderCell>
                <Table.HeaderCell>{t('topup.redeem_records.name')}</Table.HeaderCell>
                <Table.HeaderCell>{t('topup.redeem_records.quota')}</Table.HeaderCell>
                <Table.HeaderCell>{t('topup.redeem_records.amount')}</Table.HeaderCell>
                <Table.HeaderCell>{t('topup.redeem_records.status')}</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {redeemRecords.length === 0 ? (
                <Table.Row>
                  <Table.Cell colSpan={5} className='orders-empty'>
                    {t('topup.redeem_records.empty')}
                  </Table.Cell>
                </Table.Row>
              ) : (
                redeemRecords.map((r) => (
                  <Table.Row key={r.id}>
                    <Table.Cell className='orders-time'>
                      {new Date(r.created_time * 1000).toLocaleString()}
                    </Table.Cell>
                    <Table.Cell>
                      {r.name || '-'}
                      {r.status === 2 && r.remark ? (
                        <div
                          style={{
                            fontSize: 11,
                            color: 'var(--text-secondary)',
                          }}
                        >
                          {r.remark}
                        </div>
                      ) : null}
                    </Table.Cell>
                    <Table.Cell>
                      {r.status === 1 ? renderQuota(r.quota, t) : '-'}
                    </Table.Cell>
                    <Table.Cell>
                      {r.status === 1 && r.amount > 0
                        ? `¥${Number(r.amount).toFixed(2)}`
                        : '-'}
                    </Table.Cell>
                    <Table.Cell>
                      {r.status === 1 ? (
                        <Label color='green' size='mini'>
                          {t('topup.redeem_records.status_success')}
                        </Label>
                      ) : (
                        <Label color='grey' size='mini'>
                          {t('topup.redeem_records.status_failed')}
                        </Label>
                      )}
                    </Table.Cell>
                  </Table.Row>
                ))
              )}
            </Table.Body>
          </Table>
          {redeemTotal > redeemPageSize && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: 4,
              }}
            >
              <Button
                size='mini'
                disabled={redeemPage === 0}
                onClick={() => loadRedemptionRecords(redeemPage - 1).then()}
              >
                {t('topup.redeem_records.prev')}
              </Button>
              <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                {t('topup.redeem_records.page_info', {
                  current: redeemPage + 1,
                  total: Math.ceil(redeemTotal / redeemPageSize),
                })}
              </span>
              <Button
                size='mini'
                disabled={(redeemPage + 1) * redeemPageSize >= redeemTotal}
                onClick={() => loadRedemptionRecords(redeemPage + 1).then()}
              >
                {t('topup.redeem_records.next')}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* 直连模式扫码支付弹窗：微信 Native / 支付宝当面付订单码 */}
      <Modal
        open={!!qrPay}
        onClose={closeQrPay}
        size='mini'
        centered={false}
        closeIcon
        className='pay-qr-modal'
      >
        <Modal.Header>
          {qrPay && qrPay.method === 'alipay'
            ? t('topup.pay.scan_title_alipay')
            : t('topup.pay.scan_title')}
        </Modal.Header>
        <Modal.Content style={{ textAlign: 'center' }}>
          {qrPay && (
            <>
              <div className='pay-qr-amount'>¥{Number(qrPay.amount).toFixed(2)}</div>
              <div className='pay-qr-tip'>
                {qrPay.method === 'alipay'
                  ? t('topup.pay.scan_tip_alipay')
                  : t('topup.pay.scan_tip')}
              </div>
              <img
                src={qrPay.img}
                alt={qrPay.method === 'alipay' ? 'Alipay QR' : 'WeChat Pay QR'}
                className='pay-qr-img'
              />
              <Message icon info className='pay-waiting'>
                <Icon name='circle notched' loading />
                <Message.Content>{t('topup.pay.scan_waiting')}</Message.Content>
              </Message>
            </>
          )}
        </Modal.Content>
      </Modal>
    </div>
  );
};

export default TopUp;
