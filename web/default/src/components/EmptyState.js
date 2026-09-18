import React from 'react';
import { Icon } from 'semantic-ui-react';

// 空状态：图标 + 标题 + 描述 + 操作区（children）
const EmptyState = ({ icon = 'inbox', title, description, children }) => {
  return (
    <div className='empty-state'>
      <div className='empty-state-icon'>
        <Icon name={icon} />
      </div>
      {title && <div className='empty-state-title'>{title}</div>}
      {description && <div className='empty-state-desc'>{description}</div>}
      {children && <div className='empty-state-actions'>{children}</div>}
    </div>
  );
};

export default EmptyState;
