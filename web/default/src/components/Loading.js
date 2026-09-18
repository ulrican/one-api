import React from 'react';

const Loading = ({ prompt: name = 'page', text }) => {
  return (
    <div className='app-loading'>
      <span className='app-loading-dots'>
        <span />
        <span />
        <span />
      </span>
      <span>{text || `加载${name}中...`}</span>
    </div>
  );
};

export default Loading;
