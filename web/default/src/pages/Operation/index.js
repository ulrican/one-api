import React from 'react';
import { Card } from 'semantic-ui-react';
import OperationSetting from '../../components/OperationSetting';

// Task4-10 设置页面拆分：运营设置独立管理页（原 /setting「运营设置」Tab 迁出）
// Task4-10 调整：页面标题与侧栏菜单名重复，去除 Card.Header
const Operation = () => {
  return (
    <div className='dashboard-container'>
      <Card fluid className='chart-card'>
        <Card.Content>
          <OperationSetting />
        </Card.Content>
      </Card>
    </div>
  );
};

export default Operation;
