import React from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { Card, Tab } from 'semantic-ui-react';
import PaymentSetting from '../../components/PaymentSetting';
import RedemptionsTable from '../../components/RedemptionsTable';
import PackageManage from '../../components/PackageManage';

// Task4-10 设置页面拆分：支付设置独立管理页（从原 /setting「运营设置」Tab 的支付区块拆出）
// Task4-10 调整：① 去除与侧栏菜单重复的页面标题；
// ② 兑换（兑换码管理）与支付设置同属支付模块，合并为本页顶部两个 Tab；
//    /redemption 旧路由重定向到 /payment?tab=redemption（EditRedemption 保存后返回链路不变）。
// Task4-11：新增第 3 个 Tab「套餐管理」（套餐自助升级的模版维护）
// Tab 选中态与 URL query 同步：tab=redemption | payment | packages（默认 payment）
const Payment = () => {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const activeTab = ['redemption', 'packages'].includes(tabParam)
    ? tabParam
    : 'payment';

  const panes = [
    {
      menuItem: t('header.redemption'),
      paneKey: 'redemption',
      render: () => (
        <Tab.Pane attached={false}>
          <RedemptionsTable />
        </Tab.Pane>
      ),
    },
    {
      menuItem: t('setting.tabs.payment'),
      paneKey: 'payment',
      render: () => (
        <Tab.Pane attached={false}>
          <PaymentSetting />
        </Tab.Pane>
      ),
    },
    {
      menuItem: t('payment.tabs.packages'),
      paneKey: 'packages',
      render: () => (
        <Tab.Pane attached={false}>
          <PackageManage />
        </Tab.Pane>
      ),
    },
  ];

  return (
    <div className='dashboard-container'>
      <Card fluid className='chart-card'>
        <Card.Content>
          <Tab
            activeIndex={panes.findIndex((p) => p.paneKey === activeTab)}
            onTabChange={(e, { activeIndex }) => {
              const key = panes[activeIndex].paneKey;
              if (key === 'payment') {
                setSearchParams({}, { replace: true });
              } else {
                setSearchParams({ tab: key }, { replace: true });
              }
            }}
            menu={{
              secondary: true,
              pointing: true,
              className: 'settings-tab',
            }}
            panes={panes}
          />
        </Card.Content>
      </Card>
    </div>
  );
};

export default Payment;
