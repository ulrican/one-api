import React from 'react';
import { Card } from 'semantic-ui-react';
import SystemSetting from '../../components/SystemSetting';

// Task4-10 设置页面拆分：系统设置独立管理页（原 /setting「系统设置」Tab 迁出）
// Task4-10 调整：页面标题与侧栏菜单名重复，去除 Card.Header
const System = () => {
  return (
    <div className='dashboard-container'>
      <Card fluid className='chart-card'>
        <Card.Content>
          <SystemSetting />
        </Card.Content>
      </Card>
    </div>
  );
};

export default System;
