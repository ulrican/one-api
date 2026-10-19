import React from 'react';
import { Card } from 'semantic-ui-react';
import SiteSetting from '../../components/SiteSetting';

// Task4-10 设置页面拆分：站点设置独立管理页（原 /setting「其他设置」Tab 迁出，OtherSetting 重命名为 SiteSetting）
// Task4-10 调整：页面标题与侧栏菜单名重复，去除 Card.Header
const Site = () => {
  return (
    <div className='dashboard-container'>
      <Card fluid className='chart-card'>
        <Card.Content>
          <SiteSetting />
        </Card.Content>
      </Card>
    </div>
  );
};

export default Site;
