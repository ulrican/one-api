import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Divider, Form, Grid, Header } from 'semantic-ui-react';
import {
  API,
  showError,
  showSuccess,
  timestamp2string,
  verifyJSON,
} from '../helpers';
import RatioAutoSetting from './RatioAutoSetting';

const OperationSetting = () => {
  const { t } = useTranslation();
  let now = new Date();
  let [inputs, setInputs] = useState({
    QuotaForNewUser: 0,
    QuotaForInviter: 0,
    QuotaForInvitee: 0,
    QuotaRemindThreshold: 0,
    PreConsumedQuota: 0,
    ModelRatio: '',
    CompletionRatio: '',
    GroupRatio: '',
    TopUpLink: '',
    ChatLink: '',
    QuotaPerUnit: 0,
    AutomaticDisableChannelEnabled: '',
    AutomaticEnableChannelEnabled: '',
    ChannelDisableThreshold: 0,
    LogConsumeEnabled: '',
    DisplayInCurrencyEnabled: '',
    DisplayTokenStatEnabled: '',
    ApproximateTokenEnabled: '',
    RetryTimes: 0,
    PayEnabled: '',
    PayAddress: '',
    EpayId: '',
    EpaySecret: '',
    PayPrice: 0,
    CheckInEnabled: '',
    CheckInMinReward: 0,
    CheckInMaxReward: 0,
    PlaygroundEnabled: '',
    RankingEnabled: '',
    MarketplaceEnabled: '',
    QiniuApiSecret: '',
    MarketplaceLastSyncTime: '',
    MinTopUp: 0,
    MaxTopUp: 0,
    TopupAmountOptions: '',
    // F11 渠道监控告警
    ChannelAlertEnabled: '',
    ChannelAlertWebhookUrl: '',
    ChannelAlertCooldownMinutes: 30,
    ChannelMetricEnabled: '',
  });
  const [originInputs, setOriginInputs] = useState({});
  let [loading, setLoading] = useState(false);
  let [marketSyncing, setMarketSyncing] = useState(false);
  let [historyTimestamp, setHistoryTimestamp] = useState(
    timestamp2string(now.getTime() / 1000 - 30 * 24 * 3600)
  ); // a month ago

  const getOptions = async () => {
    const res = await API.get('/api/option/');
    const { success, message, data } = res.data;
    if (success) {
      let newInputs = {};
      data.forEach((item) => {
        if (
          item.key === 'ModelRatio' ||
          item.key === 'GroupRatio' ||
          item.key === 'CompletionRatio'
        ) {
          item.value = JSON.stringify(JSON.parse(item.value), null, 2);
        }
        if (item.value === '{}') {
          item.value = '';
        }
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
      case 'monitor':
        if (
          originInputs['ChannelDisableThreshold'] !==
          inputs.ChannelDisableThreshold
        ) {
          await updateOption(
            'ChannelDisableThreshold',
            inputs.ChannelDisableThreshold
          );
        }
        if (
          originInputs['QuotaRemindThreshold'] !== inputs.QuotaRemindThreshold
        ) {
          await updateOption(
            'QuotaRemindThreshold',
            inputs.QuotaRemindThreshold
          );
        }
        if (
          originInputs['ChannelAlertWebhookUrl'] !==
          inputs.ChannelAlertWebhookUrl
        ) {
          await updateOption(
            'ChannelAlertWebhookUrl',
            inputs.ChannelAlertWebhookUrl
          );
        }
        if (
          originInputs['ChannelAlertCooldownMinutes'] !==
          inputs.ChannelAlertCooldownMinutes
        ) {
          await updateOption(
            'ChannelAlertCooldownMinutes',
            inputs.ChannelAlertCooldownMinutes
          );
        }
        break;
      case 'ratio':
        if (originInputs['ModelRatio'] !== inputs.ModelRatio) {
          if (!verifyJSON(inputs.ModelRatio)) {
            showError('模型倍率不是合法的 JSON 字符串');
            return;
          }
          await updateOption('ModelRatio', inputs.ModelRatio);
        }
        if (originInputs['GroupRatio'] !== inputs.GroupRatio) {
          if (!verifyJSON(inputs.GroupRatio)) {
            showError('分组倍率不是合法的 JSON 字符串');
            return;
          }
          await updateOption('GroupRatio', inputs.GroupRatio);
        }
        if (originInputs['CompletionRatio'] !== inputs.CompletionRatio) {
          if (!verifyJSON(inputs.CompletionRatio)) {
            showError('补全倍率不是合法的 JSON 字符串');
            return;
          }
          await updateOption('CompletionRatio', inputs.CompletionRatio);
        }
        break;
      case 'quota':
        if (originInputs['QuotaForNewUser'] !== inputs.QuotaForNewUser) {
          await updateOption('QuotaForNewUser', inputs.QuotaForNewUser);
        }
        if (originInputs['QuotaForInvitee'] !== inputs.QuotaForInvitee) {
          await updateOption('QuotaForInvitee', inputs.QuotaForInvitee);
        }
        if (originInputs['QuotaForInviter'] !== inputs.QuotaForInviter) {
          await updateOption('QuotaForInviter', inputs.QuotaForInviter);
        }
        if (originInputs['PreConsumedQuota'] !== inputs.PreConsumedQuota) {
          await updateOption('PreConsumedQuota', inputs.PreConsumedQuota);
        }
        break;
      case 'checkin':
        if (originInputs['CheckInMinReward'] !== inputs.CheckInMinReward) {
          await updateOption('CheckInMinReward', inputs.CheckInMinReward);
        }
        if (originInputs['CheckInMaxReward'] !== inputs.CheckInMaxReward) {
          await updateOption('CheckInMaxReward', inputs.CheckInMaxReward);
        }
        break;
      case 'marketplace':
        // QiniuApiSecret 后端不回显，留空表示不修改
        if (inputs.QiniuApiSecret) {
          await updateOption('QiniuApiSecret', inputs.QiniuApiSecret);
        }
        // MarketplaceEnabled 为复选框，勾选/取消时已即时保存，不可重复提交
        break;
      // RankingEnabled 为复选框，勾选/取消时已即时保存，无需提交（重复提交会被取反）
      case 'general':
        if (originInputs['TopUpLink'] !== inputs.TopUpLink) {
          await updateOption('TopUpLink', inputs.TopUpLink);
        }
        if (originInputs['ChatLink'] !== inputs.ChatLink) {
          await updateOption('ChatLink', inputs.ChatLink);
        }
        if (originInputs['QuotaPerUnit'] !== inputs.QuotaPerUnit) {
          await updateOption('QuotaPerUnit', inputs.QuotaPerUnit);
        }
        if (originInputs['RetryTimes'] !== inputs.RetryTimes) {
          await updateOption('RetryTimes', inputs.RetryTimes);
        }
        break;
      case 'pay':
        if (originInputs['PayAddress'] !== inputs.PayAddress) {
          await updateOption('PayAddress', inputs.PayAddress);
        }
        if (originInputs['EpayId'] !== inputs.EpayId) {
          await updateOption('EpayId', inputs.EpayId);
        }
        if (inputs.EpaySecret) {
          // 密钥留空（或后端未下发）表示不修改
          await updateOption('EpaySecret', inputs.EpaySecret);
        }
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
        // PayEnabled 为复选框，勾选/取消时已由 handleInputChange 即时保存，
        // 此处不可再次提交：updateOption 会对 *Enabled 键取反，重复提交会把刚保存的状态翻转
        break;
    }
  };

  const syncMarketplace = async () => {
    setMarketSyncing(true);
    try {
      const res = await API.post('/api/marketplace/sync');
      const { success, message, data } = res.data;
      if (success) {
        showSuccess(
          t('setting.operation.marketplace.sync_success', {
            count: data?.synced ?? 0,
          })
        );
        await getOptions();
        setInputs((inputs) => ({ ...inputs, QiniuApiSecret: '' }));
      } else {
        showError(message);
      }
    } catch (e) {
      showError(e?.message || 'sync failed');
    }
    setMarketSyncing(false);
  };

  const deleteHistoryLogs = async () => {
    console.log(inputs);
    const res = await API.delete(
      `/api/log/?target_timestamp=${Date.parse(historyTimestamp) / 1000}`
    );
    const { success, message, data } = res.data;
    if (success) {
      showSuccess(`${data} 条日志已清理！`);
      return;
    }
    showError('日志清理失败：' + message);
  };

  return (
    <Grid columns={1}>
      <Grid.Column>
        <Form loading={loading}>
          <Header as='h3'>{t('setting.operation.quota.title')}</Header>
          <Form.Group widths='equal'>
            <Form.Input
              label={t('setting.operation.quota.new_user')}
              name='QuotaForNewUser'
              onChange={handleInputChange}
              autoComplete='new-password'
              value={inputs.QuotaForNewUser}
              type='number'
              min='0'
              placeholder={t('setting.operation.quota.new_user_placeholder')}
            />
            <Form.Input
              label={t('setting.operation.quota.pre_consume')}
              name='PreConsumedQuota'
              onChange={handleInputChange}
              autoComplete='new-password'
              value={inputs.PreConsumedQuota}
              type='number'
              min='0'
              placeholder={t('setting.operation.quota.pre_consume_placeholder')}
            />
            <Form.Input
              label={t('setting.operation.quota.inviter_reward')}
              name='QuotaForInviter'
              onChange={handleInputChange}
              autoComplete='new-password'
              value={inputs.QuotaForInviter}
              type='number'
              min='0'
              placeholder={t(
                'setting.operation.quota.inviter_reward_placeholder'
              )}
            />
            <Form.Input
              label={t('setting.operation.quota.invitee_reward')}
              name='QuotaForInvitee'
              onChange={handleInputChange}
              autoComplete='new-password'
              value={inputs.QuotaForInvitee}
              type='number'
              min='0'
              placeholder={t(
                'setting.operation.quota.invitee_reward_placeholder'
              )}
            />
          </Form.Group>
          <Form.Button
            onClick={() => {
              submitConfig('quota').then();
            }}
          >
            {t('setting.operation.quota.buttons.save')}
          </Form.Button>
          <Divider />
          <Header as='h3'>{t('setting.operation.checkin.title')}</Header>
          <Form.Group widths='equal'>
            <Form.Checkbox
              label={t('setting.operation.checkin.enabled')}
              name='CheckInEnabled'
              onChange={handleInputChange}
              checked={inputs.CheckInEnabled === 'true' || inputs.CheckInEnabled === true}
            />
            <Form.Input
              label={t('setting.operation.checkin.min')}
              name='CheckInMinReward'
              onChange={handleInputChange}
              value={inputs.CheckInMinReward}
              type='number'
              min='0'
            />
            <Form.Input
              label={t('setting.operation.checkin.max')}
              name='CheckInMaxReward'
              onChange={handleInputChange}
              value={inputs.CheckInMaxReward}
              type='number'
              min='0'
            />
          </Form.Group>
          <Form.Button
            onClick={() => {
              submitConfig('checkin').then();
            }}
          >
            {t('setting.operation.checkin.buttons.save')}
          </Form.Button>
          <Divider />
          <Header as='h3'>{t('setting.operation.ranking.title')}</Header>
          <Form.Group widths='equal'>
            <Form.Checkbox
              label={t('setting.operation.ranking.enabled')}
              name='RankingEnabled'
              onChange={handleInputChange}
              checked={inputs.RankingEnabled === 'true' || inputs.RankingEnabled === true}
            />
          </Form.Group>
          <Divider />
          <Header as='h3'>{t('setting.operation.marketplace.title')}</Header>
          <Form.Group widths='equal'>
            <Form.Checkbox
              label={t('setting.operation.marketplace.enabled')}
              name='MarketplaceEnabled'
              onChange={handleInputChange}
              checked={
                inputs.MarketplaceEnabled === 'true' ||
                inputs.MarketplaceEnabled === true
              }
            />
          </Form.Group>
          <Form.Group widths='equal'>
            <Form.Input
              label={t('setting.operation.marketplace.secret')}
              name='QiniuApiSecret'
              onChange={handleInputChange}
              autoComplete='new-password'
              value={inputs.QiniuApiSecret || ''}
              type='password'
              placeholder={t(
                'setting.operation.marketplace.secret_placeholder'
              )}
            />
            <Form.Input
              label={t('setting.operation.marketplace.last_sync')}
              value={
                inputs.MarketplaceLastSyncTime ||
                t('setting.operation.marketplace.last_sync_never')
              }
              readOnly
            />
          </Form.Group>
          <Form.Button
            onClick={() => {
              submitConfig('marketplace').then();
            }}
          >
            {t('setting.operation.marketplace.buttons.save')}
          </Form.Button>
          <Form.Button
            onClick={() => {
              syncMarketplace().then();
            }}
            loading={marketSyncing}
            style={{ marginLeft: 8 }}
          >
            {marketSyncing
              ? t('setting.operation.marketplace.syncing')
              : t('setting.operation.marketplace.sync_now')}
          </Form.Button>
          <Divider />
          <Header as='h3'>{t('setting.operation.ratio.title')}</Header>
          <Form.Group widths='equal'>
            <Form.TextArea
              label={t('setting.operation.ratio.model.title')}
              name='ModelRatio'
              onChange={handleInputChange}
              style={{ minHeight: 250, fontFamily: 'JetBrains Mono, Consolas' }}
              autoComplete='new-password'
              value={inputs.ModelRatio}
              placeholder={t('setting.operation.ratio.model.placeholder')}
            />
          </Form.Group>
          <Form.Group widths='equal'>
            <Form.TextArea
              label={t('setting.operation.ratio.completion.title')}
              name='CompletionRatio'
              onChange={handleInputChange}
              style={{ minHeight: 250, fontFamily: 'JetBrains Mono, Consolas' }}
              autoComplete='new-password'
              value={inputs.CompletionRatio}
              placeholder={t('setting.operation.ratio.completion.placeholder')}
            />
          </Form.Group>
          <Form.Group widths='equal'>
            <Form.TextArea
              label={t('setting.operation.ratio.group.title')}
              name='GroupRatio'
              onChange={handleInputChange}
              style={{ minHeight: 250, fontFamily: 'JetBrains Mono, Consolas' }}
              autoComplete='new-password'
              value={inputs.GroupRatio}
              placeholder={t('setting.operation.ratio.group.placeholder')}
            />
          </Form.Group>
          <Form.Button
            onClick={() => {
              submitConfig('ratio').then();
            }}
          >
            {t('setting.operation.ratio.buttons.save')}
          </Form.Button>
          {/* Task4-3 倍率自动计算 + 分组倍率维护（与上方手动 JSON 区块并存） */}
          <RatioAutoSetting onRatioChanged={getOptions} />
          <Divider />
          <Header as='h3'>{t('setting.operation.log.title')}</Header>
          <Form.Group inline>
            <Form.Checkbox
              checked={inputs.LogConsumeEnabled === 'true'}
              label={t('setting.operation.log.enable_consume')}
              name='LogConsumeEnabled'
              onChange={handleInputChange}
            />
          </Form.Group>
          <Form.Group widths={4}>
            <Form.Input
              label={t('setting.operation.log.target_time')}
              value={historyTimestamp}
              type='datetime-local'
              name='history_timestamp'
              onChange={(e, { name, value }) => {
                setHistoryTimestamp(value);
              }}
            />
          </Form.Group>
          <Form.Button
            onClick={() => {
              deleteHistoryLogs().then();
            }}
          >
            {t('setting.operation.log.buttons.clean')}
          </Form.Button>

          <Divider />
          <Header as='h3'>{t('setting.operation.monitor.title')}</Header>
          <Form.Group widths={3}>
            <Form.Input
              label={t('setting.operation.monitor.max_response_time')}
              name='ChannelDisableThreshold'
              onChange={handleInputChange}
              autoComplete='new-password'
              value={inputs.ChannelDisableThreshold}
              type='number'
              min='0'
              placeholder={t(
                'setting.operation.monitor.max_response_time_placeholder'
              )}
            />
            <Form.Input
              label={t('setting.operation.monitor.quota_reminder')}
              name='QuotaRemindThreshold'
              onChange={handleInputChange}
              autoComplete='new-password'
              value={inputs.QuotaRemindThreshold}
              type='number'
              min='0'
              placeholder={t(
                'setting.operation.monitor.quota_reminder_placeholder'
              )}
            />
          </Form.Group>
          <Form.Group inline>
            <Form.Checkbox
              checked={inputs.AutomaticDisableChannelEnabled === 'true'}
              label={t('setting.operation.monitor.auto_disable')}
              name='AutomaticDisableChannelEnabled'
              onChange={handleInputChange}
            />
            <Form.Checkbox
              checked={inputs.AutomaticEnableChannelEnabled === 'true'}
              label={t('setting.operation.monitor.auto_enable')}
              name='AutomaticEnableChannelEnabled'
              onChange={handleInputChange}
            />
            <Form.Checkbox
              checked={
                inputs.ChannelMetricEnabled === 'true' ||
                inputs.ChannelMetricEnabled === true
              }
              label={t('setting.operation.monitor.channel_metric')}
              name='ChannelMetricEnabled'
              onChange={handleInputChange}
            />
            <Form.Checkbox
              checked={
                inputs.ChannelAlertEnabled === 'true' ||
                inputs.ChannelAlertEnabled === true
              }
              label={t('setting.operation.monitor.channel_alert')}
              name='ChannelAlertEnabled'
              onChange={handleInputChange}
            />
          </Form.Group>
          <Form.Group widths={2}>
            <Form.Input
              label={t('setting.operation.monitor.alert_webhook')}
              name='ChannelAlertWebhookUrl'
              onChange={handleInputChange}
              autoComplete='new-password'
              value={inputs.ChannelAlertWebhookUrl || ''}
              type='url'
              placeholder={t(
                'setting.operation.monitor.alert_webhook_placeholder'
              )}
            />
            <Form.Input
              label={t('setting.operation.monitor.alert_cooldown')}
              name='ChannelAlertCooldownMinutes'
              onChange={handleInputChange}
              autoComplete='new-password'
              value={inputs.ChannelAlertCooldownMinutes}
              type='number'
              min='1'
            />
          </Form.Group>
          <Form.Button
            onClick={() => {
              submitConfig('monitor').then();
            }}
          >
            {t('setting.operation.monitor.buttons.save')}
          </Form.Button>

          <Divider />
          <Header as='h3'>{t('setting.operation.general.title')}</Header>
          <Form.Group widths={4}>
            <Form.Input
              label={t('setting.operation.general.topup_link')}
              name='TopUpLink'
              onChange={handleInputChange}
              autoComplete='new-password'
              value={inputs.TopUpLink}
              type='link'
              placeholder={t(
                'setting.operation.general.topup_link_placeholder'
              )}
            />
            <Form.Input
              label={t('setting.operation.general.chat_link')}
              name='ChatLink'
              onChange={handleInputChange}
              autoComplete='new-password'
              value={inputs.ChatLink}
              type='link'
              placeholder={t('setting.operation.general.chat_link_placeholder')}
            />
            <Form.Input
              label={t('setting.operation.general.quota_per_unit')}
              name='QuotaPerUnit'
              onChange={handleInputChange}
              autoComplete='new-password'
              value={inputs.QuotaPerUnit}
              type='number'
              step='0.01'
              placeholder={t(
                'setting.operation.general.quota_per_unit_placeholder'
              )}
            />
            <Form.Input
              label={t('setting.operation.general.retry_times')}
              name='RetryTimes'
              type={'number'}
              step='1'
              min='0'
              onChange={handleInputChange}
              autoComplete='new-password'
              value={inputs.RetryTimes}
              placeholder={t(
                'setting.operation.general.retry_times_placeholder'
              )}
            />
          </Form.Group>
          <Form.Group inline>
            <Form.Checkbox
              checked={inputs.DisplayInCurrencyEnabled === 'true'}
              label={t('setting.operation.general.display_in_currency')}
              name='DisplayInCurrencyEnabled'
              onChange={handleInputChange}
            />
            <Form.Checkbox
              checked={inputs.DisplayTokenStatEnabled === 'true'}
              label={t('setting.operation.general.display_token_stat')}
              name='DisplayTokenStatEnabled'
              onChange={handleInputChange}
            />
            <Form.Checkbox
              checked={inputs.ApproximateTokenEnabled === 'true'}
              label={t('setting.operation.general.approximate_token')}
              name='ApproximateTokenEnabled'
              onChange={handleInputChange}
            />
            <Form.Checkbox
              checked={
                inputs.PlaygroundEnabled === 'true' ||
                inputs.PlaygroundEnabled === true
              }
              label={t('setting.operation.general.playground_enabled')}
              name='PlaygroundEnabled'
              onChange={handleInputChange}
            />
          </Form.Group>
          <Form.Button
            onClick={() => {
              submitConfig('general').then();
            }}
          >
            {t('setting.operation.general.buttons.save')}
          </Form.Button>

          <Divider />
          <Header as='h3'>{t('setting.operation.pay.title')}</Header>
          <Form.Group inline>
            <Form.Checkbox
              checked={inputs.PayEnabled === 'true'}
              label={t('setting.operation.pay.enable')}
              name='PayEnabled'
              onChange={handleInputChange}
            />
          </Form.Group>
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

export default OperationSetting;
