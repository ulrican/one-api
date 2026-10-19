import React from 'react';
import { Card } from 'semantic-ui-react';
import PersonalSetting from '../../components/PersonalSetting';

// Task4-10 设置页面瘦身：/setting 仅保留个人设置，单页直出无 Tab。
// Task4-10 调整：页面标题与侧栏菜单名重复，去除 Card.Header。
// 原管理员「运营/系统/其他」三个 Tab 拆至独立管理页：
// /operation、/payment、/system、/site（见 navConfig.js admin 组）
const Setting = () => {
  return (
    <div className='dashboard-container'>
      <Card fluid className='chart-card'>
        <Card.Content>
          <PersonalSetting />
        </Card.Content>
      </Card>
    </div>
  );
};

export default Setting;
