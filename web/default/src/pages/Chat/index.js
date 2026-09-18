import React from 'react';
import { Link } from 'react-router-dom';
import { Button, Icon } from 'semantic-ui-react';
import { useTranslation } from 'react-i18next';
import EmptyState from '../../components/EmptyState';

const Chat = () => {
  const { t } = useTranslation();
  const chatLink = localStorage.getItem('chat_link');

  if (!chatLink) {
    return (
      <EmptyState
        icon='comments'
        title={t('chat.empty.title')}
        description={t('chat.empty.description')}
      >
        <Button primary as={Link} to='/'>
          {t('chat.empty.back_home')}
        </Button>
      </EmptyState>
    );
  }

  return (
    <div className='chat-shell'>
      <div className='chat-shell-bar'>
        <div className='chat-shell-title'>
          <Icon name='comments' />
          {t('chat.title')}
        </div>
        <a
          className='chat-shell-link'
          href={chatLink}
          target='_blank'
          rel='noreferrer'
        >
          <Icon name='external square alternate' />
          {t('chat.open_new')}
        </a>
      </div>
      <iframe src={chatLink} title='web-chat' />
    </div>
  );
};

export default Chat;
