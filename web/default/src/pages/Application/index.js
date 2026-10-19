// Task4-6 应用管理页面（复刻令牌管理，应用凭证 APIKey 与令牌同源）
import React from 'react';
import { Card } from 'semantic-ui-react';
import { useTranslation } from 'react-i18next';
import ApplicationsTable from './ApplicationsTable';
import './application.css';

const Application = () => {
  const { t } = useTranslation();
  return (
    <div className='dashboard-container'>
      <Card fluid className='chart-card'>
        <Card.Content>
          <Card.Header className='header'>{t('application.title')}</Card.Header>
          <ApplicationsTable />
        </Card.Content>
      </Card>
    </div>
  );
};

export default Application;
